import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => this.handle(JSON.parse(String(event.data))));
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not connect to Chrome DevTools.")), { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}, session) {
    const id = this.nextId++;
    const payload = { id, method, params, ...(session ? { sessionId: session } : {}) };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
  }

  on(method, listener) {
    const list = this.listeners.get(method) || [];
    list.push(listener);
    this.listeners.set(method, list);
  }

  waitFor(method, session, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for CDP event ${method}`)), timeoutMs);
      const listener = (params, eventSession) => {
        if (session && eventSession !== session) return;
        clearTimeout(timeout);
        const list = this.listeners.get(method) || [];
        this.listeners.set(method, list.filter((candidate) => candidate !== listener));
        resolve(params);
      };
      this.on(method, listener);
    });
  }

  handle(message) {
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
      else pending.resolve(message.result || {});
      return;
    }
    if (!message.method) return;
    for (const listener of this.listeners.get(message.method) || []) listener(message.params || {}, message.sessionId);
  }

  close() {
    this.socket.close();
  }
}

const port = Number(process.env.E2E_PORT || 3400);
const chromePort = Number(process.env.E2E_CHROME_PORT || 9222);
const origin = `http://127.0.0.1:${port}`;
const artifacts = join(process.cwd(), "artifacts", "browser-e2e");
const chromeProfile = join("/tmp", `vetolayer-chrome-${process.pid}`);
mkdirSync(artifacts, { recursive: true });
rmSync(chromeProfile, { recursive: true, force: true });

const serverLines = [];
const browserEvents = [];
let server;
let chrome;
let cdp;
let sessionId;

try {
  server = spawn("pnpm", ["--dir", "apps/web", "exec", "next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI: "true",
      NODE_ENV: "production",
      VETOLAYER_E2E_MODE: "1",
      VETOLAYER_API_KEY: "vl_e2e_legacy_key",
      VETOLAYER_API_RATE_LIMIT_PER_MINUTE: "200",
      VETOLAYER_CREDENTIAL_ENCRYPTION_KEY: "reliability-only-browser-encryption-key-2026",
      SERV_API_KEY: "serv_e2e_unreachable",
      SERV_MODEL: "reliability-model",
      SERV_BASE_URL: "http://127.0.0.1:9",
      SERV_TIMEOUT_MS: "250",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  captureProcess(server, "server", serverLines);
  await waitForHttp(`${origin}/api/health`, 30_000);

  const chromeBin = findChrome();
  chrome = spawn(chromeBin, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${chromePort}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${chromeProfile}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  captureProcess(chrome, "chrome", browserEvents);

  const debuggerInfo = await waitForJson(`http://127.0.0.1:${chromePort}/json/version`, 20_000);
  cdp = await CdpClient.connect(debuggerInfo.webSocketDebuggerUrl);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  ({ sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true }));
  await Promise.all([
    cdp.send("Page.enable", {}, sessionId),
    cdp.send("Runtime.enable", {}, sessionId),
    cdp.send("Network.enable", {}, sessionId),
    cdp.send("Log.enable", {}, sessionId),
  ]);
  cdp.on("Runtime.exceptionThrown", (params) => browserEvents.push(`exception: ${JSON.stringify(params)}`));
  cdp.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error") browserEvents.push(`console-error: ${entry.source || "unknown"} ${entry.url || ""} ${entry.text}`);
  });
  cdp.on("Network.loadingFailed", (params) => browserEvents.push(`network-failed: ${params.errorText} ${params.blockedReason || ""}`));

  await navigate("/");
  assertIncludes(await bodyText(), "Give agents autonomy", "public product page renders");
  await screenshot("00-product");

  await navigate("/pricing");
  assertIncludes(await bodyText(), "Start governing agent actions for free", "pricing page renders real plan surface");

  await navigate("/login?mode=signin");
  assertIncludes(await bodyText(), "Return to your agent control plane.", "login page renders sign-in journey");
  await assertPerformance("login", await performanceSnapshot(), { domContentLoadedMs: 5_000, loadMs: 8_000, transferBytes: 4_000_000 });
  await screenshot("01-login");

  await navigate("/api/internal/reliability/session?profile=onboarding");
  await navigate("/onboarding");
  assertIncludes(await bodyText(), "Workspace", "onboarding wizard renders for a new identity");
  const workspaceCreated = await browserFetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceName: "Browser Onboarding", projectName: "Browser Project" }),
  });
  assert(workspaceCreated.status === 201, `workspace creation returned ${workspaceCreated.status}`);
  assert(workspaceCreated.json?.workspace?.name === "Browser Onboarding", "workspace creation returns the new onboarding workspace");
  const onboardingState = await browserFetch("/api/onboarding", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: workspaceCreated.json?.workspace?.id,
      projectId: workspaceCreated.json?.project?.id,
      environmentId: workspaceCreated.json?.currentEnvironment?.id,
      lastStep: 2,
    }),
  });
  assert(onboardingState.status === 200, `onboarding state persistence returned ${onboardingState.status}`);
  assert(onboardingState.json?.snapshot?.selected?.workspace?.name === "Browser Onboarding", "onboarding API returns the persisted workspace context");
  await screenshot("02-onboarding-workspace");

  await navigate("/api/internal/reliability/session?profile=operator");
  await navigate("/dashboard");
  assertIncludes(await bodyText(), "Production Gate", "operator reliability project scope is active");

  const integration = await browserFetch("/api/integrations/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ integration: "developer-api" }),
  });
  assert(integration.status === 200, `Developer API integration test returned ${integration.status}`);
  assert(integration.json?.result?.ok === true, "Developer API integration reports ready");

  const policyFixture = await browserFetch("/api/internal/reliability/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create_policy" }),
  });
  assert(policyFixture.status === 201, `policy fixture returned ${policyFixture.status}`);
  await navigate("/dashboard/policies");
  assertIncludes(await bodyText(), "Policy Studio", "Policy Studio renders policy state");

  const keyFixture = await browserFetch("/api/internal/reliability/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create_key" }),
  });
  assert(keyFixture.status === 201, `API key fixture returned ${keyFixture.status}`);
  const keyId = keyFixture.json?.key?.id;
  const apiKey = keyFixture.json?.secret;
  assert(typeof keyId === "string" && typeof apiKey === "string", "scoped API key was created");

  await navigate("/dashboard/developers");
  assertIncludes(await bodyText(), "Developer Console", "Developer Console renders credential management surface");
  await screenshot("03-developer-console");

  const action = {
    id: "e2e_refund_provider_degraded",
    actor: { id: "e2e_agent", kind: "agent", name: "Reliability Agent" },
    action: {
      type: "customer-refund",
      tool: "payments-api",
      operation: "issue-refund",
      arguments: { amount: 620, currency: "USD", reason: "duplicate charge" },
    },
    target: { type: "payment", id: "pay_e2e_620" },
    context: { source: "browser-reliability", attributes: { customerTier: "business" } },
    requestedAt: new Date().toISOString(),
  };
  const contextualPolicy = {
    id: "e2e_contextual_provider_health",
    name: "Provider degradation must fail closed",
    description: "Exercises contextual reasoning while the provider endpoint is intentionally unavailable.",
    severity: "high",
    priority: 100,
    enabled: true,
    requiredEvidence: [],
    exceptions: [],
    mode: "contextual",
    instruction: "Allow only when contextual evidence clearly supports the refund.",
    decisionCriteria: ["Assess the proposed refund context and never infer missing evidence."],
  };
  const evaluationPayload = { action, policies: [contextualPolicy], evidence: [], facts: { customerRisk: "normal" } };
  const evaluated = await browserFetch("/api/v1/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(evaluationPayload),
  });
  assert(evaluated.status === 200, `evaluation returned ${evaluated.status}: ${evaluated.text}`);
  assert(evaluated.json?.decision?.outcome === "REVIEW", `provider degradation returned ${evaluated.json?.decision?.outcome}, expected REVIEW`);
  assert(evaluated.json?.providerTrace?.providerStatus === "fallback", "failed SERV request is visible as fallback provider trace");
  const receiptId = evaluated.json?.receipt?.receiptId;
  assert(typeof receiptId === "string", "evaluation produced a receipt id");
  assert(evaluated.json?.receipt?.receiptId === receiptId, "evaluation response exposes the immutable Decision Receipt");
  assert(evaluated.json?.receipt?.outcome === "REVIEW", "receipt exposes the fail-closed REVIEW outcome");
  assert(Array.isArray(evaluated.json?.receipt?.policiesEvaluated), "receipt includes evaluated policy metadata");
  assert(evaluated.json?.receipt?.providerTrace?.providerStatus === "fallback", "receipt preserves provider degradation trace metadata");

  const revoked = await browserFetch("/api/internal/reliability/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "revoke_key", id: keyId }),
  });
  assert(revoked.status === 200, `API key revocation returned ${revoked.status}`);
  const rejectedAfterRevoke = await browserFetch("/api/v1/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(evaluationPayload),
  });
  assert(rejectedAfterRevoke.status === 401, `revoked key returned ${rejectedAfterRevoke.status}, expected 401`);
  assert(rejectedAfterRevoke.json?.error?.code === "INVALID_API_KEY", "revoked key is rejected by the real Developer API auth boundary");

  const reviewJourney = await browserFetch("/api/internal/reliability/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "review_journey" }),
  });
  assert(reviewJourney.status === 200, `real review re-evaluation returned ${reviewJourney.status}`);
  assert(reviewJourney.json?.initialOutcome === "REVIEW", "real review workflow starts from REVIEW");
  assert(reviewJourney.json?.resolutionReceiptId !== reviewJourney.json?.initialReceiptId, "real Human Review re-evaluation creates a new immutable receipt");
  assert(reviewJourney.json?.parentReceiptId === reviewJourney.json?.initialReceiptId, "review re-evaluation preserves receipt lineage");
  await navigate("/dashboard/reviews");
  assertIncludes(await bodyText(), "Human Review", "Human Review surface renders");
  await screenshot("04-human-review");

  await navigate("/dashboard/decisions");
  await assertPerformance("decision-explorer", await performanceSnapshot(), { domContentLoadedMs: 6_000, loadMs: 9_000, transferBytes: 5_000_000 });

  const qaRoutes = [
    "/dashboard",
    "/dashboard/analytics",
    "/dashboard/decisions",
    "/dashboard/policies",
    "/dashboard/reviews",
    "/dashboard/integrations",
    "/dashboard/developers",
    "/dashboard/notifications",
    "/dashboard/settings",
    "/dashboard/audit",
    "/dashboard/billing",
    "/dashboard/data",
    "/dashboard/docs",
    "/dashboard/workspace",
    "/account",
  ];
  for (const path of qaRoutes) {
    const consoleCountBefore = actionableConsoleErrors().length;
    await navigate(path);
    const text = await bodyText();
    assert(!text.includes("Application error"), `${path} does not collapse into a generic application error`);
    assert(!text.includes("Internal Server Error"), `${path} does not expose a raw server error`);
    const routeErrors = actionableConsoleErrors().slice(consoleCountBefore);
    assert(routeErrors.length === 0, `${path} emitted no browser console errors: ${routeErrors.join(" | ")}`);
  }

  const exceptions = browserEvents.filter((line) => line.startsWith("exception:"));
  const consoleErrors = actionableConsoleErrors();
  assert(exceptions.length === 0, `browser recorded ${exceptions.length} unhandled runtime exception(s)`);
  assert(consoleErrors.length === 0, `browser recorded ${consoleErrors.length} actionable console error(s): ${consoleErrors.join(" | ")}`);

  await navigate("/qa-route-that-does-not-exist");
  assertIncludes(await bodyText(), "This VetoLayer page does not exist.", "global 404 is branded and actionable");
  await screenshot("05-route-sweep-complete");

  const summary = {
    status: "passed",
    origin,
    budgets: {
      login: { domContentLoadedMs: 5_000, loadMs: 8_000, transferBytes: 4_000_000 },
      decisionExplorer: { domContentLoadedMs: 6_000, loadMs: 9_000, transferBytes: 5_000_000 },
    },
    receiptId,
    providerStatus: evaluated.json?.providerTrace?.providerStatus,
    routesChecked: qaRoutes,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(join(artifacts, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("Browser E2E reliability suite passed.");
} catch (error) {
  try { if (cdp && sessionId) await screenshot("failure"); } catch {}
  writeFileSync(join(artifacts, "failure.txt"), error instanceof Error ? `${error.stack || error.message}\n` : `${String(error)}\n`);
  console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(join(artifacts, "browser-events.log"), `${browserEvents.join("\n")}\n`);
  writeFileSync(join(artifacts, "server.log"), `${serverLines.join("\n")}\n`);
  try { cdp?.close(); } catch {}
  terminate(chrome);
  terminate(server);
  try { rmSync(chromeProfile, { recursive: true, force: true }); } catch {}
}

async function navigate(path) {
  const loaded = cdp.waitFor("Page.loadEventFired", sessionId, 15_000);
  await cdp.send("Page.navigate", { url: path.startsWith("http") ? path : `${origin}${path}` }, sessionId);
  await loaded;
  await delay(150);
}

async function browserFetch(path, init = {}) {
  const expression = `(async () => {
    const response = await fetch(${JSON.stringify(path)}, ${JSON.stringify({ ...init, credentials: "include" })});
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: response.status, text, json, headers: Object.fromEntries(response.headers.entries()) };
  })()`;
  return evaluate(expression);
}

async function bodyText() {
  return evaluate("document.body ? document.body.innerText : ''");
}

async function performanceSnapshot() {
  return evaluate(`(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    return {
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd || 0),
      loadMs: Math.round(navigation?.loadEventEnd || 0),
      transferBytes: Math.round(resources.reduce((sum, item) => sum + (item.transferSize || 0), 0)),
    };
  })()`);
}

async function assertPerformance(label, actual, budget) {
  assert(actual.domContentLoadedMs <= budget.domContentLoadedMs, `${label} DOMContentLoaded ${actual.domContentLoadedMs}ms exceeded ${budget.domContentLoadedMs}ms`);
  assert(actual.loadMs <= budget.loadMs, `${label} load ${actual.loadMs}ms exceeded ${budget.loadMs}ms`);
  assert(actual.transferBytes <= budget.transferBytes, `${label} transfer ${actual.transferBytes} bytes exceeded ${budget.transferBytes}`);
  console.log(`✓ ${label} performance ${JSON.stringify(actual)}`);
}

async function screenshot(name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  writeFileSync(join(artifacts, `${name}.png`), Buffer.from(result.data, "base64"));
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed");
  return result.result?.value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

function assertIncludes(value, expected, message) {
  const actual = String(value).toLocaleLowerCase();
  const needle = String(expected).toLocaleLowerCase();
  assert(actual.includes(needle), `${message}; missing ${JSON.stringify(expected)}`);
}

function actionableConsoleErrors() {
  return browserEvents.filter((line) => {
    if (!line.startsWith("console-error:")) return false;
    if (line.includes("status of 401")) return false;
    if (line.includes("status of 404")) return false;
    return true;
  });
}

function findChrome() {
  const candidates = [process.env.CHROME_BIN, "google-chrome-stable", "google-chrome", "chromium", "chromium-browser"].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = spawnSync("which", [candidate], { encoding: "utf8" });
    if (resolved.status === 0 && resolved.stdout.trim()) return resolved.stdout.trim();
  }
  throw new Error("Chrome/Chromium was not found on the CI runner.");
}

function captureProcess(child, label, sink) {
  child.stdout?.on("data", (chunk) => sink.push(`${label}:stdout ${String(chunk).trimEnd()}`));
  child.stderr?.on("data", (chunk) => sink.push(`${label}:stderr ${String(chunk).trimEnd()}`));
}

function terminate(child) {
  if (!child || child.killed) return;
  try { child.kill("SIGTERM"); } catch {}
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForJson(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
