import { useEffect, useState, type FormEvent } from "react";
import { getDatasetStatus, getRecruitmentProgress, turnRecruitmentCase } from "./api";
import { buildEvidenceComparison, toggleComparedPlayer } from "./comparison";
import { SearchableTeamSelect } from "./SearchableTeamSelect";
import { PlayerObservationsDialog } from "./PlayerObservationsDialog";
import {
  loadRecruitmentPlans,
  messageFromTurn,
  removeRecruitmentPlan,
  saveRecruitmentPlans,
  upsertRecruitmentPlan,
  type ConversationMessage,
  type SavedRecruitmentPlan,
} from "./plans";
import type { DatasetStatus, RecruitmentProgress, RecruitmentReport } from "../../src/domain/schemas.js";
import { firstPartyObservationSourceId } from "../../src/knowledge/source-ids.js";

const suggestedBriefs = [
  "为拜仁寻找凯恩的替代者，重点看能接应、做球和终结的前锋",
  "我想为巴萨找一个新的后卫，要能参与出球和高位防守",
  "给阿森纳找一个能推进、也愿意参与压迫的中场",
];

function App() {
  const [threadId, setThreadId] = useState<string>(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [report, setReport] = useState<RecruitmentReport | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"ready" | "needs_input" | "completed">("ready");
  const [draft, setDraft] = useState("");
  const [teamContext, setTeamContext] = useState("");
  const [planName, setPlanName] = useState("");
  const [originalBrief, setOriginalBrief] = useState("");
  const [dataset, setDataset] = useState<DatasetStatus | null>(null);
  const [plans, setPlans] = useState<SavedRecruitmentPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [hasConversationState, setHasConversationState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<RecruitmentProgress | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playerObservationsOpen, setPlayerObservationsOpen] = useState(false);

  useEffect(() => {
    getDatasetStatus().then(setDataset).catch(() => setDataset(null));
    try {
      setPlans(loadRecruitmentPlans());
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "本地计划无法读取。");
    }
  }, []);

  const datasetLabel = dataset?.mode === "statsbomb" ? "StatsBomb Open Data" : dataset?.source ?? "数据源状态未知";
  const waitingForAnswer = status === "needs_input";

  useEffect(() => {
    if (!loading || startedAt === null) return;
    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    updateElapsed();
    const elapsedTimer = window.setInterval(updateElapsed, 1000);
    let cancelled = false;
    let pollTimer: number | undefined;
    const pollProgress = async () => {
      try {
        const current = await getRecruitmentProgress(threadId);
        if (!cancelled) setProgress(current);
      } catch {
        // Keep showing elapsed time if a progress poll fails; the turn request remains authoritative.
      }
      if (!cancelled) pollTimer = window.setTimeout(() => void pollProgress(), 1200);
    };
    void pollProgress();
    return () => {
      cancelled = true;
      window.clearInterval(elapsedTimer);
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    };
  }, [loading, startedAt, threadId]);

  function persistPlans(nextPlans: SavedRecruitmentPlan[], successMessage?: string) {
    try {
      saveRecruitmentPlans(nextPlans);
      setPlans(nextPlans);
      setError(null);
      if (successMessage) setNotice(successMessage);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法保存本地计划。");
      return false;
    }
  }

  function persistCurrentPlan(input: {
    nextMessages: ConversationMessage[];
    nextReport: RecruitmentReport | null;
    nextReportAt: string | null;
    nextHasConversationState: boolean;
    brief: string;
    id: string;
  }): boolean {
    const now = new Date().toISOString();
    const name = planName.trim() || input.brief.trim().slice(0, 42) || "新的招募计划";
    const saved = upsertRecruitmentPlan(plans, {
      id: input.id,
      name,
      threadId,
      originalBrief: input.brief,
      messages: input.nextMessages,
      currentReport: input.nextReport,
      currentReportedAt: input.nextReportAt,
      hasConversationState: input.nextHasConversationState,
      now,
    });
    if (persistPlans(saved.plans)) {
      setActivePlanId(saved.plan.id);
      setPlanName(saved.plan.name);
      setHasConversationState(input.nextHasConversationState);
      return true;
    }
    return false;
  }

  async function sendMessage(messageText = draft) {
    const text = messageText.trim();
    if (!text || loading) return;
    const requestStartedAt = Date.now();
    setLoading(true);
    setStartedAt(requestStartedAt);
    setElapsedSeconds(0);
    setProgress({
      active: true,
      stage: "starting",
      message: "正在启动本轮球探调查",
      completedSteps: 0,
      updatedAt: new Date(requestStartedAt).toISOString(),
    });
    setError(null);
    setNotice(null);

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      ...(teamContext.trim() ? { teamContext: teamContext.trim() } : {}),
    };
    const nextMessages = [...messages, userMessage];
    const brief = originalBrief || text;
    const contextParts = [text];
    if (teamContext.trim()) contextParts.push(`用户补充的目标球队：${teamContext.trim()}`);
    if (!hasConversationState && messages.length > 0) {
      contextParts.unshift(`案件原始需求：${originalBrief || messages.find((item) => item.role === "user")?.content || "未记录"}`);
      if (report) contextParts.push(`此前报告摘要：${report.needSummary}`);
    }

    try {
      const response = await turnRecruitmentCase(threadId, contextParts.join("\n\n"), hasConversationState);
      const assistantMessage = messageFromTurn(response);
      const updatedMessages = [...nextMessages, assistantMessage];
      const now = new Date().toISOString();
      const updatedReport = response.report ?? report;
      const updatedReportAt = response.report ? now : reportAt;

      setMessages(updatedMessages);
      setReport(updatedReport);
      setReportAt(updatedReportAt);
      setStatus(response.status);
      setDraft("");
      setTeamContext("");
      setOriginalBrief(brief);
      setHasConversationState(true);

      if (activePlanId) {
        persistCurrentPlan({
          nextMessages: updatedMessages,
          nextReport: updatedReport,
          nextReportAt: updatedReportAt,
          nextHasConversationState: true,
          brief,
          id: activePlanId,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "对话暂时无法继续，请稍后再试。你输入的内容还在。");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function saveCurrentPlan() {
    if (!messages.length) {
      setError("先描述一条招募需求，再保存计划。");
      return;
    }
    const saved = persistCurrentPlan({
      nextMessages: messages,
      nextReport: report,
      nextReportAt: reportAt,
      nextHasConversationState: hasConversationState,
      brief: originalBrief || messages.find((message) => message.role === "user")?.content || "",
      id: activePlanId ?? crypto.randomUUID(),
    });
    if (saved) setNotice(report ? "招募计划和最近报告已保存到此浏览器。" : "招募计划与对话已保存；完成分析后会更新最近报告。");
  }

  function openPlan(plan: SavedRecruitmentPlan) {
    setThreadId(plan.threadId);
    setMessages(plan.messages);
    setReport(plan.lastReport);
    setReportAt(plan.lastReportedAt);
    setStatus(plan.messages.at(-1)?.questionReason ? "needs_input" : plan.lastReport ? "completed" : "ready");
    setDraft("");
    setTeamContext("");
    setPlanName(plan.name);
    setOriginalBrief(plan.originalBrief);
    setActivePlanId(plan.id);
    setHasConversationState(plan.hasConversationState);
    setError(null);
    setNotice(plan.lastReportedAt
      ? `已打开计划，显示 ${formatDate(plan.lastReportedAt)} 保存的最近报告。`
      : "已打开保存的招募对话。Agent 会接着处理你的补充。 ");
  }

  function startNewCase() {
    setThreadId(crypto.randomUUID());
    setMessages([]);
    setReport(null);
    setReportAt(null);
    setStatus("ready");
    setDraft("");
    setTeamContext("");
    setPlanName("");
    setOriginalBrief("");
    setActivePlanId(null);
    setHasConversationState(false);
    setError(null);
    setNotice("已开始新的招募案件。");
  }

  function deletePlan(id: string) {
    const plan = plans.find((item) => item.id === id);
    if (!plan || !window.confirm(`确定删除“${plan.name}”吗？`)) return;
    const next = removeRecruitmentPlan(plans, id);
    if (persistPlans(next, "已删除本地计划。") && activePlanId === id) startNewCase();
  }

  const userCount = messages.filter((message) => message.role === "user").length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="TactiScout 首页">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>TactiScout</span>
        </a>
        <div className="topbar-meta">
          <span className={`source-pill ${dataset?.mode === "statsbomb" ? "source-pill-live" : ""}`}><span className="status-dot" />{datasetLabel}</span>
          <button type="button" className="text-button observations-open-button" onClick={() => setPlayerObservationsOpen(true)}>球探观察</button>
          <span className="topbar-caption">对话式球探工作台 <span>·</span> MVP</span>
        </div>
      </header>

      <main id="top" className="main-layout conversation-layout">
        <section className="intro-row">
          <div>
            <p className="eyebrow">TACTICAL RECRUITMENT, WITH EVIDENCE</p>
            <h1>把阵容问题交给球探，<em>一起找到答案。</em></h1>
            <p className="intro-copy">用一句话描述需求。Agent 会先调查数据，必要时再向你追问，并说明推荐依据和证据边界。</p>
          </div>
          <div className="intro-stamp"><span>01</span><span>SCOUTING<br />CASE</span></div>
        </section>

        <SavedPlans plans={plans} activePlanId={activePlanId} onOpen={openPlan} onDelete={deletePlan} onNew={startNewCase} />

        <div className="conversation-workspace">
          <section className="conversation-panel" aria-label="球探对话">
            <div className="conversation-heading">
              <div className="conversation-heading-title"><span className="section-kicker">01 / CASE</span><input aria-label="招募计划名称" value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder={activePlanId ? "已保存的招募计划" : "计划名称（可选）"} /></div>
              <div className="conversation-heading-actions">
                {activePlanId && report && <button type="button" className="text-button" onClick={() => void sendMessage("请基于原始需求重新调查候选人，复核此前结论，并更新报告。")} disabled={loading}>复核报告</button>}
                <button type="button" className="text-button" onClick={saveCurrentPlan} disabled={!messages.length || loading}>保存计划</button>
              </div>
            </div>

            <div className="conversation-thread" aria-live="polite">
              {messages.length === 0 ? (
                <div className="conversation-welcome">
                  <span className="assistant-avatar">TS</span>
                  <div className="welcome-card">
                    <strong>你想解决什么阵容问题？</strong>
                    <p>说说球队和你期待的球员特点。不必先填位置、年龄或一长串筛选条件。</p>
                    <div className="suggested-briefs">
                      {suggestedBriefs.map((brief) => <button type="button" key={brief} onClick={() => setDraft(brief)}>{brief}<span aria-hidden="true">↗</span></button>)}
                    </div>
                  </div>
                </div>
              ) : messages.map((message) => (
                <article className={`chat-message ${message.role === "user" ? "chat-message-user" : "chat-message-assistant"}`} key={message.id}>
                  {message.role === "assistant" && <span className="assistant-avatar">TS</span>}
                  <div className="chat-bubble">
                    <p>{message.content}</p>
                    {message.teamContext && <span className="chat-context-chip">目标球队：{message.teamContext}</span>}
                    {message.questionReason && <div className="question-reason"><strong>为什么需要确认</strong><span>{message.questionReason}</span></div>}
                  </div>
                </article>
              ))}
              {loading && <div className="chat-message chat-message-assistant"><span className="assistant-avatar">TS</span><div className="chat-bubble recruitment-progress" role="status" aria-live="polite"><div className="recruitment-progress-heading"><span className="recruitment-progress-spinner" aria-hidden="true" /><strong>{progress?.message ?? "正在启动本轮球探调查"}</strong></div><div className="recruitment-progress-meta"><span>已等待 {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}</span>{progress && <span>已完成 {progress.completedSteps} 个 Agent 决策步骤</span>}</div>{elapsedSeconds >= 20 && <small>本地模型分析需要一些时间；结果返回前无需重复发送。</small>}</div></div>}
              {waitingForAnswer && !loading && <p className="turn-hint">补充信息后，Agent 会在同一案件中继续调查。</p>}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="message-composer">描述招募需求或回答球探问题</label>
              <textarea id="message-composer" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={waitingForAnswer ? "回答这个问题，或补充你希望优先考虑的方向…" : "例如：为拜仁寻找凯恩的替代者，重点看能接应、做球和终结的前锋"} disabled={loading} />
              <div className="composer-bottom">
                <div className="composer-context">
                  <label id="team-context-label" htmlFor="team-context">可选：指定目标球队</label>
                  <SearchableTeamSelect id="team-context" value={teamContext} onChange={setTeamContext} required={false} />
                </div>
                <div className="composer-actions">
                  <span>Enter 发送 <i>·</i> Shift + Enter 换行</span>
                  <button className="submit-button" type="submit" disabled={loading || !draft.trim()}><span>{loading ? "研究中…" : waitingForAnswer ? "继续案件" : "开始研究"}</span><span className="button-arrow" aria-hidden="true">→</span></button>
                </div>
              </div>
              {error && <p className="error-message" role="alert">{error}</p>}
              {notice && <p className="plan-message" role="status">{notice}</p>}
            </form>
            <div className="conversation-footnote">已进行 {userCount} 轮用户输入 <span>·</span> 对话与报告可保存到此浏览器</div>
          </section>

          <section className="report-panel" aria-live="polite">
            {report ? <RecruitmentReportView report={report} reportedAt={reportAt} isWaiting={waitingForAnswer} /> : <EmptyReport datasetLabel={datasetLabel} />}
          </section>
        </div>
      </main>
      {playerObservationsOpen && <PlayerObservationsDialog onClose={() => setPlayerObservationsOpen(false)} />}
      <footer className="site-footer"><span>TactiScout <b>·</b> Football scouting research prototype</span><span>DATA SHOULD EXPLAIN THE RECOMMENDATION.</span></footer>
    </div>
  );
}

function SavedPlans({ plans, activePlanId, onOpen, onDelete, onNew }: {
  plans: SavedRecruitmentPlan[];
  activePlanId: string | null;
  onOpen: (plan: SavedRecruitmentPlan) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <section className="saved-plans" aria-label="保存的招募计划">
      <div className="saved-plans-heading">
        <div><span className="section-kicker">LOCAL WORKSPACE</span><h2>招募计划 <small>{plans.length}</small></h2></div>
        <button type="button" className="secondary-button new-plan-button" onClick={onNew}>＋ 新建案件</button>
      </div>
      {plans.length ? <div className="saved-plan-list">{plans.map((plan) => (
        <article className={`saved-plan-card ${activePlanId === plan.id ? "active" : ""}`} key={plan.id}>
          <div className="saved-plan-copy"><strong>{plan.name}</strong><span>{plan.lastReportedAt ? `最近报告 ${formatDate(plan.lastReportedAt)}` : "对话已保存，尚无报告"}</span></div>
          <div className="saved-plan-actions"><button type="button" className="text-button" onClick={() => onOpen(plan)}>打开</button><button type="button" className="text-button danger-text" onClick={() => onDelete(plan.id)}>删除</button></div>
        </article>
      ))}</div> : <p className="no-saved-plans">保存后，计划和最近一份分析报告会留在此浏览器。</p>}
    </section>
  );
}

function EmptyReport({ datasetLabel }: { datasetLabel: string }) {
  return (
    <div className="empty-state report-empty-state">
      <div className="pitch-art" aria-hidden="true"><span className="pitch-circle" /><span className="pitch-dot" /><span className="pitch-line" /></div>
      <span className="section-kicker">02 / SCOUTING REPORT</span>
      <h2>先说说你要解决的<br /><em>阵容问题。</em></h2>
      <p>球探会围绕可观察的比赛表现建立能力画像，比较候选人的数据、样本和风险，不会用未经验证的总分替代判断。</p>
      <div className="empty-data-note"><span className="status-dot" />当前数据来源：{datasetLabel}</div>
      <div className="empty-index"><span>INVESTIGATE</span><i /><span>COMPARE</span><i /><span>EXPLAIN</span></div>
    </div>
  );
}

function RecruitmentReportView({ report, reportedAt, isWaiting }: { report: RecruitmentReport; reportedAt: string | null; isWaiting: boolean }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => setSelectedIds([]), [report]);
  const selectedRecommendations = report.recommendations.filter((item) => selectedIds.includes(item.player.playerId));

  function toggleRecommendation(playerId: string) {
    setSelectedIds((current) => toggleComparedPlayer(current, playerId));
  }

  return (
    <div className="report-content">
      <div className="report-title-row">
        <div><span className="section-kicker">02 / SCOUTING REPORT</span><h2>{report.targetTeam || "球员招募"}<span className="heading-tail">候选评估</span></h2></div>
        <span className={`report-status ${isWaiting ? "report-status-pending" : ""}`}>{isWaiting ? "补充信息中" : "已完成一轮评估"}</span>
      </div>
      {isWaiting && <p className="snapshot-warning">正在等待补充信息。下方保留最近一次完整报告，后续调查完成后会更新。</p>}
      <section className="need-summary"><span className="report-section-label">需求理解</span><p>{report.needSummary}</p></section>
      {report.capabilityProfile.length > 0 && <section className="capability-profile"><span className="report-section-label">目标能力画像 · Agent 根据需求推导，可继续修正</span><ul>{report.capabilityProfile.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}
      {report.searchScopes.length > 0 && <section className="search-scope"><span className="report-section-label">候选检索范围</span><p>以下是 Agent 实际使用的条件；可继续在对话中补充或纠正。</p><ul>{report.searchScopes.map((scope, index) => <li key={`${scope.source}-${index}`}><strong>{scope.source === "user_confirmed" ? "用户确认" : scope.source === "mixed" ? "包含用户确认条件" : "Agent 根据对话解释"}</strong>{" · "}{[
        scope.position ? `位置 ${scope.position}` : null,
        scope.maxAge !== null ? `${scope.maxAge} 岁及以下` : null,
        scope.minimumMinutes > 0 ? `至少 ${scope.minimumMinutes} 分钟` : null,
        scope.competition ? `赛事 ${scope.competition}` : null,
        scope.season ? `赛季 ${scope.season}` : null,
      ].filter(Boolean).join(" · ") || "未设位置、年龄或赛事赛季限制"}</li>)}</ul></section>}
      <section className="evidence-coverage"><span className="report-section-label">证据覆盖</span><p>已评估 {report.evidenceCoverage.evaluatedCandidateCount} 名候选 · 指标值 {report.evidenceCoverage.availableMetricValues} / {report.evidenceCoverage.expectedMetricValues} 项 · 小样本 {report.evidenceCoverage.lowSampleCandidates} 人 · 同组比较受限 {report.evidenceCoverage.limitedPeerGroupCandidates} 人</p><small>说明当前数据覆盖和样本情况，不代表推荐正确率。</small></section>
      <section className="knowledge-coverage"><span className="report-section-label">资料检索</span><p>角色/方法片段 {report.knowledgeCoverage.methodologyChunksRetrieved} 条{report.knowledgeCoverage.methodologySearchFailed ? "（检索失败）" : ""} · 球员报告 {report.knowledgeCoverage.playerReportChunksRetrieved} 条{report.knowledgeCoverage.playerReportSearchFailed ? "（检索失败）" : report.knowledgeCoverage.playerReportSearchPerformed ? "（已在表现评估后检索）" : "（未检索）"}</p><small>球员报告只补充定性观察，不直接计入能力评分；关联比赛指标也不代表整条观察已证实。</small></section>
      <div className="recommendation-heading"><div><span className="report-section-label">候选推荐</span><p>名单顺序是建议的后续考察优先级，不是客观能力排名；每项依据都来自可观察数据。</p></div><span className="results-count">{String(report.recommendations.length).padStart(2, "0")} <small>球员</small></span></div>
      {report.recommendations.length ? <>
        <p className="compare-hint">选择 2–3 名球员，并排查看有数据支持的能力维度；缺失项会明确标出。</p>
        <CompareRecommendations recommendations={selectedRecommendations} onClear={() => setSelectedIds([])} />
        <div className="recommendation-list">{report.recommendations.map((recommendation, index) => <RecommendationCard key={recommendation.player.playerId} recommendation={recommendation} rank={index + 1} selected={selectedIds.includes(recommendation.player.playerId)} selectionDisabled={selectedIds.length >= 3 && !selectedIds.includes(recommendation.player.playerId)} onToggle={() => toggleRecommendation(recommendation.player.playerId)} />)}</div>
      </> : <div className="no-candidates"><span className="no-candidates-mark">∅</span><div><strong>当前证据不足以推荐具体球员</strong><p>Agent 的结论和仍缺少的数据列在下方。你也可以继续补充需求。</p></div></div>}
      {report.limitations.length > 0 && <details className="caveats-panel" open><summary><span>数据范围与风险</span><span className="details-plus">+</span></summary><ul>{report.limitations.map((limitation, index) => <li key={`${limitation}-${index}`}>{limitation}</li>)}</ul></details>}
      <div className="report-source"><span><i className="status-dot" />{report.dataSource}</span>{reportedAt && <span>报告时间 {formatDate(reportedAt)}</span>}</div>
    </div>
  );
}

function CompareRecommendations({ recommendations, onClear }: { recommendations: RecruitmentReport["recommendations"]; onClear: () => void }) {
  if (recommendations.length < 2) {
    return <div className="compare-empty"><span>球员比较</span><p>从推荐名单中选中至少两名候选人；最多可比较三人。</p></div>;
  }
  const metricRows = buildEvidenceComparison(recommendations);
  return (
    <section className="compare-panel" aria-label="推荐球员比较">
      <div className="compare-heading"><div><span className="section-kicker">SIDE BY SIDE</span><h3>能力证据比较</h3></div><button type="button" className="text-button" onClick={onClear}>清除选择</button></div>
      <div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>比较维度</th>{recommendations.map((item) => <th key={item.player.playerId}>{item.player.name}</th>)}</tr></thead><tbody>
        <tr><th scope="row">出场样本</th>{recommendations.map((item) => <td key={item.player.playerId}>{item.player.minutes.toLocaleString()} 分钟</td>)}</tr>
        <tr><th scope="row">赛事 / 赛季</th>{recommendations.map((item) => <td key={item.player.playerId}>{item.player.competition} · {item.player.season}</td>)}</tr>
        <tr><th scope="row">数据来源</th>{recommendations.map((item) => <td key={item.player.playerId}>{item.player.source}</td>)}</tr>
        <tr><th scope="row">样本与数据风险</th>{recommendations.map((item) => <td key={item.player.playerId}>{item.tradeoffs.join("；") || "暂无额外风险提示"}</td>)}</tr>
        {metricRows.map((metric) => <tr key={metric.key}><th scope="row">{metric.label}</th>{recommendations.map((item, index) => {
          const evidence = metric.values[index];
          const comparison = evidence?.peerPercentile === null
            ? `同组 ${evidence.peerGroupSize} 人，未显示百分位`
            : evidence
              ? `同组第 ${evidence.peerPercentile} 百分位 · ${evidence.peerGroupSize} 人`
              : "无数据";
          return <td key={item.player.playerId}>{evidence ? <>{formatMetric(evidence.value)} {evidence.unit}<small className="comparison-cell-detail">{comparison}</small></> : "无数据"}</td>;
        })}</tr>)}
      </tbody></table></div>
    </section>
  );
}

function RecommendationCard({ recommendation, rank, selected, selectionDisabled, onToggle }: {
  recommendation: RecruitmentReport["recommendations"][number];
  rank: number;
  selected: boolean;
  selectionDisabled: boolean;
  onToggle: () => void;
}) {
  const { player } = recommendation;
  return (
    <article className="recommendation-card">
      <div className="recommendation-card-heading"><span className="candidate-rank">{String(rank).padStart(2, "0")}</span><div className="candidate-title"><h3>{player.name}</h3><span>{player.team} <i>·</i> {player.competition} {player.season}</span></div></div>
      <div className="candidate-meta"><span>{player.position}</span><span>{player.age === null ? "年龄未知" : `${player.age} 岁`}</span><span>{player.minutes.toLocaleString()} 分钟</span></div>
      <p className="player-provenance">数据来源：{player.source}{player.sourceIdentity?.retrievedAt ? ` · 抓取于 ${formatDate(player.sourceIdentity.retrievedAt)}` : ""}</p>
      <label className="compare-select"><input type="checkbox" checked={selected} disabled={selectionDisabled} onChange={onToggle} /><span>加入比较</span></label>
      <p className="recommendation-rationale">{recommendation.rationale}</p>
      <div className="evidence-columns">
        <div><strong className="evidence-label">重点引用的数据</strong>{recommendation.strengths.length ? <ul>{recommendation.strengths.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>未单独标注</p>}</div>
        <div className="risk-column"><strong className="evidence-label">取舍与待核实</strong>{recommendation.tradeoffs.length ? <ul>{recommendation.tradeoffs.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>未单独标注</p>}</div>
      </div>
      {recommendation.evidence.length > 0 && <div className="evidence-table-wrap"><table className="evidence-table"><thead><tr><th>可观测指标</th><th>数值</th><th>对比组</th></tr></thead><tbody>{recommendation.evidence.map((evidence) => <tr key={evidence.key}><th scope="row">{evidence.label}{recommendation.focusEvidenceKeys.includes(evidence.key) && <small className="focus-evidence-tag">本轮重点</small>}</th><td>{formatMetric(evidence.value)} {evidence.unit}</td><td>{evidence.peerPercentile === null ? `样本 ${evidence.peerGroupSize} 人，不显示百分位` : `第 ${evidence.peerPercentile} 百分位 · ${evidence.peerGroupSize} 人`}</td></tr>)}</tbody></table></div>}
      {recommendation.reportObservations.length > 0 && <section className="report-observations"><strong className="evidence-label">球员定性观察</strong><ul>{recommendation.reportObservations.map((observation, index) => {
        const firstParty = observation.source.sourceId === firstPartyObservationSourceId;
        const internalObservationUrl = firstParty && new URL(observation.source.url).hostname === "tactiscout.local";
        return <li key={`${observation.source.sourceId}-${index}`}>
          <p>{observation.summary}</p>
          <small>{observation.verificationStatus === "linked_to_match_data" ? `关联比赛数据：${observation.linkedMetricKeys.join("、")}；需人工核实完整语义。` : "当前比赛数据未核实，作为单一来源的定性观点。"}</small>
          {firstParty && <small className="observation-origin">TactiScout 自录观察 · 作者观点，未经独立核实</small>}
          {internalObservationUrl
            ? <small>没有提供外部参考链接；此观察只保存在本机。</small>
            : <a href={observation.source.url} target="_blank" rel="noreferrer">{firstParty ? "打开观察者提供的参考链接" : `${observation.source.title} · ${observation.source.author} · ${observation.source.license}`}</a>}
          <small>{observation.source.attribution}</small>
        </li>;
      })}</ul></section>}
    </article>
  );
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知时间" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default App;
