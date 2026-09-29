import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getDatasetStatus, parseBrief, scout } from "./api";
import { loadRecruitmentPlans, saveRecruitmentPlans, type SavedRecruitmentPlan } from "./plans";
import type {
  Candidate,
  DatasetStatus,
  InPossessionRole,
  OutOfPossessionRole,
  Position,
  ScoutRequest,
  ScoutResponse,
} from "./types";

const positions: Array<{ value: Position; label: string }> = [
  { value: "GK", label: "门将" }, { value: "CB", label: "中后卫" }, { value: "LB", label: "左后卫" },
  { value: "RB", label: "右后卫" }, { value: "LWB", label: "左翼卫" }, { value: "RWB", label: "右翼卫" },
  { value: "DM", label: "后腰" }, { value: "CM", label: "中场" }, { value: "AM", label: "前腰" },
  { value: "LW", label: "左边锋" }, { value: "RW", label: "右边锋" }, { value: "ST", label: "中锋" },
];

const inPossessionRoles: Array<{ value: InPossessionRole; label: string; note: string }> = [
  { value: "progression", label: "推进持球者", note: "带球与长传作为推进代理指标" },
  { value: "retention", label: "控球组织者", note: "传球成功率；不代表接球压力下的控球" },
  { value: "creation", label: "机会创造者", note: "射门助攻与助攻" },
];

const outOfPossessionRoles: Array<{ value: OutOfPossessionRole; label: string; note: string }> = [
  { value: "pressing", label: "积极施压者", note: "施压次数；不代表施压成功率" },
  { value: "defensive_disruption", label: "防守破坏者", note: "抢断与拦截次数；不代表对抗成功率" },
];

interface BriefForm {
  targetTeam: string;
  position: Position | "";
  maxAge: string;
  query: string;
  inPossessionRoles: InPossessionRole[];
  outOfPossessionRoles: OutOfPossessionRole[];
  topK: number;
}

const initialForm: BriefForm = {
  targetTeam: "",
  position: "",
  maxAge: "",
  query: "",
  inPossessionRoles: ["progression"],
  outOfPossessionRoles: ["pressing"],
  topK: 5,
};

function App() {
  const [form, setForm] = useState(initialForm);
  const [planName, setPlanName] = useState("");
  const [dataset, setDataset] = useState<DatasetStatus | null>(null);
  const [plans, setPlans] = useState<SavedRecruitmentPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [result, setResult] = useState<ScoutResponse | null>(null);
  const [resultAnalyzedAt, setResultAnalyzedAt] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [parsedBrief, setParsedBrief] = useState(false);
  const [parserNotice, setParserNotice] = useState<string | null>(null);

  useEffect(() => {
    getDatasetStatus().then(setDataset).catch(() => setDataset(null));
    try {
      setPlans(loadRecruitmentPlans());
    } catch (caught) {
      setPlanMessage(caught instanceof Error ? caught.message : "本地计划无法读取。");
    }
  }, []);

  const datasetLabel = dataset?.mode === "statsbomb" ? "StatsBomb Open Data" : "虚构演示数据";

  function toggleInPossessionRole(role: InPossessionRole) {
    setForm((current) => ({
      ...current,
      inPossessionRoles: current.inPossessionRoles.includes(role)
        ? current.inPossessionRoles.filter((item) => item !== role)
        : [...current.inPossessionRoles, role],
    }));
  }

  function toggleOutOfPossessionRole(role: OutOfPossessionRole) {
    setForm((current) => ({
      ...current,
      outOfPossessionRoles: current.outOfPossessionRoles.includes(role)
        ? current.outOfPossessionRoles.filter((item) => item !== role)
        : [...current.outOfPossessionRoles, role],
    }));
  }

  async function handleParseBrief() {
    const brief = form.query.trim();
    if (brief.length < 5) {
      setError("请先用一句话描述招募需求。");
      return;
    }
    setParsing(true);
    setError(null);
    setParserNotice(null);
    try {
      const response = await parseBrief(brief);
      const { draft } = response;
      const hasParsedRoles = draft.inPossessionRoles.length + draft.outOfPossessionRoles.length > 0;
      setForm((current) => ({
        ...current,
        // Missing required values are cleared instead of inheriting a previous plan's values.
        targetTeam: draft.targetTeam ?? "",
        position: draft.position ?? "",
        maxAge: draft.maxAge === null ? "" : String(draft.maxAge),
        inPossessionRoles: hasParsedRoles ? draft.inPossessionRoles : ["progression"],
        outOfPossessionRoles: hasParsedRoles ? draft.outOfPossessionRoles : ["pressing"],
      }));
      setParsedBrief(true);
      const missingLabels = response.missingFields.map((field) => field === "targetTeam" ? "目标球队" : "球员位置");
      const defaultsNotice = draft.inPossessionRoles.length + draft.outOfPossessionRoles.length === 0
        ? "描述里没有识别到职责偏好，已显示默认的推进持球与积极施压选项。"
        : "";
      setParserNotice([
        missingLabels.length ? `已生成草稿。还需要补充：${missingLabels.join("、")}。` : "已生成需求草稿。",
        defaultsNotice,
        "请检查并修订结构化字段，再确认运行分析。",
      ].filter(Boolean).join(" "));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "自然语言解析暂不可用，请手动填写下方字段。");
    } finally {
      setParsing(false);
    }
  }

  function toScoutRequest(): ScoutRequest | null {
    if (!form.targetTeam.trim()) {
      setError("请填写目标球队。");
      return null;
    }
    if (!form.position) {
      setError("请补充球员位置。");
      return null;
    }
    if (form.inPossessionRoles.length + form.outOfPossessionRoles.length === 0) {
      setError("至少选择一项有球或无球职责。");
      return null;
    }
    return {
      targetTeam: form.targetTeam.trim(),
      position: form.position,
      maxAge: form.maxAge ? Number(form.maxAge) : undefined,
      query: form.query.trim() || undefined,
      inPossessionRoles: form.inPossessionRoles,
      outOfPossessionRoles: form.outOfPossessionRoles,
      topK: form.topK,
      includeUnknownAge: false,
    };
  }

  function persistPlans(nextPlans: SavedRecruitmentPlan[]) {
    try {
      saveRecruitmentPlans(nextPlans);
      setPlans(nextPlans);
      setPlanMessage("招募计划已保存到此浏览器。");
      setError(null);
      return true;
    } catch (caught) {
      setPlanMessage(caught instanceof Error ? caught.message : "无法保存本地计划。");
      return false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = toScoutRequest();
    if (!request) return;
    setLoading(true);
    setError(null);
    setPlanMessage(null);
    try {
      const response = await scout(request);
      const analyzedAt = new Date().toISOString();
      setResult(response);
      setResultAnalyzedAt(analyzedAt);
      setSelectedIds([]);
      setParsedBrief(false);
      if (activePlanId) {
        const next = plans.map((plan) => plan.id === activePlanId
          ? { ...plan, name: planName.trim() || plan.name, input: request, originalBrief: form.query, lastAnalysis: response, lastAnalyzedAt: analyzedAt, updatedAt: analyzedAt }
          : plan);
        persistPlans(next);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分析失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  function saveCurrentPlan() {
    const request = toScoutRequest();
    if (!request) return;
    const now = new Date().toISOString();
    const name = planName.trim() || `${request.targetTeam} · ${positions.find((item) => item.value === request.position)?.label ?? request.position}`;
    const existing = plans.find((plan) => plan.id === activePlanId);
    const analysisMatches = Boolean(result && requestMatchesResult(request, result));
    const saved: SavedRecruitmentPlan = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      input: request,
      originalBrief: form.query,
      lastAnalysis: analysisMatches ? result : existing?.lastAnalysis ?? null,
      lastAnalyzedAt: analysisMatches ? resultAnalyzedAt ?? now : existing?.lastAnalyzedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = existing
      ? plans.map((plan) => plan.id === saved.id ? saved : plan)
      : [saved, ...plans];
    if (persistPlans(next)) {
      setActivePlanId(saved.id);
      if (!existing && !analysisMatches) {
        setResult(null);
        setResultAnalyzedAt(null);
        setSelectedIds([]);
      }
      setPlanMessage(analysisMatches ? "招募计划和最近分析快照已保存。" : saved.lastAnalysis ? "招募条件已保存；最近分析快照保留，重新分析后会更新。" : "招募计划已保存；生成候选名单后可保存分析快照。");
    }
  }

  function openPlan(plan: SavedRecruitmentPlan) {
    setActivePlanId(plan.id);
    setPlanName(plan.name);
    setForm({
      targetTeam: plan.input.targetTeam,
      position: plan.input.position,
      maxAge: plan.input.maxAge === undefined ? "" : String(plan.input.maxAge),
      query: plan.originalBrief,
      inPossessionRoles: plan.input.inPossessionRoles,
      outOfPossessionRoles: plan.input.outOfPossessionRoles,
      topK: plan.input.topK,
    });
    setResult(plan.lastAnalysis);
    setResultAnalyzedAt(plan.lastAnalyzedAt);
    setSelectedIds([]);
    setParsedBrief(false);
    setError(null);
    const stale = plan.lastAnalysis && !requestMatchesResult(plan.input, plan.lastAnalysis);
    setPlanMessage(stale
      ? `计划条件已更新；当前保留的是 ${plan.lastAnalyzedAt ? formatDate(plan.lastAnalyzedAt) : "未知时间"} 的上一份快照。`
      : plan.lastAnalyzedAt ? `显示最近一次分析：${formatDate(plan.lastAnalyzedAt)}。` : "该计划还没有分析快照。");
  }

  function startNewPlan() {
    setActivePlanId(null);
    setPlanName("");
    setForm(initialForm);
    setResult(null);
    setResultAnalyzedAt(null);
    setSelectedIds([]);
    setParsedBrief(false);
    setError(null);
    setPlanMessage("已开始新的招募计划。");
  }

  function deletePlan(planId: string) {
    const plan = plans.find((item) => item.id === planId);
    if (!plan || !window.confirm(`确定删除“${plan.name}”吗？`)) return;
    const next = plans.filter((item) => item.id !== planId);
    if (persistPlans(next) && activePlanId === planId) startNewPlan();
  }

  function toggleCandidate(candidate: Candidate) {
    setSelectedIds((current) => {
      if (current.includes(candidate.player.playerId)) return current.filter((id) => id !== candidate.player.playerId);
      if (current.length >= 3) return current;
      return [...current, candidate.player.playerId];
    });
  }

  const selectedCandidates = useMemo(() => result?.candidates.filter((candidate) => selectedIds.includes(candidate.player.playerId)) ?? [], [result, selectedIds]);
  const missingRequiredFields = [!form.targetTeam.trim() ? "目标球队" : null, !form.position ? "球员位置" : null].filter(Boolean);
  const currentRequest = buildScoutRequest(form);
  const snapshotIsStale = Boolean(result && (!currentRequest || !requestMatchesResult(currentRequest, result)));

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="TactiScout 首页">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>TactiScout</span>
        </a>
        <div className="topbar-meta">
          <span className={`source-pill ${dataset?.mode === "statsbomb" ? "source-pill-live" : ""}`}>
            <span className="status-dot" />{datasetLabel}
          </span>
          <span className="topbar-caption">球探研究工作台 <span>·</span> MVP</span>
        </div>
      </header>

      <main id="top" className="main-layout">
        <section className="intro-row">
          <div>
            <p className="eyebrow">TACTICAL RECRUITMENT, WITH EVIDENCE</p>
            <h1>为下一个位置，<em>找到合适的人。</em></h1>
            <p className="intro-copy">把战术需求转成清晰的候选名单。每项职责都展示数据依据与证据边界。</p>
          </div>
          <div className="intro-stamp"><span>01</span><span>SCOUTING<br />BRIEF</span></div>
        </section>

        <SavedPlans plans={plans} activePlanId={activePlanId} onOpen={openPlan} onDelete={deletePlan} onNew={startNewPlan} />

        <div className="workspace-grid">
          <aside className="brief-panel">
            <div className="panel-heading">
              <div><span className="section-kicker">01 / BRIEF</span><h2>{activePlanId ? "编辑招募计划" : "建立球员需求"}</h2></div>
              <span className="panel-icon" aria-hidden="true">↗</span>
            </div>
            <form onSubmit={handleSubmit}>
              <label className="field-label" htmlFor="query">用自然语言描述需求 <span className="field-hint">可选</span></label>
              <textarea id="query" className="text-input query-input" rows={3} value={form.query} onChange={(event) => setForm({ ...form, query: event.target.value })} placeholder="例如：帮巴塞罗那找 23 岁以下、能推进和创造机会的中场" />
              <button className="secondary-button parse-button" type="button" onClick={handleParseBrief} disabled={parsing || loading || form.query.trim().length < 5}>
                {parsing ? "正在解析…" : "解析为结构化需求"}<span aria-hidden="true">↗</span>
              </button>
              {parserNotice && <p className="parser-notice" role="status">{parserNotice}</p>}

              <div className="field-divider"><span>{parsedBrief ? "检查并确认解析结果" : "结构化需求"}</span></div>
              <label className="field-label" htmlFor="target-team">目标球队</label>
              <input id="target-team" className="text-input" value={form.targetTeam} onChange={(event) => setForm({ ...form, targetTeam: event.target.value })} placeholder="例如 Barcelona" required />

              <div className="form-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="position">位置</label>
                  <select id="position" className="text-input select-input" value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value as Position | "" })} required>
                    <option value="">选择位置</option>
                    {positions.map((position) => <option key={position.value} value={position.value}>{position.label} · {position.value}</option>)}
                  </select>
                </div>
                <div className="field-group age-field">
                  <label className="field-label" htmlFor="max-age">年龄上限 <span className="field-hint">可选</span></label>
                  <div className="number-wrap"><input id="max-age" className="text-input" type="number" min="15" max="45" value={form.maxAge} onChange={(event) => setForm({ ...form, maxAge: event.target.value })} placeholder="不限" /><span>岁</span></div>
                </div>
              </div>

              <RoleSelector title="有球职责" roles={inPossessionRoles} selected={form.inPossessionRoles} onToggle={toggleInPossessionRole} />
              <RoleSelector title="无球职责" roles={outOfPossessionRoles} selected={form.outOfPossessionRoles} onToggle={toggleOutOfPossessionRole} />

              <div className="form-row bottom-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="top-k">候选人数</label>
                  <select id="top-k" className="text-input select-input" value={form.topK} onChange={(event) => setForm({ ...form, topK: Number(event.target.value) })}>
                    {[3, 5, 8, 10].map((count) => <option key={count} value={count}>{count} 人</option>)}
                  </select>
                </div>
                <p className="age-note">年龄未知的球员会先排除，避免误判门槛。</p>
              </div>

              <label className="field-label plan-name-label" htmlFor="plan-name">计划名称 <span className="field-hint">保存时使用</span></label>
              <input id="plan-name" className="text-input" value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="例如：巴萨中场补强" />

              <button className="submit-button" type="submit" disabled={loading || parsing || missingRequiredFields.length > 0 || form.inPossessionRoles.length + form.outOfPossessionRoles.length === 0}>
                <span>{loading ? "正在分析球员…" : "确认需求并生成候选名单"}</span><span className="button-arrow" aria-hidden="true">→</span>
              </button>
              {error && <p className="error-message" role="alert">{error}</p>}
              {planMessage && <p className="plan-message" role="status">{planMessage}</p>}
              <div className="form-actions">
                <button className="text-button" type="button" onClick={saveCurrentPlan} disabled={loading}>{result ? "保存计划与最近结果" : "保存招募计划"}</button>
                {activePlanId && <span className="active-plan-tag">正在编辑已保存计划</span>}
              </div>
              <p className="form-footnote">需求解析 → 用户确认 → 数据筛选 → 职责适配 → 证据审查</p>
            </form>
          </aside>

          <section className="results-panel" aria-live="polite">
            {loading ? <LoadingState /> : result ? <ScoutResults response={result} snapshotIsStale={snapshotIsStale} selectedIds={selectedIds} selectedCandidates={selectedCandidates} onToggleCandidate={toggleCandidate} onClearSelection={() => setSelectedIds([])} /> : <EmptyState datasetLabel={datasetLabel} />}
          </section>
        </div>
      </main>
      <footer className="site-footer"><span>TactiScout <b>·</b> Football scouting research prototype</span><span>DATA SHOULD EXPLAIN THE RECOMMENDATION.</span></footer>
    </div>
  );
}

function SavedPlans({ plans, activePlanId, onOpen, onDelete, onNew }: {
  plans: SavedRecruitmentPlan[];
  activePlanId: string | null;
  onOpen: (plan: SavedRecruitmentPlan) => void;
  onDelete: (planId: string) => void;
  onNew: () => void;
}) {
  return (
    <section className="saved-plans" aria-label="保存的招募计划">
      <div className="saved-plans-heading">
        <div><span className="section-kicker">LOCAL WORKSPACE</span><h2>招募计划 <small>{plans.length}</small></h2></div>
        <button type="button" className="secondary-button new-plan-button" onClick={onNew}>＋ 新建计划</button>
      </div>
      {plans.length ? (
        <div className="saved-plan-list">
          {plans.map((plan) => (
            <article className={`saved-plan-card ${activePlanId === plan.id ? "active" : ""}`} key={plan.id}>
              <div className="saved-plan-copy"><strong>{plan.name}</strong><span>{plan.lastAnalysis && !requestMatchesResult(plan.input, plan.lastAnalysis) ? "计划条件已更改 · 快照待更新" : plan.lastAnalyzedAt ? `最近分析 ${formatDate(plan.lastAnalyzedAt)}` : "尚无分析快照"}</span></div>
              <div className="saved-plan-actions">
                <button type="button" className="text-button" onClick={() => onOpen(plan)}>打开</button>
                <button type="button" className="text-button danger-text" onClick={() => onDelete(plan.id)}>删除</button>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="no-saved-plans">分析完成后可将需求与最近结果保存在此浏览器。</p>}
    </section>
  );
}

function RoleSelector<T extends string>({ title, roles, selected, onToggle }: {
  title: string;
  roles: Array<{ value: T; label: string; note: string }>;
  selected: T[];
  onToggle: (role: T) => void;
}) {
  return (
    <fieldset className="preference-fieldset">
      <legend className="field-label">{title} <span className="field-hint">可多选</span></legend>
      <div className="preference-list">
        {roles.map((role) => {
          const active = selected.includes(role.value);
          return (
            <button className={`preference-option ${active ? "selected" : ""}`} type="button" key={role.value} aria-pressed={active} onClick={() => onToggle(role.value)}>
              <span className="preference-check" aria-hidden="true">{active ? "✓" : ""}</span>
              <span className="preference-copy"><strong>{role.label}</strong><small>{role.note}</small></span>
              <span className="preference-plus" aria-hidden="true">{active ? "−" : "+"}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function EmptyState({ datasetLabel }: { datasetLabel: string }) {
  return (
    <div className="empty-state">
      <div className="pitch-art" aria-hidden="true"><span className="pitch-circle" /><span className="pitch-dot" /><span className="pitch-line" /></div>
      <span className="section-kicker">02 / SHORTLIST</span>
      <h2>先设置球队的<br /><em>球员需求。</em></h2>
      <p>确认招募需求后，这里会显示候选球员、职责适配、统计依据、样本量和风险提醒。</p>
      <div className="empty-data-note"><span className="status-dot" />当前数据来源：{datasetLabel}</div>
      <div className="empty-index"><span>STATISTICS</span><i /><span>ROLE FIT</span><i /><span>EVIDENCE</span></div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state">
      <div className="loading-orbit"><span /></div>
      <span className="section-kicker">SCOUTING IN PROGRESS</span>
      <h2>正在整理候选球员</h2>
      <p>筛选数据、计算职责适配，再检查证据覆盖。</p>
    </div>
  );
}

function ScoutResults({ response, snapshotIsStale, selectedIds, selectedCandidates, onToggleCandidate, onClearSelection }: {
  response: ScoutResponse;
  snapshotIsStale: boolean;
  selectedIds: string[];
  selectedCandidates: Candidate[];
  onToggleCandidate: (candidate: Candidate) => void;
  onClearSelection: () => void;
}) {
  const positionLabel = positions.find((position) => position.value === response.requirements.position)?.label ?? response.requirements.position;
  return (
    <div className="results-content">
      <div className="results-heading">
        <div><span className="section-kicker">02 / SHORTLIST</span><h2>{response.targetTeam}<span className="heading-tail">的 {positionLabel}</span></h2></div>
        <span className="results-count">{String(response.candidates.length).padStart(2, "0")} <small>候选人</small></span>
      </div>
      <div className="review-strip">
        <div className="review-score"><span className="review-score-number">{Math.round(response.review.evidenceCompleteness * 100)}</span><span className="review-score-unit">%</span></div>
        <div className="review-copy"><strong>证据完整度</strong><span>{response.review.evidenceCoverage === 1 ? "所有候选人均有充足出场样本" : "此值反映样本与数据覆盖，不代表推荐正确概率"}</span></div>
        <span className="source-mini"><span className="status-dot" />{response.dataSource}</span>
      </div>
      {snapshotIsStale && <p className="snapshot-warning">当前招募条件与这份分析结果不同。这里保留的是上一份快照；确认新条件并重新分析后才会更新。</p>}
      {response.review.findings.length > 0 && <div className="finding-list">{response.review.findings.map((finding, index) => <p key={`${finding}-${index}`}><span>!</span>{finding}</p>)}</div>}
      {response.candidates.length ? (
        <>
          <ComparePanel candidates={selectedCandidates} onClearSelection={onClearSelection} />
          <p className="compare-hint">选择 2–3 名候选人即可并排比较；当前已选 {selectedIds.length} 名。</p>
          <div className="candidate-list">
            {response.candidates.map((candidate, index) => <CandidateCard key={`${candidate.player.playerId}-${index}`} candidate={candidate} rank={index + 1} selected={selectedIds.includes(candidate.player.playerId)} selectionDisabled={selectedIds.length >= 3 && !selectedIds.includes(candidate.player.playerId)} onToggle={() => onToggleCandidate(candidate)} />)}
          </div>
        </>
      ) : (
        <div className="no-candidates"><span className="no-candidates-mark">∅</span><div><strong>目前没有符合条件的球员</strong><p>试试放宽年龄限制，或切换位置与有球、无球职责。</p></div></div>
      )}
      <details className="caveats-panel">
        <summary><span>职责适配分如何计算</span><span className="details-plus">+</span></summary>
        <ul>
          <li>推进持球者：带球/90 × 2 + 长传/90 × 8；最高记为 100。</li>
          <li>控球组织者：传球成功率。</li>
          <li>机会创造者：射门助攻/90 × 15 + 助攻/90 × 8；最高记为 100。</li>
          <li>积极施压者：施压/90 × 4.5；最高记为 100。</li>
          <li>防守破坏者：(抢断 + 拦截)/90 × 8；最高记为 100。</li>
          <li>总体适配是所选职责的算术平均。样本分钟单独显示，不会混入适配分。所有权重都是尚未校准的启发式。</li>
        </ul>
      </details>
      <details className="caveats-panel">
        <summary><span>数据说明与限制</span><span className="details-plus">+</span></summary>
        <ul>{response.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
      </details>
    </div>
  );
}

function ComparePanel({ candidates, onClearSelection }: { candidates: Candidate[]; onClearSelection: () => void }) {
  if (candidates.length < 2) {
    return <div className="compare-empty"><span>球员比较</span><p>从候选名单中选择 2–3 名球员，比较数据、职责适配和样本风险。</p></div>;
  }
  const rows: Array<{ label: string; value: (candidate: Candidate) => string }> = [
    { label: "总体适配", value: (candidate) => `${candidate.tacticalFit} / 100` },
    { label: "有球适配", value: (candidate) => candidate.inPossessionFit === null ? "未选择" : `${candidate.inPossessionFit} / 100` },
    { label: "无球适配", value: (candidate) => candidate.outOfPossessionFit === null ? "未选择" : `${candidate.outOfPossessionFit} / 100` },
    { label: "进球 / 90", value: (candidate) => candidate.per90.goals.toFixed(2) },
    { label: "助攻 / 90", value: (candidate) => candidate.per90.assists.toFixed(2) },
    { label: "带球 / 90", value: (candidate) => candidate.per90.carries.toFixed(2) },
    { label: "施压 / 90", value: (candidate) => candidate.per90.pressures.toFixed(2) },
    { label: "长传 / 90", value: (candidate) => candidate.per90.longPasses.toFixed(2) },
    { label: "传球成功率", value: (candidate) => `${candidate.per90.passCompletionPct.toFixed(1)}%` },
    { label: "抢断与拦截 / 90", value: (candidate) => candidate.per90.tacklesInterceptions.toFixed(2) },
    { label: "出场样本", value: (candidate) => `${candidate.player.minutes.toLocaleString()} 分钟` },
    { label: "风险", value: (candidate) => candidate.risks.join("；") || "无额外提示" },
  ];
  return (
    <section className="compare-panel" aria-label="球员比较">
      <div className="compare-heading"><div><span className="section-kicker">SIDE BY SIDE</span><h3>候选球员比较</h3></div><button type="button" className="text-button" onClick={onClearSelection}>清除选择</button></div>
      <div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>比较维度</th>{candidates.map((candidate) => <th key={candidate.player.playerId}>{candidate.player.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th>{candidates.map((candidate) => <td key={candidate.player.playerId}>{row.value(candidate)}</td>)}</tr>)}</tbody></table></div>
    </section>
  );
}

function CandidateCard({ candidate, rank, selected, selectionDisabled, onToggle }: { candidate: Candidate; rank: number; selected: boolean; selectionDisabled: boolean; onToggle: () => void }) {
  const { player, per90 } = candidate;
  const stats = [
    { label: "带球", value: per90.carries.toFixed(1) },
    { label: "施压", value: per90.pressures.toFixed(1) },
    { label: "长传", value: per90.longPasses.toFixed(1) },
    { label: "传球成功率", value: `${per90.passCompletionPct.toFixed(0)}%` },
  ];
  return (
    <article className="candidate-card">
      <div className="candidate-topline">
        <span className="candidate-rank">{String(rank).padStart(2, "0")}</span>
        <div className="candidate-title"><h3>{player.name}</h3><span>{player.team} <i>·</i> {player.competition} {player.season}</span></div>
        <div className="fit-score"><strong>{candidate.score}</strong><span>启发式排序</span></div>
      </div>
      <label className="compare-select"><input type="checkbox" checked={selected} disabled={selectionDisabled} onChange={onToggle} /><span>加入比较</span></label>
      <div className="candidate-meta"><span>{player.position}</span><span>{player.age === null ? "年龄未知" : `${player.age} 岁`}</span><span>{player.minutes.toLocaleString()} 分钟</span></div>
      <div className="stat-grid">{stats.map((stat) => <div className="stat-cell" key={stat.label}><strong>{stat.value}</strong><span>{stat.label}<small> / 90</small></span></div>)}</div>
      <div className="fit-meter"><span>总体适配</span><div><i style={{ width: `${candidate.tacticalFit}%` }} /></div><strong>{candidate.tacticalFit}</strong></div>
      <div className="phase-fit-row"><span>有球职责：{candidate.inPossessionFit === null ? "未选择" : `${candidate.inPossessionFit} / 100`}</span><span>无球职责：{candidate.outOfPossessionFit === null ? "未选择" : `${candidate.outOfPossessionFit} / 100`}</span></div>
      <div className="role-assessments">
        {candidate.roleAssessments.map((assessment) => {
          const label = (assessment.phase === "in_possession" ? inPossessionRoles : outOfPossessionRoles).find((role) => role.value === assessment.role)?.label ?? assessment.role;
          return <div className="role-assessment" key={`${assessment.phase}-${assessment.role}`}><strong>{label} <span>{assessment.fit}</span></strong><ul>{assessment.evidence.map((item) => <li key={item}>{item}</li>)}</ul><p>暂无数据：{assessment.unsupportedAttributes.join("、")}</p></div>;
        })}
      </div>
      <div className="evidence-columns">
        <div><span className="evidence-label">推荐依据</span>{candidate.reasons.length ? <ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>目前没有符合所选职责的统计信号。</p>}</div>
        <div className="risk-column"><span className="evidence-label">风险提示</span><ul>{candidate.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul></div>
      </div>
      {player.ageSource && <p className="age-provenance">年龄来源：{player.ageSource}{player.ageVerifiedAt ? ` · 核实于 ${player.ageVerifiedAt}` : ""}</p>}
    </article>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}

function requestMatchesResult(request: ScoutRequest, response: ScoutResponse): boolean {
  const requirements = response.requirements;
  const sameValues = (left: string[], right: string[]) => left.length === right.length && left.every((value, index) => value === right[index]);
  return request.targetTeam === requirements.targetTeam
    && request.position === requirements.position
    && request.maxAge === requirements.maxAge
    && request.topK === requirements.topK
    && request.includeUnknownAge === requirements.includeUnknownAge
    && sameValues(request.inPossessionRoles, requirements.inPossessionRoles)
    && sameValues(request.outOfPossessionRoles, requirements.outOfPossessionRoles);
}

function buildScoutRequest(form: BriefForm): ScoutRequest | null {
  if (!form.targetTeam.trim() || !form.position || form.inPossessionRoles.length + form.outOfPossessionRoles.length === 0) return null;
  return {
    targetTeam: form.targetTeam.trim(),
    position: form.position,
    maxAge: form.maxAge ? Number(form.maxAge) : undefined,
    query: form.query.trim() || undefined,
    inPossessionRoles: form.inPossessionRoles,
    outOfPossessionRoles: form.outOfPossessionRoles,
    topK: form.topK,
    includeUnknownAge: false,
  };
}

export default App;
