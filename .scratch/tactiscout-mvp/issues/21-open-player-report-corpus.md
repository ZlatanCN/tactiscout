# Find an ingestible football player-report corpus

Type: research
Status: resolved
Labels: wayfinder:research

## Question

Can TactiScout use a concrete, preferably free or low-cost source of named football scouting/player reports in its `player_report` RAG corpus without relying on unsupported scraping assumptions?

## Acceptance criteria

- Research at least three credible candidate sources using owner-published documentation, terms, licenses, or API policies.
- Assess discovery, automated access, persistent storage, AI/LLM/embedding processing, public display, and attribution separately; mark unknown permissions as unverified.
- Identify a feasible first source or conclude none qualifies and define the next practical option, such as a licensed manual-import workflow or first-party authored report set.
- Write the source comparison and recommendation to `../research/player-report-corpus-landscape-2026-10.md` with direct first-party citations.
- Update the RAG plan only after the evidence supports a recommendation; do not ingest source material while permissions remain unclear.

## Answer

没有找到同时明确允许程序化获取、持久保存、AI/RAG 处理和面向用户展示的现成真实具名球员报告语料；因此本项目不采集 SCOUTED、CIES、PFSA、Wyscout 或媒体全文。来源比较、用途权限和一手引用见[具名球员报告语料调查](../research/player-report-corpus-landscape-2026-10.md)。

近期采用两条分开的路线：真实球员评估继续依赖有许可的数据源；定性观察由 TactiScout 作者或经授权的观察者自行撰写，并保留球员身份、比赛和观察时间、作者、来源与用途许可。明确虚构且许可清楚的数据集可以作为合成检索夹具，必须标示虚构、不得冒充真实球员或真实能力。已核对的 TransferTalk Players 数据卡明确说明 1,000 条记录中的球员、球队和联赛均为虚构，文本由本地模型生成并标注 MIT；文件版本和内容仍须在引入前复核，暂不把整个 395 MB 数据集下载进应用。[TransferTalk Players 数据卡](https://huggingface.co/datasets/yanivohayon1/transfertalk-players)。

下一项产品工作应实现第一方球员观察记录及其检索/删除链路，详见 [issue 23](23-first-party-player-observations.md)。
