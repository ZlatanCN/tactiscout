import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  deletePlayerObservation,
  getPlayerObservations,
  savePlayerObservation,
} from "./api";
import {
  PlayerObservationDimensionDefinitions,
  PlayerObservationInputSchema,
  PlayerObservationRatingSchema,
  PlayerObservationDimensionSchema,
  type PlayerObservation,
  type PlayerObservationInput,
} from "../../src/observations/schemas.js";
import { PositionSchema } from "../../src/domain/schemas.js";
import { summarizePlayerObservationDataset } from "../../src/observations/dataset-summary.js";

interface Props {
  onClose: () => void;
}

interface Draft {
  playerName: string;
  playerAliases: string;
  playerIdentityProvider: string;
  externalPlayerId: string;
  teamAtObservation: string;
  observedPosition: string;
  observedRole: string;
  competition: string;
  season: string;
  match: string;
  observedAt: string;
  matchMinute: string;
  observer: string;
  strengths: string;
  risks: string;
  ratings: Array<{ dimension: string; rating: string; matchMinute: string; evidence: string }>;
  evidenceNote: string;
  sourceReferenceUrl: string;
  allowPersistentStorage: boolean;
  allowAiProcessing: boolean;
}

function today(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  return {
    playerName: "",
    playerAliases: "",
    playerIdentityProvider: "",
    externalPlayerId: "",
    teamAtObservation: "",
    observedPosition: "",
    observedRole: "",
    competition: "",
    season: "",
    match: "",
    observedAt: today(),
    matchMinute: "",
    observer: "",
    strengths: "",
    risks: "",
    ratings: [],
    evidenceNote: "",
    sourceReferenceUrl: "",
    allowPersistentStorage: false,
    allowAiProcessing: false,
  };
}

function draftFromRecord(record: PlayerObservation): Draft {
  return {
    playerName: record.playerName,
    playerAliases: record.playerAliases.join("\n"),
    playerIdentityProvider: record.playerIdentityProvider ?? "",
    externalPlayerId: record.externalPlayerId ?? "",
    teamAtObservation: record.teamAtObservation ?? "",
    observedPosition: record.observedPosition ?? "",
    observedRole: record.observedRole ?? "",
    competition: record.competition ?? "",
    season: record.season ?? "",
    match: record.match ?? "",
    observedAt: record.observedAt,
    matchMinute: record.matchMinute === null ? "" : String(record.matchMinute),
    observer: record.observer,
    strengths: record.strengths.join("\n"),
    risks: record.risks.join("\n"),
    ratings: record.ratings.map((rating) => ({
      dimension: rating.dimension,
      rating: String(rating.rating),
      matchMinute: rating.matchMinute === null ? "" : String(rating.matchMinute),
      evidence: rating.evidence,
    })),
    evidenceNote: record.evidenceNote,
    sourceReferenceUrl: record.sourceReferenceUrl ?? "",
    allowPersistentStorage: record.allowPersistentStorage,
    allowAiProcessing: record.allowAiProcessing,
  };
}

function lines(value: string): string[] {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function inputFromDraft(draft: Draft): PlayerObservationInput {
  return PlayerObservationInputSchema.parse({
    playerName: draft.playerName,
    playerAliases: lines(draft.playerAliases),
    playerIdentityProvider: draft.playerIdentityProvider.trim() || null,
    externalPlayerId: draft.externalPlayerId.trim() || null,
    teamAtObservation: draft.teamAtObservation.trim() || null,
    observedPosition: draft.observedPosition || null,
    observedRole: draft.observedRole.trim() || null,
    competition: draft.competition.trim() || null,
    season: draft.season.trim() || null,
    match: draft.match.trim() || null,
    observedAt: draft.observedAt,
    matchMinute: draft.matchMinute.trim() ? Number(draft.matchMinute) : null,
    observer: draft.observer,
    strengths: lines(draft.strengths),
    risks: lines(draft.risks),
    ratings: draft.ratings.map((rating) => PlayerObservationRatingSchema.parse({
      dimension: PlayerObservationDimensionSchema.parse(rating.dimension),
      rating: Number(rating.rating),
      matchMinute: rating.matchMinute.trim() ? Number(rating.matchMinute) : null,
      evidence: rating.evidence,
    })),
    evidenceNote: draft.evidenceNote,
    sourceReferenceUrl: draft.sourceReferenceUrl.trim() || null,
    allowPersistentStorage: draft.allowPersistentStorage,
    allowAiProcessing: draft.allowAiProcessing,
  });
}

function validationMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请检查观察记录后再保存。";
}

export function PlayerObservationsDialog({ onClose }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const savingRef = useRef(false);
  const [records, setRecords] = useState<PlayerObservation[]>([]);
  const [selectedId, setSelectedId] = useState("new");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedRecord = records.find((record) => record.id === selectedId);
  const datasetSummary = useMemo(() => summarizePlayerObservationDataset(records), [records]);
  closeRef.current = onClose;
  savingRef.current = saving;

  useEffect(() => {
    let active = true;
    getPlayerObservations()
      .then((loaded) => { if (active) setRecords(loaded); })
      .catch((caught: unknown) => { if (active) setError(validationMessage(caught)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setDraft(selectedId === "new" ? emptyDraft() : selectedRecord ? draftFromRecord(selectedRecord) : emptyDraft());
    setError(null);
  }, [selectedId, selectedRecord]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const focusableElements = () => [...dialog.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
    )].filter((element) => element.getClientRects().length > 0);
    dialog.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!savingRef.current) closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  function updateDraft<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateRating(index: number, field: keyof Draft["ratings"][number], value: string) {
    setDraft((current) => ({
      ...current,
      ratings: current.ratings.map((rating, currentIndex) => currentIndex === index ? { ...rating, [field]: value } : rating),
    }));
  }

  function addRating() {
    if (draft.ratings.length >= 8) return;
    const selected = new Set(draft.ratings.map((rating) => rating.dimension));
    const nextDimension = PlayerObservationDimensionSchema.options.find((dimension) => !selected.has(dimension))
      ?? PlayerObservationDimensionSchema.options[0];
    updateDraft("ratings", [...draft.ratings, { dimension: nextDimension, rating: "", matchMinute: "", evidence: "" }]);
  }

  function removeRating(index: number) {
    updateDraft("ratings", draft.ratings.filter((_rating, currentIndex) => currentIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setNotice(null);
    let input: PlayerObservationInput;
    try {
      input = inputFromDraft(draft);
    } catch (caught) {
      setError(validationMessage(caught));
      return;
    }

    setSaving(true);
    try {
      const saved = await savePlayerObservation(selectedId === "new" ? null : selectedId, input);
      setRecords((current) => [...current.filter((record) => record.id !== saved.id), saved]);
      setSelectedId(saved.id);
      setNotice(saved.indexStatus === "indexed"
        ? "观察已保存，并已加入 Agent 的球员报告检索。"
        : saved.indexStatus === "index_failed"
          ? "观察已保存在本机，但索引暂未完成；再次保存可重试。"
          : "观察已保存在本机；只有你明确授权后才会加入 Agent 检索。 ");
    } catch (caught) {
      setError(validationMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeSelected(askForConfirmation = true) {
    if (!selectedRecord || saving) return;
    if (askForConfirmation && !window.confirm(`删除 ${selectedRecord.playerName} 的这条球探观察？`)) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deletePlayerObservation(selectedRecord.id);
      setRecords((current) => current.filter((record) => record.id !== selectedRecord.id));
      setSelectedId("new");
      setNotice("已删除本机观察记录，并从当前检索索引中移除。");
    } catch (caught) {
      setError(validationMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function changeStoragePermission(allowed: boolean) {
    if (allowed) {
      updateDraft("allowPersistentStorage", true);
      return;
    }
    if (selectedRecord) {
      if (!window.confirm(`撤回本地保存授权会删除 ${selectedRecord.playerName} 的这条观察和当前检索片段。继续吗？`)) return;
      void removeSelected(false);
      return;
    }
    updateDraft("allowPersistentStorage", false);
  }

  return (
    <div className="observation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
        <section ref={dialogRef} className="observation-dialog" role="dialog" aria-modal="true" aria-labelledby="observation-dialog-title" aria-describedby="observation-dialog-description" tabIndex={-1}>
        <header className="observation-dialog-header">
          <div>
            <span className="section-kicker">FIRST-PARTY SCOUTING NOTES</span>
            <h2 id="observation-dialog-title">球探观察记录</h2>
            <p id="observation-dialog-description">每条记录对应一名球员的一场比赛。写明赛事、赛季、比赛和具体场景；这里不会抓取外部链接，也不应粘贴第三方报告全文。</p>
          </div>
          <button type="button" className="observation-close" onClick={onClose} aria-label="关闭球探观察" disabled={saving}>×</button>
        </header>

        <div className="observation-dialog-body">
          <aside className="observation-library" aria-label="已有观察记录">
            <button type="button" className={`observation-new-button ${selectedId === "new" ? "selected" : ""}`} onClick={() => { setNotice(null); setSelectedId("new"); }}>＋ 新建观察</button>
            <section className="observation-dataset-summary" aria-label="自采观察数据概况">
              <div className="observation-dataset-summary-heading">
                <strong>自采样本</strong>
                <span>按记录统计，不按姓名合并</span>
              </div>
              <div className="observation-dataset-stats">
                <div><strong>{datasetSummary.observationRecords}</strong><span>场次记录</span></div>
                <div><strong>{datasetSummary.matchScopedRecords}/{datasetSummary.observationRecords}</strong><span>赛事、赛季、比赛齐全</span></div>
                <div><strong>{datasetSummary.ratingEntries}</strong><span>条主观维度判断</span></div>
                <div><strong>{datasetSummary.indexedRecords}</strong><span>已授权检索</span></div>
              </div>
              {datasetSummary.ratingEntries > 0 && <div className="observation-dataset-dimensions" aria-label="各能力维度记录数">
                {datasetSummary.dimensionCoverage.filter((item) => item.recordCount > 0).map((item) => <span key={item.dimension}>{item.label}<b>{item.recordCount}</b></span>)}
              </div>}
              {datasetSummary.observationRecords === 0 && <p className="observation-dataset-empty">还没有真实样本。先固定一个位置和比赛范围，再按同一量表记录场景；没有看到的维度留空。</p>}
            </section>
            {loading ? <p className="observation-list-state">正在读取本机记录…</p> : records.length === 0
              ? <p className="observation-list-state">还没有自录观察。</p>
              : records.map((record) => (
                <button type="button" className={`observation-list-card ${selectedId === record.id ? "selected" : ""}`} key={record.id} onClick={() => { setNotice(null); setSelectedId(record.id); }}>
                  <strong>{record.playerName}</strong>
                  <span>{record.observedAt} · {record.competition ?? "赛事待补"}</span>
                  <small>{record.ratings.length ? `${record.ratings.length} 项能力观察 · ` : ""}{record.indexStatus === "indexed" ? "已加入 Agent 检索" : record.indexStatus === "index_failed" ? "索引待重试" : "仅保存在本机"}</small>
                </button>
              ))}
            <p className="observation-storage-note">本机服务保存于忽略提交的 `.data/player-observations.json`。</p>
          </aside>

          <form className="observation-form" onSubmit={(event) => void submit(event)}>
            {selectedRecord?.indexStatus === "index_failed" && <p className="observation-index-warning">这条观察尚未进入检索索引。保留模型处理授权并重新保存可再次尝试。</p>}
            <div className="observation-form-grid">
              <label className="observation-field observation-field-wide"><span>球员姓名 <b>*</b></span><input data-dialog-autofocus value={draft.playerName} onChange={(event) => updateDraft("playerName", event.target.value)} required maxLength={120} /></label>
              <label className="observation-field"><span>观察日期 <b>*</b></span><input type="date" value={draft.observedAt} onChange={(event) => updateDraft("observedAt", event.target.value)} required /></label>
              <label className="observation-field"><span>观察者 <b>*</b></span><input value={draft.observer} onChange={(event) => updateDraft("observer", event.target.value)} required maxLength={120} placeholder="你的姓名或观察者署名" /></label>
              <label className="observation-field"><span>其他球员姓名</span><textarea rows={2} value={draft.playerAliases} onChange={(event) => updateDraft("playerAliases", event.target.value)} placeholder="每行一个，例如常用拼写" /></label>
              <label className="observation-field"><span>关联数据来源</span><input value={draft.playerIdentityProvider} onChange={(event) => updateDraft("playerIdentityProvider", event.target.value)} placeholder="例如 Sportmonks" maxLength={80} /></label>
              <label className="observation-field"><span>来源中的球员 ID</span><input value={draft.externalPlayerId} onChange={(event) => updateDraft("externalPlayerId", event.target.value)} placeholder="与上项同时填写" maxLength={120} /></label>
              <label className="observation-field"><span>观察时效力球队</span><input value={draft.teamAtObservation} onChange={(event) => updateDraft("teamAtObservation", event.target.value)} placeholder="由观察者记录" maxLength={120} /></label>
              <label className="observation-field"><span>观察时位置</span><select value={draft.observedPosition} onChange={(event) => updateDraft("observedPosition", event.target.value)}><option value="">未知 / 未记录</option>{PositionSchema.options.map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
              <label className="observation-field observation-field-wide"><span>观察时职责</span><input value={draft.observedRole} onChange={(event) => updateDraft("observedRole", event.target.value)} placeholder="例如右侧中卫、内收边后卫；只记这场比赛中的职责" maxLength={120} /></label>
              <label className="observation-field"><span>赛事</span><input value={draft.competition} onChange={(event) => updateDraft("competition", event.target.value)} placeholder="例如 Bundesliga" maxLength={120} /></label>
              <label className="observation-field"><span>赛季</span><input value={draft.season} onChange={(event) => updateDraft("season", event.target.value)} placeholder="例如 2025/26" maxLength={40} /></label>
              <label className="observation-field observation-field-wide"><span>比赛</span><input value={draft.match} onChange={(event) => updateDraft("match", event.target.value)} placeholder="例如 Bayern vs Example FC" maxLength={180} /></label>
              <label className="observation-field"><span>比赛分钟</span><input type="number" min={0} max={150} value={draft.matchMinute} onChange={(event) => updateDraft("matchMinute", event.target.value)} placeholder="可选" /></label>
              <label className="observation-field observation-field-wide"><span>表现优势 <b>*</b></span><textarea rows={3} value={draft.strengths} onChange={(event) => updateDraft("strengths", event.target.value)} placeholder="每行一条，只记录你亲眼观察到的内容" required /></label>
              <label className="observation-field observation-field-wide"><span>待核实风险</span><textarea rows={3} value={draft.risks} onChange={(event) => updateDraft("risks", event.target.value)} placeholder="每行一条；没有明确风险时可以留空" /></label>
              <label className="observation-field observation-field-wide"><span>具体比赛观察 <b>*</b></span><textarea rows={4} value={draft.evidenceNote} onChange={(event) => updateDraft("evidenceNote", event.target.value)} placeholder="记下比赛场景、动作和结果；至少 20 个字符。它仍是你的主观观察，不等于统计事实。" required /></label>
              <details className="observation-ratings observation-field-wide">
                <summary>结构化能力观察 <span>可选 · 按本场样本记录</span></summary>
                <p>评分由观察者填写，按该球员本场职责和比赛级别判断。1 表示明显短板，3 表示表现参差或一般，5 表示多次展现突出表现；无证据时留空。不同记录不会自动平均或计入适配分。</p>
                <div className="observation-rating-list">
                  {draft.ratings.map((rating, index) => {
                    const dimension = PlayerObservationDimensionSchema.safeParse(rating.dimension);
                    const definition = dimension.success ? PlayerObservationDimensionDefinitions[dimension.data] : undefined;
                    return <fieldset className="observation-rating-card" key={`${rating.dimension}-${index}`}>
                      <div className="observation-rating-controls">
                        <label className="observation-field"><span>能力维度 <b>*</b></span><select value={rating.dimension} onChange={(event) => updateRating(index, "dimension", event.target.value)}>{Object.entries(PlayerObservationDimensionDefinitions).map(([key, value]) => <option key={key} value={key}>{value.label} · {value.phase === "in_possession" ? "有球" : value.phase === "out_of_possession" ? "无球" : "转换"}</option>)}</select></label>
                        <label className="observation-field"><span>主观档位 <b>*</b></span><select value={rating.rating} onChange={(event) => updateRating(index, "rating", event.target.value)} required><option value="">选择 1–5</option><option value="1">1 · 明显短板</option><option value="2">2 · 偏弱</option><option value="3">3 · 一般 / 参差</option><option value="4">4 · 经常展现优势</option><option value="5">5 · 多次突出</option></select></label>
                        <label className="observation-field"><span>比赛分钟</span><input type="number" min={0} max={150} value={rating.matchMinute} onChange={(event) => updateRating(index, "matchMinute", event.target.value)} placeholder="可选" /></label>
                        <button type="button" className="text-button danger-text observation-rating-remove" onClick={() => removeRating(index)}>移除此项</button>
                      </div>
                      <label className="observation-field"><span>支持此判断的具体场景 <b>*</b>{definition ? ` · ${definition.description}` : ""}</span><textarea rows={2} value={rating.evidence} onChange={(event) => updateRating(index, "evidence", event.target.value)} placeholder="描述对手压力、球员动作、结果；至少 20 个字符" required /></label>
                    </fieldset>;
                  })}
                </div>
                <button type="button" className="observation-rating-add" onClick={addRating} disabled={draft.ratings.length >= 8}>＋ 添加一个维度</button>
              </details>
              <label className="observation-field observation-field-wide"><span>参考链接</span><input type="url" value={draft.sourceReferenceUrl} onChange={(event) => updateDraft("sourceReferenceUrl", event.target.value)} placeholder="可选，仅作为出处链接；不会自动访问或抓取" /></label>
            </div>

            <fieldset className="observation-permissions">
              <legend>保存与使用权限</legend>
              <label><input type="checkbox" checked={draft.allowPersistentStorage} onChange={(event) => changeStoragePermission(event.target.checked)} /><span><strong>允许保存在这台设备上</strong><small>记录写入本机项目数据目录；取消已保存记录的授权会删除该记录。</small></span></label>
              <label><input type="checkbox" checked={draft.allowAiProcessing} onChange={(event) => updateDraft("allowAiProcessing", event.target.checked)} /><span><strong>允许加入 Agent 检索与模型分析</strong><small>若模型或 embedding 配置为远程服务，观察文本可能发送给该服务；关闭后会从当前检索索引移除。</small></span></label>
            </fieldset>

            <div className="observation-form-footer">
              <div>{error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="plan-message" role="status">{notice}</p>}</div>
              <div className="observation-form-actions">
                {selectedRecord && <button type="button" className="text-button danger-text" onClick={() => void removeSelected()} disabled={saving}>删除记录</button>}
                <button type="submit" className="submit-button observation-save-button" disabled={saving}>{saving ? "正在保存…" : "保存观察"}<span className="button-arrow" aria-hidden="true">→</span></button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
