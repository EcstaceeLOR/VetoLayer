"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeterministicCondition, Policy } from "@vetolayer/core";
import {
  diffPolicyVersions,
  type ManagedPolicy,
  type PolicyConflict,
  type PolicyTemplate,
  type PolicyVersionRecord,
} from "../lib/policy-lifecycle";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Notice,
  OutcomeBadge,
  Select,
  Table,
  TableShell,
  Textarea,
} from "./ui/primitives";

type EnvironmentOption = { id: string; name: string; kind: string };
type PolicySnapshot = {
  policies: ManagedPolicy[];
  templates: PolicyTemplate[];
  persistence: "supabase" | "memory";
  selectedEnvironmentId: string;
  environments: EnvironmentOption[];
};
type HistoricalDecision = {
  id: string;
  createdAt: string;
  receipt: {
    receiptId: string;
    outcome: "ALLOW" | "REVIEW" | "BLOCK";
    action: { tool: string; operation: string; targetId?: string };
  };
};
type SimulationResult = {
  outcome: "ALLOW" | "REVIEW" | "BLOCK";
  summary: string;
  deterministicFindings: Array<{ summary: string; status: string }>;
  contextualFindings: Array<{ summary: string; status: string }>;
  missingEvidence: Array<{ description: string }>;
  trace: Array<{ step: string; status: string; summary: string }>;
  provider?: { providerStatus?: string; model?: string } | null;
  simulationSource: "sample" | "historical";
  historicalReceiptId?: string;
  historicalLimitations?: string[];
};

type EvidenceDraft = { rowId: string; key: string; type: string; description: string; maxAgeSeconds: string };
type ExceptionDraft = { rowId: string; description: string; criteria: string; requiredEvidence: string };
type ConditionValueType = "string" | "number" | "boolean" | "list" | "none";
type ConditionDraft = {
  rowId: string;
  field: string;
  operator: DeterministicCondition["operator"];
  valueType: ConditionValueType;
  value: string;
};
type Draft = {
  name: string;
  description: string;
  mode: "deterministic" | "contextual";
  severity: "low" | "medium" | "high" | "critical";
  priority: string;
  actionTypes: string;
  tools: string;
  actionEnvironments: string;
  targetEnvironmentIds: string[];
  evidence: EvidenceDraft[];
  exceptions: ExceptionDraft[];
  effect: "allow" | "review" | "block";
  match: "all" | "any";
  conditions: ConditionDraft[];
  instruction: string;
  decisionCriteria: string;
  changeNote: string;
};

class PolicyApiError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const blankPolicy: Policy = {
  id: "new-policy",
  name: "New governance policy",
  description: "Describe the autonomous action this policy governs and why the control exists.",
  mode: "deterministic",
  severity: "high",
  priority: 50,
  enabled: false,
  requiredEvidence: [],
  exceptions: [],
  scope: { environments: ["production"] },
  rule: { effect: "review", match: "all", conditions: [{ field: "facts.riskScore", operator: "greater_than_or_equal", value: 70 }] },
};

function rowId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `row_${Date.now()}_${Math.random()}`;
}

export function PolicyStudio({
  canWrite,
  projectName,
  initialFocusPolicyId,
  initialFocusVersion,
}: {
  canWrite: boolean;
  projectName: string;
  initialFocusPolicyId?: string;
  initialFocusVersion?: number;
}) {
  const [snapshot, setSnapshot] = useState<PolicySnapshot | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState("Loading policy lifecycle…");
  const [busy, setBusy] = useState<string | null>(null);
  const [activationWarnings, setActivationWarnings] = useState<PolicyConflict[]>([]);
  const [compareVersionId, setCompareVersionId] = useState<string>("");
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simulationSource, setSimulationSource] = useState<"sample" | "historical">("sample");
  const [historicalDecisions, setHistoricalDecisions] = useState<HistoricalDecision[]>([]);
  const [historicalReceiptId, setHistoricalReceiptId] = useState("");

  const selectedPolicy = useMemo(() => snapshot?.policies.find((policy) => policy.policyId === selectedPolicyId) ?? null, [snapshot, selectedPolicyId]);
  const selectedVersion = useMemo(() => selectedPolicy?.versions.find((version) => version.id === selectedVersionId) ?? null, [selectedPolicy, selectedVersionId]);
  const compareVersion = useMemo(() => selectedPolicy?.versions.find((version) => version.id === compareVersionId) ?? null, [selectedPolicy, compareVersionId]);
  const diff = useMemo(() => selectedVersion && compareVersion ? diffPolicyVersions(compareVersion, selectedVersion) : [], [selectedVersion, compareVersion]);
  const editable = selectedVersion?.state === "draft" && canWrite;
  const preview = useMemo(() => draft ? buildPolicy(draft, selectedVersion?.policyId ?? "new-policy") : null, [draft, selectedVersion]);

  const selectVersion = useCallback((policyId: string, version: PolicyVersionRecord) => {
    setSelectedPolicyId(policyId);
    setSelectedVersionId(version.id);
    setDraft(toDraft(version));
    setCompareVersionId("");
    setActivationWarnings([]);
    setSimulation(null);
  }, []);

  const load = useCallback(async (preferredVersionId?: string) => {
    const response = await fetch("/api/policies", { cache: "no-store" });
    const payload = await readJson<PolicySnapshot>(response);
    setSnapshot(payload);
    setStatus(payload.persistence === "supabase" ? "Durable version history online" : "Development-only in-memory policy state");

    const entries = payload.policies.flatMap((policy) => policy.versions.map((version) => ({ policy, version })));
    const preferred = preferredVersionId ? entries.find((entry) => entry.version.id === preferredVersionId) : null;
    const current = selectedVersionId ? entries.find((entry) => entry.version.id === selectedVersionId) : null;
    const focusedPolicy = initialFocusPolicyId ? payload.policies.find((policy) => policy.policyId === initialFocusPolicyId) : null;
    const focusedVersion = focusedPolicy
      ? focusedPolicy.versions.find((version) => initialFocusVersion ? version.version === initialFocusVersion : version.state === "active")
        ?? focusedPolicy.versions.find((version) => version.state === "draft")
        ?? focusedPolicy.versions[0]
      : null;
    const firstPolicy = payload.policies[0];
    const firstVersion = firstPolicy?.versions.find((version) => version.state === "draft")
      ?? firstPolicy?.versions.find((version) => version.state === "active")
      ?? firstPolicy?.versions[0];
    const focused = focusedPolicy && focusedVersion ? { policy: focusedPolicy, version: focusedVersion } : null;
    const next = preferred ?? current ?? focused ?? (firstPolicy && firstVersion ? { policy: firstPolicy, version: firstVersion } : null);
    if (next) selectVersion(next.policy.policyId, next.version);
    else {
      setSelectedPolicyId(null);
      setSelectedVersionId(null);
      setDraft(null);
    }
  }, [initialFocusPolicyId, initialFocusVersion, selectVersion, selectedVersionId]);

  useEffect(() => {
    void load().catch((error) => setStatus(error instanceof Error ? error.message : "Policy Studio could not be loaded."));
    fetch("/api/decisions?limit=20", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : { decisions: [] })
      .then((payload: { decisions?: HistoricalDecision[] }) => setHistoricalDecisions(payload.decisions ?? []))
      .catch(() => setHistoricalDecisions([]));
    // Initial load only; subsequent lifecycle mutations call load explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mutate(action: string, payload: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const response = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      return await readJson<Record<string, unknown>>(response);
    } finally {
      setBusy(null);
    }
  }

  async function createFromTemplate(template: PolicyTemplate) {
    if (!snapshot) return;
    try {
      const result = await mutate("create_from_template", { templateId: template.id, targetEnvironmentIds: [snapshot.selectedEnvironmentId] });
      const version = result.version as PolicyVersionRecord;
      await load(version.id);
      setStatus(`Draft v${version.version} created from ${template.name}.`);
    } catch (error) { setStatus(errorMessage(error)); }
  }

  async function createBlank() {
    if (!snapshot) return;
    try {
      const result = await mutate("create_draft", { policy: blankPolicy, targetEnvironmentIds: [snapshot.selectedEnvironmentId], changeNote: "New blank policy" });
      const version = result.version as PolicyVersionRecord;
      await load(version.id);
      setStatus("Blank draft created. It will not govern actions until you activate it.");
    } catch (error) { setStatus(errorMessage(error)); }
  }

  async function saveDraft(): Promise<PolicyVersionRecord | null> {
    if (!selectedVersion || !draft || !preview?.ok) return null;
    try {
      const result = await mutate("save_draft", {
        versionId: selectedVersion.id,
        policy: preview.policy,
        targetEnvironmentIds: draft.targetEnvironmentIds,
        changeNote: draft.changeNote,
      });
      const version = result.version as PolicyVersionRecord;
      await load(version.id);
      setStatus(`Draft v${version.version} saved.`);
      return version;
    } catch (error) {
      setStatus(errorMessage(error));
      return null;
    }
  }

  async function editAsNewVersion() {
    if (!selectedVersion) return;
    try {
      const result = await mutate("edit_as_new_version", { versionId: selectedVersion.id, changeNote: `Changes based on v${selectedVersion.version}` });
      const version = result.version as PolicyVersionRecord;
      await load(version.id);
      setStatus(`Created editable draft v${version.version}. Published v${selectedVersion.version} remains immutable.`);
    } catch (error) { setStatus(errorMessage(error)); }
  }

  async function duplicateVersion() {
    if (!selectedVersion) return;
    try {
      const result = await mutate("duplicate_version", { versionId: selectedVersion.id });
      const version = result.version as PolicyVersionRecord;
      await load(version.id);
      setStatus("Policy duplicated as an independent draft.");
    } catch (error) { setStatus(errorMessage(error)); }
  }

  async function checkActivation() {
    if (!selectedVersion || !preview?.ok) return;
    let versionToActivate = selectedVersion;
    if (selectedVersion.state === "draft") {
      const saved = await saveDraft();
      if (!saved) return;
      versionToActivate = saved;
    }
    try {
      const result = await mutate("activation_check", { versionId: versionToActivate.id });
      const warnings = (result.warnings as PolicyConflict[]) ?? [];
      setActivationWarnings(warnings);
      if (warnings.some((warning) => warning.severity === "error")) {
        setStatus("Activation is blocked until policy conflicts are resolved.");
        return;
      }
      if (warnings.length) {
        setStatus("Review activation warnings before publishing.");
        return;
      }
      await activateVersion(false, versionToActivate.id);
    } catch (error) { setStatus(errorMessage(error)); }
  }

  async function activateVersion(confirmWarnings = false, versionId = selectedVersion?.id) {
    if (!versionId) return;
    try {
      const result = await mutate("activate_version", { versionId, confirmWarnings });
      const version = result.version as PolicyVersionRecord;
      setActivationWarnings([]);
      await load(version.id);
      setStatus(`v${version.version} is now active. Any previous active version was archived atomically.`);
    } catch (error) {
      if (error instanceof PolicyApiError && Array.isArray(error.details)) setActivationWarnings(error.details as PolicyConflict[]);
      setStatus(errorMessage(error));
    }
  }

  async function archiveVersion() {
    if (!selectedVersion) return;
    const label = selectedVersion.state === "active" ? "Deactivate this policy version? It will stop governing new actions." : "Archive this draft version?";
    if (!window.confirm(label)) return;
    try {
      const result = await mutate("archive_version", { versionId: selectedVersion.id });
      const version = result.version as PolicyVersionRecord;
      await load(version.id);
      setStatus(`v${version.version} archived.`);
    } catch (error) { setStatus(errorMessage(error)); }
  }

  async function runSimulation() {
    if (!preview?.ok) return;
    setBusy("simulate");
    setSimulation(null);
    try {
      const response = await fetch("/api/policies/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policy: preview.policy,
          ...(simulationSource === "historical" && historicalReceiptId ? { historicalReceiptId } : {}),
        }),
      });
      const result = await readJson<SimulationResult>(response);
      setSimulation(result);
      setStatus(`Simulation completed with ${result.outcome}. This does not activate the policy.`);
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setBusy(null); }
  }

  if (!snapshot) return <div className="policyLifecycleLoading" role="status">{status}</div>;

  return (
    <div className="policyLifecycleStudio">
      <aside className="policyLifecycleSidebar">
        <div className="policyLibraryHeader">
          <div><span className="vlEyebrow">Policy library</span><strong>{snapshot.policies.length} managed policies</strong></div>
          {canWrite ? <Button size="sm" tone="primary" onClick={() => void createBlank()}>New policy</Button> : null}
        </div>

        <div className="policyLifecycleList">
          {snapshot.policies.map((managed) => {
            const representative = managed.versions.find((version) => version.state === "draft") ?? managed.versions.find((version) => version.state === "active") ?? managed.versions[0];
            if (!representative) return null;
            return (
              <button key={managed.policyId} className={selectedPolicyId === managed.policyId ? "policyLifecycleItem active" : "policyLifecycleItem"} onClick={() => selectVersion(managed.policyId, representative)}>
                <div className="policyLifecycleItemTop"><PolicyStateBadge state={managed.state} /><span>v{representative.version}</span></div>
                <strong>{representative.policy.name}</strong>
                <small>{representative.policy.description}</small>
                <span className="policyTargetSummary">{representative.targetEnvironmentIds.length} target environment{representative.targetEnvironmentIds.length === 1 ? "" : "s"}</span>
              </button>
            );
          })}
          {!snapshot.policies.length ? <p className="policyLifecycleEmpty">No managed policies yet. Start from a template or create a blank draft.</p> : null}
        </div>

        {canWrite ? (
          <div className="policyTemplateShelf">
            <span className="vlEyebrow">Templates</span>
            {snapshot.templates.map((template) => (
              <button key={template.id} onClick={() => void createFromTemplate(template)} disabled={busy !== null}>
                <strong>{template.name}</strong><small>{template.description}</small><span>{template.category}</span>
              </button>
            ))}
          </div>
        ) : null}
      </aside>

      <main className="policyLifecycleMain">
        <div className="policyLifecycleStatusBar">
          <div><span className="pulse" aria-hidden="true" /><span>{status}</span></div>
          <div><Badge tone="neutral">{projectName}</Badge><Badge tone={snapshot.persistence === "supabase" ? "success" : "warning"}>{snapshot.persistence === "supabase" ? "Durable" : "Memory only"}</Badge></div>
        </div>

        {!selectedVersion || !draft ? (
          <Card className="policyLifecycleWelcome">
            <span className="vlEyebrow">Governance lifecycle</span>
            <h2>Draft safely. Publish deliberately. Preserve every decision&apos;s meaning.</h2>
            <p>Templates create normal editable drafts. A draft never governs production until an authorized user activates that exact immutable version.</p>
          </Card>
        ) : (
          <>
            <section className="policyVersionHero">
              <div>
                <div className="policyVersionBadges"><PolicyStateBadge state={selectedVersion.state} /><Badge tone="neutral">Version {selectedVersion.version}</Badge><Badge tone={selectedVersion.policy.mode === "contextual" ? "accent" : "info"}>{selectedVersion.policy.mode === "contextual" ? "SERV contextual" : "Deterministic"}</Badge></div>
                <h2>{draft.name || selectedVersion.policy.name}</h2>
                <p>{selectedVersion.state === "draft" ? "Editable draft — not used for live governance." : selectedVersion.state === "active" ? "Published and governing matching actions in its target environments." : "Immutable historical version. Reactivate it to roll back."}</p>
              </div>
              <div className="policyVersionActions">
                {selectedVersion.state !== "draft" && canWrite ? <Button onClick={() => void editAsNewVersion()} disabled={busy !== null}>Edit as new version</Button> : null}
                {canWrite ? <Button onClick={() => void duplicateVersion()} disabled={busy !== null}>Duplicate</Button> : null}
                {selectedVersion.state !== "archived" && canWrite ? <Button tone="danger" onClick={() => void archiveVersion()} disabled={busy !== null}>{selectedVersion.state === "active" ? "Deactivate" : "Archive draft"}</Button> : null}
                {selectedVersion.state === "archived" && canWrite ? <Button tone="primary" onClick={() => void checkActivation()} disabled={busy !== null}>Roll back to this version</Button> : null}
              </div>
            </section>

            <div className="policyLifecycleGrid">
              <section className="policyEditorV2">
                <Editor draft={draft} setDraft={setDraft} environments={snapshot.environments} editable={editable} />
                {preview && !preview.ok ? <Notice tone="danger" title="Policy validation">{preview.error}</Notice> : null}

                <div className="policyDraftActions">
                  <div><small>{editable ? "Saving keeps this version in Draft." : "Published content is read-only."}</small></div>
                  <div>
                    <Button onClick={() => void runSimulation()} disabled={!preview?.ok || busy !== null}>{busy === "simulate" ? "Simulating…" : "Test policy"}</Button>
                    {editable ? <Button onClick={() => void saveDraft()} disabled={!preview?.ok || busy !== null}>Save draft</Button> : null}
                    {selectedVersion.state !== "active" && canWrite ? <Button tone="primary" onClick={() => void checkActivation()} disabled={!preview?.ok || busy !== null}>{selectedVersion.state === "archived" ? "Check & roll back" : "Check & activate"}</Button> : null}
                  </div>
                </div>

                {activationWarnings.length ? (
                  <Card className="policyWarningsCard">
                    <span className="vlEyebrow">Activation review</span>
                    <h3>{activationWarnings.some((warning) => warning.severity === "error") ? "Resolve conflicts before publishing" : "Warnings require confirmation"}</h3>
                    <div className="policyWarningList">{activationWarnings.map((warning, index) => <div key={`${warning.code}-${index}`}><Badge tone={warning.severity === "error" ? "danger" : warning.severity === "warning" ? "warning" : "info"}>{warning.severity}</Badge><p>{warning.message}</p></div>)}</div>
                    {!activationWarnings.some((warning) => warning.severity === "error") ? <Button tone="primary" onClick={() => void activateVersion(true)} disabled={busy !== null}>Activate with reviewed warnings</Button> : null}
                  </Card>
                ) : null}

                <SimulationWorkbench
                  previewOk={Boolean(preview?.ok)}
                  source={simulationSource}
                  setSource={setSimulationSource}
                  historicalDecisions={historicalDecisions}
                  receiptId={historicalReceiptId}
                  setReceiptId={setHistoricalReceiptId}
                  result={simulation}
                  run={() => void runSimulation()}
                  busy={busy === "simulate"}
                />
              </section>

              <aside className="policyLifecycleRail">
                <VersionHistory managed={selectedPolicy!} selectedVersionId={selectedVersion.id} onSelect={(version) => selectVersion(selectedPolicy!.policyId, version)} />
                <VersionDiff selected={selectedVersion} versions={selectedPolicy!.versions} compareVersionId={compareVersionId} setCompareVersionId={setCompareVersionId} diff={diff} />
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Editor({ draft, setDraft, environments, editable }: { draft: Draft; setDraft: (draft: Draft) => void; environments: EnvironmentOption[]; editable: boolean }) {
  const patch = (next: Partial<Draft>) => setDraft({ ...draft, ...next });
  return (
    <Card className="policyEditorCard">
      <div className="policyEditorSection">
        <div className="policyEditorSectionHead"><span className="vlEyebrow">Identity & targeting</span><p>The project is fixed by your current workspace. Choose which project environments this version governs.</p></div>
        <div className="policyEditorFields">
          <Field label="Policy name"><Input disabled={!editable} value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
          <Field label="Severity"><Select disabled={!editable} value={draft.severity} onChange={(event) => patch({ severity: event.target.value as Draft["severity"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></Select></Field>
          <Field label="Priority" hint="Lower numbers evaluate first."><Input disabled={!editable} type="number" min={1} max={1000} value={draft.priority} onChange={(event) => patch({ priority: event.target.value })} /></Field>
          <Field label="Description" className="policySpanFull"><Textarea disabled={!editable} rows={3} value={draft.description} onChange={(event) => patch({ description: event.target.value })} /></Field>
          <Field label="Action types" hint="Comma separated; blank means any action type."><Input disabled={!editable} value={draft.actionTypes} onChange={(event) => patch({ actionTypes: event.target.value })} placeholder="deployment, source-control" /></Field>
          <Field label="Tools" hint="Comma separated; blank means any tool."><Input disabled={!editable} value={draft.tools} onChange={(event) => patch({ tools: event.target.value })} placeholder="github, stripe" /></Field>
          <Field label="Action environment labels" hint="Runtime labels such as production or staging."><Input disabled={!editable} value={draft.actionEnvironments} onChange={(event) => patch({ actionEnvironments: event.target.value })} placeholder="production" /></Field>
        </div>
        <div className="policyTargetPicker"><strong>Project environments</strong>{environments.map((environment) => <label key={environment.id}><input disabled={!editable} type="checkbox" checked={draft.targetEnvironmentIds.includes(environment.id)} onChange={() => patch({ targetEnvironmentIds: toggleValue(draft.targetEnvironmentIds, environment.id) })} /><span>{environment.name}<small>{environment.kind}</small></span></label>)}</div>
      </div>

      <div className="policyEditorSection">
        <div className="policyEditorSectionHead"><span className="vlEyebrow">Evaluation mode</span><p>Hard rules remain deterministic. Use SERV only where context and evidence genuinely require judgment.</p></div>
        <div className="policyModeCards"><button disabled={!editable} className={draft.mode === "deterministic" ? "active" : ""} onClick={() => patch({ mode: "deterministic" })}><strong>Deterministic</strong><small>Reproducible rule evaluation</small></button><button disabled={!editable} className={draft.mode === "contextual" ? "active" : ""} onClick={() => patch({ mode: "contextual" })}><strong>SERV contextual</strong><small>Evidence-aware reasoning</small></button></div>

        {draft.mode === "deterministic" ? (
          <div className="policyRuleBuilder">
            <div className="policyInlineFields"><Field label="When"><Select disabled={!editable} value={draft.match} onChange={(event) => patch({ match: event.target.value as Draft["match"] })}><option value="all">All conditions match</option><option value="any">Any condition matches</option></Select></Field><Field label="Outcome"><Select disabled={!editable} value={draft.effect} onChange={(event) => patch({ effect: event.target.value as Draft["effect"] })}><option value="allow">ALLOW</option><option value="review">REVIEW</option><option value="block">BLOCK</option></Select></Field></div>
            <StructuredConditions conditions={draft.conditions} disabled={!editable} onChange={(conditions) => patch({ conditions })} />
          </div>
        ) : (
          <div className="policyContextBuilder">
            <Field label="Reasoning instruction"><Textarea disabled={!editable} rows={5} value={draft.instruction} onChange={(event) => patch({ instruction: event.target.value })} /></Field>
            <Field label="Decision criteria" hint="One criterion per line."><Textarea disabled={!editable} rows={5} value={draft.decisionCriteria} onChange={(event) => patch({ decisionCriteria: event.target.value })} /></Field>
          </div>
        )}
      </div>

      <div className="policyEditorSection">
        <div className="policyEditorSectionHead"><span className="vlEyebrow">Evidence & exceptions</span><p>Define the evidence that must be present and the explicit exception paths reviewers may rely on.</p></div>
        <StructuredEvidence rows={draft.evidence} disabled={!editable} onChange={(evidence) => patch({ evidence })} />
        <StructuredExceptions rows={draft.exceptions} disabled={!editable} onChange={(exceptions) => patch({ exceptions })} />
      </div>

      <div className="policyEditorSection">
        <Field label="Version note" hint="Explain why this draft exists; the note stays with version history."><Input disabled={!editable} value={draft.changeNote} onChange={(event) => patch({ changeNote: event.target.value })} placeholder="Tighten production approval requirements" /></Field>
      </div>
    </Card>
  );
}

function StructuredConditions({ conditions, disabled, onChange }: { conditions: ConditionDraft[]; disabled: boolean; onChange: (value: ConditionDraft[]) => void }) {
  return <div className="structuredBuilder"><div className="structuredBuilderHead"><strong>Conditions</strong>{!disabled ? <Button size="sm" onClick={() => onChange([...conditions, { rowId: rowId(), field: "", operator: "equals", valueType: "string", value: "" }])}>Add condition</Button> : null}</div>{conditions.map((condition, index) => <div className="conditionRow" key={condition.rowId}><Input disabled={disabled} value={condition.field} onChange={(event) => onChange(replaceAt(conditions, index, { ...condition, field: event.target.value }))} placeholder="facts.approvalCount" /><Select disabled={disabled} value={condition.operator} onChange={(event) => { const operator = event.target.value as ConditionDraft["operator"]; onChange(replaceAt(conditions, index, { ...condition, operator, valueType: operator === "exists" || operator === "not_exists" ? "none" : condition.valueType === "none" ? "string" : condition.valueType })); }}>{conditionOperators.map((operator) => <option key={operator} value={operator}>{operator.replaceAll("_", " ")}</option>)}</Select>{condition.operator === "exists" || condition.operator === "not_exists" ? <span className="conditionNoValue">No value</span> : <><Select disabled={disabled} value={condition.valueType} onChange={(event) => onChange(replaceAt(conditions, index, { ...condition, valueType: event.target.value as ConditionValueType }))}><option value="string">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="list">List</option></Select>{condition.valueType === "boolean" ? <Select disabled={disabled} value={condition.value} onChange={(event) => onChange(replaceAt(conditions, index, { ...condition, value: event.target.value }))}><option value="true">True</option><option value="false">False</option></Select> : <Input disabled={disabled} value={condition.value} onChange={(event) => onChange(replaceAt(conditions, index, { ...condition, value: event.target.value }))} placeholder={condition.valueType === "list" ? "admin, security-lead" : "Value"} />}</>}{!disabled ? <Button size="sm" tone="ghost" onClick={() => onChange(conditions.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button> : null}</div>)}</div>;
}

function StructuredEvidence({ rows, disabled, onChange }: { rows: EvidenceDraft[]; disabled: boolean; onChange: (value: EvidenceDraft[]) => void }) {
  return <div className="structuredBuilder"><div className="structuredBuilderHead"><strong>Required evidence</strong>{!disabled ? <Button size="sm" onClick={() => onChange([...rows, { rowId: rowId(), key: "", type: "", description: "", maxAgeSeconds: "" }])}>Add evidence</Button> : null}</div>{rows.length ? rows.map((row, index) => <div className="evidenceBuilderRow" key={row.rowId}><Input disabled={disabled} value={row.key} onChange={(event) => onChange(replaceAt(rows, index, { ...row, key: event.target.value }))} placeholder="human-approval" /><Input disabled={disabled} value={row.type} onChange={(event) => onChange(replaceAt(rows, index, { ...row, type: event.target.value }))} placeholder="review-approval" /><Input disabled={disabled} value={row.description} onChange={(event) => onChange(replaceAt(rows, index, { ...row, description: event.target.value }))} placeholder="Verified approval from an authorized reviewer" /><Input disabled={disabled} type="number" min={1} value={row.maxAgeSeconds} onChange={(event) => onChange(replaceAt(rows, index, { ...row, maxAgeSeconds: event.target.value }))} placeholder="Max age sec" />{!disabled ? <Button size="sm" tone="ghost" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button> : null}</div>) : <p className="builderEmpty">No evidence requirement. Add one when the decision depends on external proof.</p>}</div>;
}

function StructuredExceptions({ rows, disabled, onChange }: { rows: ExceptionDraft[]; disabled: boolean; onChange: (value: ExceptionDraft[]) => void }) {
  return <div className="structuredBuilder"><div className="structuredBuilderHead"><strong>Exceptions</strong>{!disabled ? <Button size="sm" onClick={() => onChange([...rows, { rowId: rowId(), description: "", criteria: "", requiredEvidence: "" }])}>Add exception</Button> : null}</div>{rows.length ? rows.map((row, index) => <div className="exceptionBuilderRow" key={row.rowId}><Field label="Exception description"><Input disabled={disabled} value={row.description} onChange={(event) => onChange(replaceAt(rows, index, { ...row, description: event.target.value }))} placeholder="Critical security remediation" /></Field><Field label="Criteria" hint="One criterion per line."><Textarea disabled={disabled} rows={3} value={row.criteria} onChange={(event) => onChange(replaceAt(rows, index, { ...row, criteria: event.target.value }))} /></Field><Field label="Required evidence types" hint="Comma separated."><Input disabled={disabled} value={row.requiredEvidence} onChange={(event) => onChange(replaceAt(rows, index, { ...row, requiredEvidence: event.target.value }))} placeholder="ci-status, review-approval" /></Field>{!disabled ? <Button size="sm" tone="ghost" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>Remove exception</Button> : null}</div>) : <p className="builderEmpty">No exception path is configured.</p>}</div>;
}

function VersionHistory({ managed, selectedVersionId, onSelect }: { managed: ManagedPolicy; selectedVersionId: string; onSelect: (version: PolicyVersionRecord) => void }) {
  return <Card className="versionHistoryCard"><span className="vlEyebrow">Version history</span><h3>Immutable publication trail</h3><div className="versionTimeline">{managed.versions.map((version) => <button key={version.id} className={version.id === selectedVersionId ? "active" : ""} onClick={() => onSelect(version)}><span>v{version.version}</span><div><strong>{version.policy.name}</strong><small>{version.changeNote || (version.state === "active" ? "Published version" : "No version note")}</small><small>{new Date(version.updatedAt).toLocaleString()}</small></div><PolicyStateBadge state={version.state} /></button>)}</div></Card>;
}

function VersionDiff({ selected, versions, compareVersionId, setCompareVersionId, diff }: { selected: PolicyVersionRecord; versions: PolicyVersionRecord[]; compareVersionId: string; setCompareVersionId: (value: string) => void; diff: ReturnType<typeof diffPolicyVersions> }) {
  const candidates = versions.filter((version) => version.id !== selected.id);
  return <Card className="versionDiffCard"><span className="vlEyebrow">Version diff</span><h3>Compare policy meaning</h3>{candidates.length ? <><Select value={compareVersionId} onChange={(event) => setCompareVersionId(event.target.value)}><option value="">Select version to compare</option>{candidates.map((version) => <option key={version.id} value={version.id}>v{version.version} · {version.state}</option>)}</Select>{compareVersionId ? diff.length ? <TableShell><Table><thead><tr><th>Field</th><th>Before</th><th>Selected</th></tr></thead><tbody>{diff.map((entry) => <tr key={entry.field}><td><code>{entry.field}</code></td><td><span className="diffValue">{entry.before}</span></td><td><span className="diffValue">{entry.after}</span></td></tr>)}</tbody></Table></TableShell> : <Notice tone="success" title="No semantic changes">These versions have the same policy content and targets.</Notice> : null}</> : <p className="builderEmpty">Create another version to compare changes side by side.</p>}</Card>;
}

function SimulationWorkbench({ previewOk, source, setSource, historicalDecisions, receiptId, setReceiptId, result, run, busy }: { previewOk: boolean; source: "sample" | "historical"; setSource: (value: "sample" | "historical") => void; historicalDecisions: HistoricalDecision[]; receiptId: string; setReceiptId: (value: string) => void; result: SimulationResult | null; run: () => void; busy: boolean }) {
  return <Card className="simulationWorkbench"><div className="simulationWorkbenchHead"><div><span className="vlEyebrow">Simulation</span><h3>Test before activation</h3><p>Simulation never changes lifecycle state.</p></div><div className="simulationSourceSwitch"><Button size="sm" tone={source === "sample" ? "primary" : "secondary"} onClick={() => setSource("sample")}>Sample action</Button><Button size="sm" tone={source === "historical" ? "primary" : "secondary"} onClick={() => setSource("historical")}>Historical action</Button></div></div>{source === "historical" ? <Field label="Historical Decision Receipt" hint="Replays the preserved action identity and evidence. Some arbitrary original facts may not exist in the receipt."><Select value={receiptId} onChange={(event) => setReceiptId(event.target.value)}><option value="">Choose a recent receipt</option>{historicalDecisions.map((decision) => <option key={decision.id} value={decision.receipt.receiptId}>{decision.receipt.outcome} · {decision.receipt.action.tool}.{decision.receipt.action.operation} · {new Date(decision.createdAt).toLocaleString()}</option>)}</Select></Field> : null}<Button tone="primary" disabled={!previewOk || busy || (source === "historical" && !receiptId)} onClick={run}>{busy ? "Simulating…" : "Run simulation"}</Button>{result ? <div className="simulationResultV2"><div><OutcomeBadge outcome={result.outcome} /><strong>{result.summary}</strong></div>{result.historicalLimitations?.length ? <Notice tone="info" title="Historical replay limitations">{result.historicalLimitations.join(" ")}</Notice> : null}<div className="simulationTraceV2">{result.trace.map((step, index) => <div key={`${step.step}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p><strong>{step.step.replaceAll("-", " ")}</strong><small>{step.summary}</small></p></div>)}</div>{result.missingEvidence.length ? <div className="simulationMissingV2"><strong>Missing evidence</strong>{result.missingEvidence.map((item) => <p key={item.description}>{item.description}</p>)}</div> : null}</div> : null}</Card>;
}

function PolicyStateBadge({ state }: { state: "draft" | "active" | "archived" }) {
  return <Badge tone={state === "active" ? "success" : state === "draft" ? "warning" : "neutral"}>{state}</Badge>;
}

const conditionOperators: DeterministicCondition["operator"][] = ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "in", "not_in", "exists", "not_exists"];

function toDraft(version: PolicyVersionRecord): Draft {
  const policy = version.policy;
  const evidence = policy.requiredEvidence.map((item) => ({ rowId: rowId(), key: item.key, type: item.type, description: item.description, maxAgeSeconds: item.maxAgeSeconds ? String(item.maxAgeSeconds) : "" }));
  const exceptions = policy.exceptions.map((exception) => ({ rowId: rowId(), description: exception.description, criteria: exception.criteria.join("\n"), requiredEvidence: exception.requiredEvidence.join(", ") }));
  const base = {
    name: policy.name,
    description: policy.description,
    severity: policy.severity,
    priority: String(policy.priority),
    actionTypes: policy.scope?.actionTypes?.join(", ") ?? "",
    tools: policy.scope?.tools?.join(", ") ?? "",
    actionEnvironments: policy.scope?.environments?.join(", ") ?? "",
    targetEnvironmentIds: version.targetEnvironmentIds,
    evidence,
    exceptions,
    changeNote: version.changeNote ?? "",
  };
  if (policy.mode === "contextual") return { ...base, mode: "contextual", effect: "review", match: "all", conditions: [{ rowId: rowId(), field: "facts.riskScore", operator: "greater_than_or_equal", valueType: "number", value: "70" }], instruction: policy.instruction, decisionCriteria: policy.decisionCriteria.join("\n") };
  return { ...base, mode: "deterministic", effect: policy.rule.effect, match: policy.rule.match, conditions: policy.rule.conditions.map(toConditionDraft), instruction: "Evaluate this action against the supplied evidence and context.", decisionCriteria: "ALLOW only when policy requirements are fully satisfied.\nREVIEW when required evidence is unresolved.\nBLOCK when the action violates a prohibition." };
}

function toConditionDraft(condition: DeterministicCondition): ConditionDraft {
  if (condition.operator === "exists" || condition.operator === "not_exists") return { rowId: rowId(), field: condition.field, operator: condition.operator, valueType: "none", value: "" };
  if (Array.isArray(condition.value)) return { rowId: rowId(), field: condition.field, operator: condition.operator, valueType: "list", value: condition.value.map(String).join(", ") };
  if (typeof condition.value === "number") return { rowId: rowId(), field: condition.field, operator: condition.operator, valueType: "number", value: String(condition.value) };
  if (typeof condition.value === "boolean") return { rowId: rowId(), field: condition.field, operator: condition.operator, valueType: "boolean", value: String(condition.value) };
  return { rowId: rowId(), field: condition.field, operator: condition.operator, valueType: "string", value: typeof condition.value === "object" && condition.value !== null ? JSON.stringify(condition.value) : String(condition.value ?? "") };
}

function buildPolicy(draft: Draft, policyId: string): { ok: true; policy: Policy } | { ok: false; error: string } {
  if (!draft.name.trim() || !draft.description.trim()) return { ok: false, error: "Name and description are required." };
  const priority = Number(draft.priority);
  if (!Number.isInteger(priority) || priority < 1 || priority > 1000) return { ok: false, error: "Priority must be an integer from 1 to 1000." };
  if (!draft.targetEnvironmentIds.length) return { ok: false, error: "Select at least one project environment." };

  const requiredEvidence = [] as Policy["requiredEvidence"];
  for (const [index, row] of draft.evidence.entries()) {
    if (!row.key.trim() || !row.type.trim() || !row.description.trim()) return { ok: false, error: `Evidence row ${index + 1} needs a key, type, and description.` };
    const age = row.maxAgeSeconds.trim() ? Number(row.maxAgeSeconds) : undefined;
    if (age !== undefined && (!Number.isInteger(age) || age <= 0)) return { ok: false, error: `Evidence row ${index + 1} has an invalid max age.` };
    requiredEvidence.push({ key: row.key.trim(), type: row.type.trim(), description: row.description.trim(), required: true, ...(age ? { maxAgeSeconds: age } : {}) });
  }

  const exceptions = [] as Policy["exceptions"];
  for (const [index, row] of draft.exceptions.entries()) {
    const criteria = lines(row.criteria);
    if (!row.description.trim() || !criteria.length) return { ok: false, error: `Exception ${index + 1} needs a description and at least one criterion.` };
    exceptions.push({ id: `${policyId}-exception-${index + 1}`, description: row.description.trim(), criteria, requiredEvidence: csv(row.requiredEvidence) ?? [] });
  }

  const actionTypes = csv(draft.actionTypes);
  const tools = csv(draft.tools);
  const environments = csv(draft.actionEnvironments);
  const base = {
    id: policyId,
    name: draft.name.trim(),
    description: draft.description.trim(),
    severity: draft.severity,
    priority,
    enabled: false,
    requiredEvidence,
    exceptions,
    ...((actionTypes || tools || environments) ? { scope: { ...(actionTypes ? { actionTypes } : {}), ...(tools ? { tools } : {}), ...(environments ? { environments } : {}) } } : {}),
  };

  if (draft.mode === "contextual") {
    const criteria = lines(draft.decisionCriteria);
    if (!draft.instruction.trim() || !criteria.length) return { ok: false, error: "Contextual policies need a reasoning instruction and at least one decision criterion." };
    return { ok: true, policy: { ...base, mode: "contextual", instruction: draft.instruction.trim(), decisionCriteria: criteria } };
  }

  if (!draft.conditions.length) return { ok: false, error: "Add at least one deterministic condition." };
  const conditions: DeterministicCondition[] = [];
  for (const [index, condition] of draft.conditions.entries()) {
    if (!condition.field.trim()) return { ok: false, error: `Condition ${index + 1} needs a field.` };
    const parsed = conditionValue(condition);
    if (!parsed.ok) return { ok: false, error: `Condition ${index + 1}: ${parsed.error}` };
    conditions.push({ field: condition.field.trim(), operator: condition.operator, ...(parsed.value !== undefined ? { value: parsed.value } : {}) });
  }
  return { ok: true, policy: { ...base, mode: "deterministic", rule: { effect: draft.effect, match: draft.match, conditions } } };
}

function conditionValue(condition: ConditionDraft): { ok: true; value?: DeterministicCondition["value"] } | { ok: false; error: string } {
  if (condition.operator === "exists" || condition.operator === "not_exists") return { ok: true };
  if (condition.valueType === "number") {
    const value = Number(condition.value);
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, error: "enter a valid number." };
  }
  if (condition.valueType === "boolean") return condition.value === "true" || condition.value === "false" ? { ok: true, value: condition.value === "true" } : { ok: false, error: "choose true or false." };
  if (condition.valueType === "list") {
    const values = csv(condition.value);
    return values?.length ? { ok: true, value: values } : { ok: false, error: "enter one or more comma-separated values." };
  }
  if (!condition.value.trim()) return { ok: false, error: "enter a value." };
  return { ok: true, value: condition.value };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
    const code = typeof error?.code === "string" ? error.code : "POLICY_REQUEST_FAILED";
    const message = typeof error?.message === "string" ? error.message : typeof record.message === "string" ? record.message : `Policy API returned HTTP ${response.status}.`;
    throw new PolicyApiError(code, message, error?.details);
  }
  return body as T;
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Policy Studio action failed."; }
function replaceAt<T>(items: T[], index: number, next: T) { return items.map((item, itemIndex) => itemIndex === index ? next : item); }
function toggleValue(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function lines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }
function csv(value: string) { const values = value.split(",").map((item) => item.trim()).filter(Boolean); return values.length ? values : undefined; }
