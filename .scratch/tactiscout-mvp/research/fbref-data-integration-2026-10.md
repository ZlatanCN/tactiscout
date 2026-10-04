# FBref 当前球员数据与接入评估

核查日期：2026-10-04。范围：核对 FBref/Sports Reference 官方页面、覆盖说明、服务条款、bot 限流说明和 2026 年数据变更；不做批量抓取、不探测未公开 API、不绕过访问控制。本次网页工具对 FBref 正文和 `robots.txt` 的直接读取返回 403，因此不能确认当前 robots 规则或验证原始 HTML 抓取行为；页面内容核对依赖搜索索引呈现的官方页面摘要。本文是工程评估，不是法律意见。

## 结论

**FBref 的确能把 TactiScout 的候选表现数据扩展到拜仁、巴萨和五大联赛，且其站点自述覆盖 100 多项赛事、10 万名以上球员并每日更新。**目前可检索到 2026-27 赛季的五大联赛球员统计页，包含球员、位置组、年龄、球队、赛事、出场、分钟、进球、助攻等字段；俱乐部页也有赛季球员统计和赛程/比赛报告入口。[FBref 覆盖与更新说明](https://static.fbref.com/) · [赛事索引](https://fbref.com/en/comps) · [2026-27 Big 5 球员标准统计](https://fbref.com/en/comps/Big5/stats/players/Big-5-European-Leagues-Stats) · [Bayern 2026-27 球队页](https://fbref.com/en/squads/054efa67/2026-2027/all_comps/Bayern-Munich-Stats-All-Competitions) · [Barcelona 2026-27 球队页](https://fbref.com/en/squads/206d90db/2026-2027/all_comps/Barcelona-Stats-All-Competitions)

但“非商业”并不能解决当前 Agent 集成的主要问题：**Sports Reference 的现行条款明确禁止将网站内容（包括统计数据）用于 AI 模型的 prompting 或 instructing，措辞没有以商业用途为条件。**TactiScout 会把球员证据交给 LangGraph/LLM 并要求模型产出推荐理由，因此自动抓取后直接送模型与该条款描述的限制正面冲突。条款也限制会不利影响站点性能/访问的自动化访问，并限制构建竞争或实质替代的数据服务。[Sports Reference Terms](https://www.sports-reference.com/termsofuse.html)

另外，FBref 并非此前印象中的完整高阶球探指标仓库。Sports Reference 于 2026-01-20 公告称已删除原有高级足球数据供给，之后若恢复高级数据也会是显著缩小的范围；官方说明仍会保留 100 多项赛事的历史基础数据。[2026-01-20 官方公告](https://www.sports-reference.com/blog/2026/01/fbref-stathead-data-update/) 所以它能补当前比赛的基础表现和部分常规统计，但不能据此承诺有完整 xG、推进、压迫或其他高阶能力数据。站点的赛事/赛季覆盖也不等同完整现役注册阵容；FBref 自己提示球员记录可能不完整，球员可能来自未覆盖的联赛。[FBref FAQ](https://fbref.com/en/about/faq)

**工程建议：**FBref 是高覆盖、近期表现网页的好人工核查入口；在没有取得明确书面许可前，不把自动抓取的内容纳入 TactiScout 的 LLM/Harness/RAG，也不把它复制成持久球员库。若获得了涵盖自动提取、模型使用和作品集展示的明确授权，才按下文方式实现单一 `FbrefPlayerRepository`，先做一个赛季、一个 Big 5 汇总页和最少指标页的低频缓存样机。

## 官方页面和字段观察

| 页面 | 官方页可见内容 | 对 TactiScout 的用途与边界 |
| --- | --- | --- |
| Big 5 球员标准统计 | `Player, Nation, Pos, Squad, Comp, Age, Born, MP, Starts, Min, 90s, Gls, Ast`，并提供常见标准表现的每 90 分钟值。[2026-27 标准统计](https://fbref.com/en/comps/Big5/stats/players/Big-5-European-Leagues-Stats) | 一页可用于五大联赛表演数据候选池的起点；年龄、球队归属是该赛季页面展示值，不是转会窗口期的实时注册名单或官方名册。 |
| 出场时间 | 出场、分钟、首发、替补及每场参与时间等。[Big 5 出场时间](https://fbref.com/en/comps/Big5/playingtime/players/Big-5-European-Leagues-Stats) | 可用于剔除分钟样本过小的球员、解释可靠性；建立最低分钟阈值仍需产品自行定义。 |
| 防守行为 | 防守页类别名包括抢断、抢断成功、封堵、拦截、解围等。[Big 5 Defensive Actions](https://fbref.com/en/comps/Big5/defense/players/Big-5-European-Leagues-Stats) | 只在当前赛季/赛事页面确有值的字段上使用；页面表头存在不代表每一字段仍有数据。 |
| 创造射门/进球 | 球员页有 SCA/GCA（射门/进球创造行为）分类入口。[Big 5 Goal and Shot Creation](https://fbref.com/en/comps/Big5/gca/players/Big-5-European-Leagues-Stats) | 2026-27 页面索引目前可见不少高阶列为空。不要仅根据列名把空白当 0，亦不要预先承诺稳定供应。 |
| 联赛/赛事覆盖 | 赛事目录覆盖男/女足、国内联赛和部分杯赛，目录当前包含 2026-27 赛季。[赛事目录](https://fbref.com/en/comps) | 覆盖广但不等于全球完整；跨赛季、跨联赛统计口径需要在报告中分开标注。 |
| 球员/球队范围 | FBref 明确说明球员历史记录可能不完整，也可能效力于其未覆盖的联赛。[FAQ](https://fbref.com/en/about/faq) | 只能称“所选 FBref 联赛/赛季中有表现记录的球员池”，不能称“完整现役转会市场”。无合同、工资、身价、可售状态或预算数据。 |
| 高频变动/完整性 | 主页自述“Updated daily”；条款则说网站无义务在特定时间更新，且不保证及时、完整、正确或准确。[主页](https://static.fbref.com/) · [条款第 3、4 节](https://www.sports-reference.com/termsofuse.html) | 只能显示“抓取于某时刻的页面快照”，不能给新鲜度 SLA，也不能把“daily”宣传语升级成逐场/逐指标保证。 |

官方统计覆盖页把基本统计举例为进球、分钟、出场、牌，把中级统计举例为传中、成功抢断、射门、拦截，同时警告位置数据按赛季层级构造，可能包含并非经常踢该位置的球员。[FBref Stat Coverage](https://fbref.com/en/stathead/stat_coverage.cgi) 2026 年高阶供给移除公告和实际搜索到的当前页数据列需要一起看，不能拿旧时期的页面教程/数据抓取包来推断现有字段。

## 条款与访问限制

1. **AI 处理限制与商业性无关。**Terms of Use 第 5 节（禁止事项第 11 条）禁止复制或使用网站材料（含统计、数据、文本等）来训练、微调、prompt 或 instruct AI 模型/技术，以产生答案、文本、分数、统计等输出，或支持模型预测、分类、标记和评分。条款写的是“in any manner”，没有非商业用途例外。TactiScout 现在会将候选证据送进模型生成结论，所以单纯在页脚增加来源链接并不能消除这一冲突。[Terms of Use](https://www.sports-reference.com/termsofuse.html)
2. **自动访问并非因低频就自动获准。**Terms 禁止未经书面许可、且会不利影响性能或访问的 scripts/bots/scrapers/data-miners。另一个官方页面说明 FBref/Stathead 会阻挡超过每分钟 10 个请求的 session，违反后 session 最长可能被封一天。这只是技术限流，不应解释为“低于 10 次/分钟就允许”。官方还解释网站没有 API，是因为其许多数据来自第三方，合同不允许作为下载数据提供。[Bot/Scraping Traffic](https://www.sports-reference.com/bot-traffic.html)
3. **robots.txt 当前状态未核实。**本次直接读取 `https://fbref.com/robots.txt` 经网页工具返回 403，命令行网络也无法解析站点；因而不声称允许或禁止具体页面路径，也不以搜索索引或其他域的 robots 规则代替 FBref 自身规则。
4. **访问可见不等于接口/批量许可。**官方页面是可浏览的 HTML 表格；官方没有提供开放 API，且官方 bot 页面说明 API 缺失与上游数据协议有关。遇到 403、验证码、限流或页面结构变化时，不应更换身份、代理、指纹或隐藏端点绕过；应停止自动请求，或者走书面许可渠道。

## 最小读取方案（仅在取得覆盖用途的书面授权后）

这不是绕开现行条款的建议；在没有授权时，Agent 不应自动取数或把页面内容送入 LLM。

1. **首个窄样机只读当前赛季 Big 5 球员标准统计汇总页。**它已经给出俱乐部、联赛、年龄、位置组、出场分钟、进球/助攻，不必按球队逐页爬完整五大联赛。第一版只把它当“有出场表现记录的球员池”，不声称全 roster。
2. **只有岗位分析确实需要时，再增加一到两个当前指标表。**优先核实指定联赛/赛季表实际填充的传球、防守或控球列；不抓所有球员页、比赛页、评论文本和图片。每个新页面类型都需核对条款允许范围和实际字段可用性。
3. **人工/Agent 请求频率保持低于官方阻断阈值很多。**如许可允许自动化，可用每个页面至少 24 小时缓存、单并发、每次任务复用缓存、每分钟不超过 1 个请求；遇到 403/429/挑战立即停止并提示数据不可用。官方页面只承诺主页的 daily 更新宣传，没有可依赖的比赛后更新时间。
4. **解析语义化表头而不是依赖列序号。**部分表有多行表头、赛季和赛事差异；解析后校验表名、球员链接 ID、team/competition/season link、分钟列和必要字段。遇到 schema 漂移就 fail closed，不要把空值写成 0。
5. **按稳定身份和来源时间落 `PlayerProfile`。**优先使用球员页链接中的 FBref ID，而不是只按名字；同一球员在赛季内转会时，要保留 team/competition 分开的行，只有明确需求时另算合并赛季统计。每条候选保存源 URL、`retrievedAt`、赛季、赛事、样本分钟和字段覆盖。

## 对当前 provider 与 Agent 的适配

当前 [PlayerRepository 接口](../../../src/data/provider.ts) 已提供 `searchCandidates`、`inspectTeam`、`getPlayersByIds`，`PlayerProfile` 已包含 `availableStats`、`sourceIdentity` 和 `retrievedAt`，适合新增独立 adapter；但 `DatasetMode` 目前没有 `fbref`，需要新增模式，并在来源描述与 `DatasetScope` 里明确覆盖范围。可按下列映射设计：

| FBref 字段 | 现有模型字段/处理 |
| --- | --- |
| FBref `/players/{id}/` 链接 | `sourceIdentity.provider = "fbref"`、`sourceIdentity.playerId = id`、`externalPlayerId`；不要仅用姓名建立身份。 |
| team link / competition link / season page | `sourceIdentity.teamId`、`competitionId`、`seasonId`；同时填 `team`、`competition`、`season`。 |
| `Age` / `Born` / `Pos` | 年龄是页面快照字段；位置先只映射 GK/DF/MF/FW 到 GK/DEF/MID/ATT，不能把赛季泛位置推断成 CB/边卫/后腰。 |
| `Min`, `Gls`, `Ast`, 实际有值的传球/防守指标 | 映射到现有 raw stats；只把页面实际提供的字段加入 `availableStats`。如果使用的字段不在当前 `RawStatsSchema`，先做有证据的扩展。 |
| 页面空白或页面不含的指标 | 保持不可用（不放入 `availableStats`），不要写成 0；这样评分可以降置信度或将属性标成未覆盖。 |
| 页面访问时刻、原页面链接 | `retrievedAt` 与报告里的数据来源快照，展示“抓取时间/赛季/联赛”。 |

适配里最关键的非技术约束是使用开关：授权未确认时，不能把自动取得的 FBref 内容送入当前 `conversation.ts` 的 LLM prompt，也不能作为 scoring 的数据存储或 RAG 语料。若产品仍需在这一版跑 LangGraph，继续使用现有明确允许模型处理的来源/本地样本；FBref 先作为人工对照链接。若日后拿到覆盖“自动抓取 + 商业/非商业展示 + LLM 推理/打分”的书面许可，再按以上窄样机实施并保存许可范围和有效期。

## 一手来源

- [FBref 首页：覆盖和 daily 更新自述](https://static.fbref.com/)
- [FBref FAQ：数据覆盖、球员记录完整性](https://fbref.com/en/about/faq)
- [FBref competitions 目录](https://fbref.com/en/comps)
- [FBref 2026-27 Big 5 球员标准统计](https://fbref.com/en/comps/Big5/stats/players/Big-5-European-Leagues-Stats)
- [FBref 2026-27 Big 5 出场时间](https://fbref.com/en/comps/Big5/playingtime/players/Big-5-European-Leagues-Stats)
- [FBref 2026-27 Big 5 防守行为](https://fbref.com/en/comps/Big5/defense/players/Big-5-European-Leagues-Stats)
- [FBref 2026-27 Big 5 Goal and Shot Creation](https://fbref.com/en/comps/Big5/gca/players/Big-5-European-Leagues-Stats)
- [FBref Stat Coverage](https://fbref.com/en/stathead/stat_coverage.cgi)
- [Sports Reference Terms of Use](https://www.sports-reference.com/termsofuse.html)
- [Sports Reference Bot/Scraping/Crawler Traffic](https://www.sports-reference.com/bot-traffic.html)
- [Sports Reference: FBref & Stathead Data Update（2026-01-20）](https://www.sports-reference.com/blog/2026/01/fbref-stathead-data-update/)
- [Bayern 2026-27 All Competitions](https://fbref.com/en/squads/054efa67/2026-2027/all_comps/Bayern-Munich-Stats-All-Competitions)
- [Barcelona 2026-27 All Competitions](https://fbref.com/en/squads/206d90db/2026-2027/all_comps/Barcelona-Stats-All-Competitions)
