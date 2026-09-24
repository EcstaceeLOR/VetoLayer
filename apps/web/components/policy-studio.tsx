"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeterministicCondition, Policy } from "@vetolayer/core";

const LOCAL_KEY = "vetolayer:policy-studio";

type Draft = {
  id: string;
  name: string;
  description: string;
  mode: "deterministic" | "contextual";
  severity: "low" | "medium" | "high" | "critical";
  priority: string;
  enabled: boolean;
  tools: string;
  environments: string;
  evidence: string;
  exceptionDescription: string;
  exceptionCriteria: string;
  effect: "allow" | "review" | "block";
  match: "all" | "any";
  conditions: string;
  instruction: string;
  decisionCriteria: string;
};

type SimulationResult = {
  outcome: "ALLOW" | "REVIEW" | "BLOCK";
  summary: string;
  deterministicFindings: Array<{ summary: string; status: string }>;
  contextualFindings: Array<{ summary: string; status: string }>;
  missingEvidence: Array<{ description: string }>;
  trace: Array<{ step: string; status: string; summary: string }>;
  provider?: { providerStatus?: string; model?: string } | null;
};

const blankDraft: Draft = {
  id: "new-policy",
  name: "",
  description: "",
  mode: "deterministic",
  severity: "high",
  priority: "50",
  enabled: true,
  tools: "github",
  environments: "production",
  evidence: "",
  exceptionDescription: "",
  exceptionCriteria: "",
  effect: "review",
  match: "all",
  conditions: "facts.approvalCount | less_than | 1",
  instruction: "Evaluate whether this action should proceed given the policy, supplied evidence, current context, and any documented exception.",
  decisionCriteria: "ALLOW only when the policy or a documented exception is fully supported by supplied evidence.\nREVIEW when evidence or exception criteria remain unresolved.\nBLOCK when the supplied context establishes a prohibited action.",
};

export function PolicyStudio({ initialPolicies }: { initialPolicies: Policy[] }) {
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialPolicies[0] ?? blankPolicy()));
  const [selectedId, setSelectedId] = useState(initialPolicies[0]?.id ?? "new");
  const [status, setStatus] = useState("Ready");
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    const local = localStorage.getItem(LOCAL_KEY);
    if (local) {
      try {
        const parsed = JSON.parse(local) as Policy[];
        if (Array.isArray(parsed) && parsed.length) setPolicies(parsed);
      } catch { /* ignore corrupt browser fallback */ }
    }

    fetch("/api/policies")
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("Policy API unavailable")))
      .then((payload: { policies?: Policy[]; persistence?: string }) => {
        if (!local && payload.policies?.length) setPolicies(payload.policies);
        setStatus(payload.persistence === "supabase" ? "Durable policy storage online" : "Browser persistence fallback");
      })
      .catch(() => setStatus("Working from local policy state"));
  }, []);

  const preview = useMemo(() => buildPolicy(draft), [draft]);
  const previewError = preview.ok ? null : preview.error;

  function selectPolicy(policy: Policy) {
    setSelectedId(policy.id);
    setDraft(toDraft(policy));
    setSimulation(null);
  }

  function newPolicy() {
    setSelectedId("new");
    setDraft({ ...blankDraft, id: `policy-${Date.now()}` });
    setSimulation(null);
  }

  async function savePolicy() {
    if (!preview.ok) return;
    setSaving(true);
    setStatus("Saving policy…");
    try {
      const response = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview.policy),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Policy validation failed.");
      const next = [...policies.filter((policy) => policy.id !== preview.policy.id), preview.policy];
      setPolicies(next);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      setSelectedId(preview.policy.id);
      setStatus(payload.persisted ? "Saved to workspace storage" : "Saved in browser fallback storage");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Policy could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function testPolicy() {
    if (!preview.ok) return;
    setSimulating(true);
    setSimulation(null);
    setStatus("Running real VetoLayer evaluation…");
    try {
      const response = await fetch("/api/policies/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: preview.policy }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Simulation failed.");
      setSimulation(payload as SimulationResult);
      setStatus("Simulation complete");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Simulation failed.");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="policyStudio">
      <aside className="policyStudioList">
        <div className="studioListHeader"><div><span>POLICY LIBRARY</span><strong>{policies.length} active drafts</strong></div><button onClick={newPolicy}>+ New</button></div>
        <div className="studioPolicyList">
          {policies.sort((a, b) => a.priority - b.priority).map((policy) => (
            <button key={policy.id} onClick={() => selectPolicy(policy)} className={selectedId === policy.id ? "studioPolicy active" : "studioPolicy"}>
              <div><span className={policy.mode === "contextual" ? "studioMode contextual" : "studioMode"}>{policy.mode === "contextual" ? "SERV" : "RULE"}</span><span className={`studioSeverity ${policy.severity}`}>{policy.severity}</span></div>
              <strong>{policy.name}</strong><small>{policy.description}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="policyEditor">
        <div className="policyEditorTop"><div><p className="eyebrow">POLICY STUDIO</p><h2>{selectedId === "new" ? "Create policy" : "Edit policy"}</h2></div><div className="studioStatus"><span className="pulse" /> {status}</div></div>

        <div className="policyModeSwitch" role="group" aria-label="Policy mode">
          <button className={draft.mode === "deterministic" ? "selected" : ""} onClick={() => setDraft({ ...draft, mode: "deterministic" })}><b>Deterministic</b><small>Hard, reproducible rules</small></button>
          <button className={draft.mode === "contextual" ? "selected" : ""} onClick={() => setDraft({ ...draft, mode: "contextual" })}><b>SERV contextual</b><small>Evidence + exceptions + judgment</small></button>
        </div>

        <div className="studioFormGrid">
          <label className="studioField span2">Policy name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Sensitive production change gate" /></label>
          <label className="studioField span2">Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What this policy protects and when it applies." /></label>
          <label className="studioField">Severity<select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value as Draft["severity"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
          <label className="studioField">Priority<input type="number" min="1" max="1000" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })} /></label>
          <label className="studioField">Tools<input value={draft.tools} onChange={(event) => setDraft({ ...draft, tools: event.target.value })} placeholder="github, stripe" /><small>Comma separated</small></label>
          <label className="studioField">Environments<input value={draft.environments} onChange={(event) => setDraft({ ...draft, environments: event.target.value })} placeholder="production" /><small>Comma separated</small></label>
        </div>

        {draft.mode === "deterministic" ? (
          <div className="studioRulePanel">
            <div className="studioPanelHeading"><div><span>HARD RULE</span><strong>No SERV call is needed for this policy.</strong></div><div className="inlineFields"><select value={draft.match} onChange={(event) => setDraft({ ...draft, match: event.target.value as Draft["match"] })}><option value="all">Match all</option><option value="any">Match any</option></select><select value={draft.effect} onChange={(event) => setDraft({ ...draft, effect: event.target.value as Draft["effect"] })}><option value="allow">ALLOW</option><option value="review">REVIEW</option><option value="block">BLOCK</option></select></div></div>
            <label className="studioField">Conditions<textarea className="mono" rows={5} value={draft.conditions} onChange={(event) => setDraft({ ...draft, conditions: event.target.value })} /><small>One per line: field | operator | JSON value. Example: facts.approvalCount | less_than | 1</small></label>
          </div>
        ) : (
          <div className="studioRulePanel contextualPanel">
            <div className="studioPanelHeading"><div><span>SERV JUDGMENT</span><strong>Only contextual ambiguity is sent to SERV.</strong></div><span className="servStudioBadge">SERV</span></div>
            <label className="studioField">Reasoning instruction<textarea rows={5} value={draft.instruction} onChange={(event) => setDraft({ ...draft, instruction: event.target.value })} /></label>
            <label className="studioField">Decision criteria<textarea rows={5} value={draft.decisionCriteria} onChange={(event) => setDraft({ ...draft, decisionCriteria: event.target.value })} /><small>One criterion per line.</small></label>
          </div>
        )}

        <div className="studioFormGrid secondaryFields">
          <label className="studioField span2">Required evidence<textarea rows={3} value={draft.evidence} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })} placeholder="approval | review-approval | Current human approval | 86400" /><small>One per line: key | type | description | optional max age seconds</small></label>
          <label className="studioField span2">Exception description<input value={draft.exceptionDescription} onChange={(event) => setDraft({ ...draft, exceptionDescription: event.target.value })} placeholder="Critical security remediation" /></label>
          <label className="studioField span2">Exception criteria<textarea rows={3} value={draft.exceptionCriteria} onChange={(event) => setDraft({ ...draft, exceptionCriteria: event.target.value })} placeholder="Active critical incident is verified\nRequired tests have passed\nAuthorized human approval exists" /></label>
        </div>

        {previewError ? <div className="studioValidation">{previewError}</div> : null}

        <div className="studioActionBar"><div><span className={`modeTag ${draft.mode === "contextual" ? "servMode" : ""}`}>{draft.mode === "contextual" ? "SERV contextual" : "Deterministic"}</span><small>{draft.enabled ? "Enabled" : "Disabled"}</small></div><div><button className="secondaryButton buttonReset" disabled={!preview.ok || simulating} onClick={testPolicy}>{simulating ? "Evaluating…" : "Test on sample action"}</button><button className="primaryButton buttonReset" disabled={!preview.ok || saving} onClick={savePolicy}>{saving ? "Saving…" : "Save policy"}</button></div></div>

        {simulation ? <SimulationPanel result={simulation} /> : null}
      </section>
    </div>
  );
}

function SimulationPanel({ result }: { result: SimulationResult }) {
  const findings = [...result.deterministicFindings, ...result.contextualFindings];
  return (
    <section className="simulationPanel">
      <div className="simulationHero"><div><span>SAMPLE ACTION RESULT</span><strong className={`simulationOutcome ${result.outcome.toLowerCase()}`}>{result.outcome}</strong></div><p>{result.summary}</p></div>
      <div className="simulationColumns">
        <div><span className="cardLabel">FINDINGS</span>{findings.length ? findings.map((finding, index) => <div className="simulationFinding" key={`${finding.summary}-${index}`}><i className={finding.status}>{finding.status}</i><p>{finding.summary}</p></div>) : <p className="studioMuted">No material finding was emitted.</p>}</div>
        <div><span className="cardLabel">EXECUTION TRACE</span>{result.trace.map((step, index) => <div className="simulationTrace" key={`${step.step}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p><b>{step.step}</b><small>{step.summary}</small></p></div>)}</div>
      </div>
      {result.missingEvidence.length ? <div className="simulationMissing"><span>MISSING EVIDENCE</span>{result.missingEvidence.map((item) => <p key={item.description}>{item.description}</p>)}</div> : null}
    </section>
  );
}

function buildPolicy(draft: Draft): { ok: true; policy: Policy } | { ok: false; error: string } {
  if (!draft.name.trim() || !draft.description.trim()) return { ok: false, error: "Name and description are required." };
  const priority = Number(draft.priority);
  if (!Number.isInteger(priority) || priority < 1 || priority > 1000) return { ok: false, error: "Priority must be an integer from 1 to 1000." };
  const requiredEvidence = parseEvidence(draft.evidence);
  if (!requiredEvidence.ok) return requiredEvidence;
  const exceptions = draft.exceptionDescription.trim() && draft.exceptionCriteria.trim()
    ? [{ id: `${draft.id}-exception`, description: draft.exceptionDescription.trim(), criteria: lines(draft.exceptionCriteria), requiredEvidence: requiredEvidence.items.map((item) => item.type) }]
    : [];
  const base = {
    id: draft.id.trim(), name: draft.name.trim(), description: draft.description.trim(), severity: draft.severity,
    priority, enabled: draft.enabled, requiredEvidence: requiredEvidence.items, exceptions,
    scope: { tools: csv(draft.tools), environments: csv(draft.environments) },
  };
  if (!base.id) return { ok: false, error: "Policy id is required." };

  if (draft.mode === "contextual") {
    const criteria = lines(draft.decisionCriteria);
    if (!draft.instruction.trim() || !criteria.length) return { ok: false, error: "SERV policies require an instruction and at least one decision criterion." };
    return { ok: true, policy: { ...base, mode: "contextual", instruction: draft.instruction.trim(), decisionCriteria: criteria } };
  }

  const parsedConditions = parseConditions(draft.conditions);
  if (!parsedConditions.ok) return parsedConditions;
  return { ok: true, policy: { ...base, mode: "deterministic", rule: { effect: draft.effect, match: draft.match, conditions: parsedConditions.items } } };
}

function parseConditions(value: string): { ok: true; items: DeterministicCondition[] } | { ok: false; error: string } {
  const items: DeterministicCondition[] = [];
  for (const [index, row] of lines(value).entries()) {
    const [field, operator, rawValue] = row.split("|").map((part) => part.trim());
    if (!field || !operator) return { ok: false, error: `Condition ${index + 1} must contain field | operator | value.` };
    if (!["equals","not_equals","greater_than","greater_than_or_equal","less_than","less_than_or_equal","in","not_in","exists","not_exists"].includes(operator)) return { ok: false, error: `Condition ${index + 1} uses an unsupported operator.` };
    let parsedValue: unknown = undefined;
    if (operator !== "exists" && operator !== "not_exists") {
      if (!rawValue) return { ok: false, error: `Condition ${index + 1} requires a JSON value.` };
      try { parsedValue = JSON.parse(rawValue); } catch { parsedValue = rawValue; }
    }
    items.push({ field, operator: operator as DeterministicCondition["operator"], ...(parsedValue !== undefined ? { value: parsedValue as DeterministicCondition["value"] } : {}) });
  }
  return items.length ? { ok: true, items } : { ok: false, error: "At least one deterministic condition is required." };
}

function parseEvidence(value: string): { ok: true; items: Array<{ key: string; type: string; description: string; required: true; maxAgeSeconds?: number }> } | { ok: false; error: string } {
  const items = [] as Array<{ key: string; type: string; description: string; required: true; maxAgeSeconds?: number }>;
  for (const [index, row] of lines(value).entries()) {
    const [key, type, description, age] = row.split("|").map((part) => part.trim());
    if (!key || !type || !description) return { ok: false, error: `Evidence row ${index + 1} must contain key | type | description.` };
    const maxAgeSeconds = age ? Number(age) : undefined;
    if (maxAgeSeconds !== undefined && (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0)) return { ok: false, error: `Evidence row ${index + 1} has an invalid max age.` };
    items.push({ key, type, description, required: true, ...(maxAgeSeconds ? { maxAgeSeconds } : {}) });
  }
  return { ok: true, items };
}

function toDraft(policy: Policy | ReturnType<typeof blankPolicy>): Draft {
  const evidence = policy.requiredEvidence.map((item) => [item.key, item.type, item.description, item.maxAgeSeconds ?? ""].join(" | ")).join("\n");
  const firstException = policy.exceptions[0];
  if (policy.mode === "contextual") return {
    id: policy.id, name: policy.name, description: policy.description, mode: "contextual", severity: policy.severity, priority: String(policy.priority), enabled: policy.enabled,
    tools: policy.scope?.tools?.join(", ") ?? "", environments: policy.scope?.environments?.join(", ") ?? "", evidence,
    exceptionDescription: firstException?.description ?? "", exceptionCriteria: firstException?.criteria.join("\n") ?? "",
    effect: "review", match: "all", conditions: blankDraft.conditions, instruction: policy.instruction, decisionCriteria: policy.decisionCriteria.join("\n"),
  };
  return {
    id: policy.id, name: policy.name, description: policy.description, mode: "deterministic", severity: policy.severity, priority: String(policy.priority), enabled: policy.enabled,
    tools: policy.scope?.tools?.join(", ") ?? "", environments: policy.scope?.environments?.join(", ") ?? "", evidence,
    exceptionDescription: firstException?.description ?? "", exceptionCriteria: firstException?.criteria.join("\n") ?? "",
    effect: policy.rule.effect, match: policy.rule.match,
    conditions: policy.rule.conditions.map((condition) => `${condition.field} | ${condition.operator}${condition.value !== undefined ? ` | ${JSON.stringify(condition.value)}` : ""}`).join("\n"),
    instruction: blankDraft.instruction, decisionCriteria: blankDraft.decisionCriteria,
  };
}

function blankPolicy(): Policy {
  return { id: blankDraft.id, name: "New policy", description: "Describe what this policy controls.", mode: "deterministic", severity: "high", priority: 50, enabled: true, requiredEvidence: [], exceptions: [], scope: { tools: ["github"], environments: ["production"] }, rule: { effect: "review", match: "all", conditions: [{ field: "facts.approvalCount", operator: "less_than", value: 1 }] } };
}
function lines(value: string) { return value.split("\n").map((line) => line.trim()).filter(Boolean); }
function csv(value: string) { const values = value.split(",").map((item) => item.trim()).filter(Boolean); return values.length ? values : undefined; }
