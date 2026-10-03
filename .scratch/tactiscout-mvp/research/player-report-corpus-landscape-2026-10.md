# TactiScout 具名球员报告语料来源调查

研究日期：2026-10-04。仅核对来源所有者、出版方、数据集作者或官方产品的一手页面、条款、数据卡和 API/数据集说明。本文用于工程选型，不构成法律意见。页面可访问、允许下载样例、订阅后可阅读，均不自动等于允许自动采集、长期保存、embedding/RAG、向模型发送或公开展示。

## 结论

本次没有找到同时满足下列条件的现成真实球员语料：

1. 内容是具名真实球员的定性球探判断，而不只是赛后新闻、比赛评论、数据统计或空白报告模板；
2. 来源明确允许程序化获取与持久保存；
3. 明确允许为检索问答生成 embedding、将正文交给 LLM/RAG 处理，并在 TactiScout 面向用户的报告中按来源展示。

**因此，现阶段不要把第三方球探报告全文导入默认 RAG。** 近期最可交付的做法是：以有明确数据许可的结构化比赛表现作为真实球员证据；在 TactiScout 内创建由用户/项目作者撰写、来源和观察时间齐全的定性观察；另用明确标为虚构的合成数据评测检索、工具调用和证据归因。对 SCOUTED 等高质量报告来源，先通过书面许可确认自动化、缓存、模型处理、展示及退出后的删除规则。

## 候选来源

| 优先级 / 来源 | 有什么具名内容 | 自动访问与保存 | AI / embedding / RAG | 展示 / 署名 | 费用与判断 |
| --- | --- | --- | --- | --- | --- |
| **P0：自建观察记录** | 由 TactiScout 作者或有授权的观察者，为具体球员写比赛、角色、优点、风险、比赛时间点和来源。 | 自有录入功能可以明确约定保存与删除。 | 可以在应用条款/录入说明中取得报告作者对检索和模型处理的授权；第三方视频/文章仍按各自权限处理。 | 展示作者、比赛、观察日期和引用材料；把“观察者判断”与“比赛事实/结构化统计/模型推断”分开。 | 成本最低且能成为真正的产品语料。推荐先做一个 10–20 条小型人工审核样本集，再建设可增长的收集流程。 |
| **P1：合成球探报告数据集** | Hugging Face 的 [TransferTalk Players](https://huggingface.co/datasets/yanivohayon1/transfertalk-players) 作者数据卡称有 1,000 名完全虚构球员、虚构球队与联赛，包含 biography、strengths、weaknesses、scouting_report，且内容为本地模型生成；卡片标注 MIT。另一份 [ProScout Players](https://huggingface.co/datasets/Ilayr222/proscout-players-1112) 标注 CC BY 4.0，1,112 条虚构球员档案，适合文本检索演示。 | 作者数据卡公开提供；MIT/CC BY 许可按各自条件保留许可证与署名。实施前仍要锁定下载版本、核对文件与数据卡一致。 | 数据集用途包含推荐/检索演示或 NLP；可作为离线 RAG、查询解析和检索评测候选，不代表真实球员证据。 | UI、测试夹具和简历截图必须明确标注“合成数据 / 虚构球员”。不得让虚构市场价值、合同或能力冒充现实事实。 | 低成本/免费。最适合当前离线演示和可复现评测；不作为真实推荐语料。 |
| **P1：SCOUTED（编辑出版物）** | [SCOUTED 2026 介绍](https://scoutedftbl.com/an-announcement-on-our-future/)计划出版包含封面球员故事与详细球员档案的数字期刊；[订阅介绍](https://scoutedftbl.com/about/)说付费读者可访问球员与分析档案。确有真实球员定性分析，适合作为人工阅读参考。 | 本次找到的是阅读/订阅入口，没有查到公开抓取/API/存档许可。不能从订阅后可读推出程序化访问或建立索引权限。 | **未证实。** 未查到明确允许外部 AI/RAG/embedding 或向模型发送正文的授权。出版方声明其强调人工阅读和写作；这不是完整的数据处理许可条款，但也不应忽略其内容使用语境。[出版方说明](https://scoutedftbl.com/the-future-fund/) | **未证实机器处理后的摘录/结论展示范围。** 订阅页提供读者内容，不等于可再发布报告或派生全文摘要。每个结果至少需保留来源链接与署名；产品展示须先问清许可。 | 截至研究日，站方称整个赛季 £34.99（[Future Fund](https://scoutedftbl.com/the-future-fund/)）；可低成本人工阅读，不是已授权语料。推荐联系作者申请小范围、可撤回的 RAG/引用试点。 |
| **P1：SCOUTED Pro** | [产品页](https://pro.scoutedftbl.com/product/)明确提供真实球员 shortlist、watchlist、eye-test 报告与 SkillCorner 数据报告。 | 订阅允许下载并为内部使用保留 editions；没有授予自动抓取、第三方 API 或独立数据库构建权限的条款。 | 条款明令未经书面同意不得用内容训练/开发/微调 AI/ML。检索时的推理、embedding 和 RAG 未被明确允许或禁止，**未证实，不能当成有授权**。[服务条款](https://pro.scoutedftbl.com/terms/) | 允许在内部/公开材料中适当署名地 cite/quote/reference，但禁止将内容复刻、转售或作为独立商业产品。具体可展示的引用和派生文字应书面确认。 | [定价页](https://pro.scoutedftbl.com/pricing/)显示 £249.99/月或 £2,499.99/年；免费改版样本可供人工查看。适合了解专业报告结构，不适合作为无许可的 RAG 语料。 |
| **P2：CIES Football Observatory Prospect Sheets / Scouting Reports** | 官方[报告目录](https://football-observatory.com/reports?nb=18)提供多期具名球员 scouting reports 与排名；[Prospect Sheet](https://football-observatory.com/-Sheets-86-)持续列出潜力球员；[术语表](https://football-observatory.com/IMG/pdf/ps_glossary_en.pdf)说明个人职业轨迹、转会估值、基于比赛数据的比赛领域与相似球员。它更偏结构化数据分析，不是纯视频球探文字。 | 官方网页有浏览和下载链接；未找到允许自动批量下载或将 PDF 正文长期存入产品数据库的条款。 | 未查到明确 AI、embedding、RAG 授权；标为**未证实**。 | 未查到足以覆盖面向用户再展示的许可。旧版 Annual Review 样本明确保留版权并要求复制前取得书面许可；不能据此断言新文件条款相同，但也不能推定新文件放弃版权。[旧版版权页](https://football-observatory.com/IMG/pdf/ar2014_excerpt.pdf) | 多份材料可免费阅读，部分方法资料可供学习。可作为人工参考/链接，不做自动采集或索引，除非取得明确许可。 |
| **P2：PFSA Scouting Platform** | PFSA 产品以用户自己看比赛后创建的报告为核心；网页展示的 Theo Ashcombe / Kingsmoor United 明确是 sample/illustrative data，非真实球员。[产品页](https://scout.thepfsa.co.uk/) | 条款禁止自动系统/scraper 访问，也禁止系统性下载或存储 Platform IP。[条款](https://scout.thepfsa.co.uk/terms) | 条款禁止使用服务开发、训练或改进竞争产品、服务或 AI；不是可导出的外部报告语料。用户自撰内容的产权由用户保留，但应在 TactiScout 自己录入，避免采集其服务内容。 | 页面有报告分享能力，但并不授予将平台内容复制进 TactiScout 的权利。 | 免费版 £0，可创建无限 profiles/reports；Pro 创始价 £9.99/月或 £89.99/年，提供 AI/分享等功能。适合观察报告工作流，不是公开报告库。 |
| **P2：Hudl Wyscout** | [Hudl 官方介绍](https://www.hudl.com/en_gb/products/wyscout)提到球员资料、career data、reports、videos；[Wyscout Data API](https://www.wyscout-apps.hudl.com/products/wyscout/data-api)主要售卖球员/球队统计、赛季/比赛指标、事件数据及 API，而不是公开下载的定性 scout report corpus。 | 面向客户提供登录平台或商业 API；未找到公共批量数据下载授权。个人版条款规定平台访问是个人权限，不得转让/转许可凭证或服务；需要按商业方案签约。[平台条款](https://static.hudl.com/craft/legal/Wyscout-Platform-Individual-Terms-and-Conditions_2023-08-21.pdf) | 条款与产品资料未确认用于外部 LLM/embedding/RAG 的权限；明确向 Hudl 询问数据包/API 条款，不复用登录态或自动化浏览器抓取。 | 不应把其媒体、数据或客户报告再分发给终端用户，除非签约文本明确授予该展示权。 | 销售预约/按包报价，未查到面向个人的低价公开计划。可作将来商业数据集成候选，不是当前低成本语料。 |
| **P3：TU Dresden Fußballlinguistik corpus** | 官方 Release 2024-04 有约 94M tokens，含 29,570 条 Sportschau 单人球员评论、赛事报道、战术分析等；最接近现成具名评论文本，但它是比赛媒体语料，不是长期球探评估。[语料说明](https://fussballlinguistik.de/korpora/korpusdokumentation/) | 需要注册访问；官方明说不能显示/下载整篇文章，也不能下载全量/子集语料或导出整文；只能取得检索结果/片段。 | 许可限**科学、非商业用途**；没有授予产品 RAG/embedding/LLM 的许可。不可自动下载全文或将结果集建立成产品向量库。[使用条件](https://fussballlinguistik.de/korpora/) | 研究引用应保留 corpus release / text ID / 原始来源；应用面向用户的内容展示未获授权。 | 学术查询可申请账号，不收集全文。对 TactiScout 商业化/公开应用不适用。 |
| **P3：SocCor（EURO 2024）** | 作者 [GitHub](https://github.com/PaulLoehr/SocCor) 与 ACL Anthology [论文](https://aclanthology.org/2025.konvens-1.8.pdf)介绍多语种赛事文本、92,421 次球员提及及来自 BBC、Kicker、L’Équipe、Marca 等 20 个来源的比赛报告、liveticker 和口播。它是赛事/媒体叙事，不是球探报告。 | 作者代码仓库公开了处理代码/文件目录；本次未找到明确的数据再利用许可证。正文来自媒体版权方，不能把 repo 可见等同于文本获准复制、下载或持久保存。 | 未查到语料本身的 AI/RAG 许可，标为**未证实**。论文里作者探索球员 embedding 不构成对使用者的授权。 | 未发现对原文公开展示的许可；不复制文本。 | 公开研究项目，可引论文并复现其方法；正文入库前必须确认作者与底层新闻来源的许可。 |
| **P3：MEmoFC** | [Tilburg 官方数据登记](https://research.tilburguniversity.edu/en/datasets/the-multilingual-emotional-football-corpus-memofc/)说该语料从俱乐部网站人工收集多语种赛事报告并配有比赛统计，研究不同赛果下文章情绪；是比赛报告，不是球员球探报告。 | Portal 提供 Dataverse 数据访问入口；本次未核实数据文件级 license 或 API 批量使用条款。 | 未证实 AI、embedding、RAG。大学门户自身保留 text/data mining 与 AI training 等权利，但该站点声明仅适用于其门户内容，不能代替 Dataverse 文件许可。 | 未证实公开展示许可。应逐个文件确认 license 和源网页版权，再考虑科研用途。 | 学术数据集，可用于研究思路，现阶段不进入 TactiScout 索引。 |
| **P3：PLOS “A Messi affair!”** | 研究记录了资深青训球探的 think-aloud 口头判断，非常贴近真实球探决策过程，但不是可公开检索的球员报告库。 | 论文明确数据因可能识别俱乐部而不公开；满足标准的研究者须向 Liverpool John Moores University Ethics Committee 申请受限访问。[数据可用性声明](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0225033) | 论文全文为 CC BY，但这不覆盖未公开的口头报告/研究数据。不能下载或用于 RAG；仅可复用公开论文里允许的研究方法，并按文章 CC BY 署名。 | 受限数据不得对用户展示。 | 论文免费公开；语料访问非普通产品可用方案。 |
| **排除：Football Scout 365** | 公开提供报告、排名和球员评价，主题相关。 | 其条款明确禁止 scraping/crawling/data mining/自动访问和提取。[服务条款](https://www.footballscout365.com/terms-of-service) | 明确禁止未经书面同意用内容训练、评估或构建 AI、数据库、ranking/scouting 产品。 | 只允许有限个人、非商业阅读；产品用途需书面许可。 | 不作语料源。 |
| **排除：Football Manager 数据库** | SEGA/Sports Interactive 的官方隐私说明称数据库含球员的技术、心理、身体 ratings，并由其 scout network 编制与交叉核验；这是 FM 属性数据，不是公开 scout prose corpus。[专业球员隐私说明](https://www.footballmanager.com/privacy-policy-professionals) | FM consumer EULA 只授予个人非商业使用，且限制制作模仿产品数据/功能的数据或程序。[EULA](https://policy.sega.com/fm24-eula-end-user-license-agreement) | 没有公开 API、数据库许可或 RAG 授权。官方隐私政策里提及被选定的足球行业第三方合作方可使用其数据库做 scouting，这表示合作方须通过单独关系取得权限，不意味着普通 FM 用户有此许可。 | 不抽取、复刻或展示 FM 数据。 | 零售游戏价格不包含 TactiScout 的数据库使用权；仅借鉴“职责/阵容/球探工作流”的产品思路。 |

## 推荐优先级与操作

### 现在做

1. **建立 TactiScout 自有的 `报告观察` 入口。** 用户或项目观察者只录入自己有权使用的笔记；字段至少有 player identity、观察日期、比赛/赛事、观看时间点、观察者、支持点、风险、置信/主观程度、来源链接，以及“可否用于模型与共享”的授权状态。把原始外部文章全文与自写观察分开存储。
2. **用合成语料作为检索/Agent harness fixture。** 优先评估 TransferTalk Players：全虚构的球队、球员与联赛，报告文字较自然，数据卡声明 MIT；保留其许可证和清楚的 synthetic 标签。不要把它伪装成真实足球数据，也不要用来展示真实推荐质量。
3. **保持真实球员评分锚定在获准的比赛事件/统计 provider。** 球员报告只给“待核实的定性观察”，不转换成数值评分；对每条观察呈现作者、观察时间和原始链接，并与结构化统计交叉检查。

### 许可申请候选

若希望真实外部球探报告进入 RAG，优先向 SCOUTED（编辑出版物或 Pro）和 CIES 发送一页用途说明，申请少量可试点内容的授权。问题要逐项问清：

- 是否允许自动下载/发现，频率和来源范围是什么；
- 是否可持久保存 PDF/纯文本/切块和 embedding，是否有 TTL 或删除要求；
- 是否可将文本或检索片段发送给本地 Ollama，以及将来兼容 OpenAI 的外部模型；
- 是否允许 RAG 检索时由 LLM生成摘要、比较、分类或分析；训练/微调不在默认需求内，应明确排除，除非另获授权；
- 面向应用最终用户可展示哪些内容：短引文长度、事实摘录、改写、归因和来源链接；
- 订阅/合作结束后可否继续留存，撤销授权时如何删除正文、缓存与向量；
- 是否允许将 TactiScout 用于公开作品集、产品演示或商业用途，以及是否有测试/教育价格。

### 暂不做

- 不抓取 Transfermarkt、FBref、媒体文章、付费数据库或用户登录后的网页做通用语料。
- 不因为论文/数据仓库可下载、研究者做过 embedding、机器人能打开网页或文章提供免费阅读就推断可进入产品 RAG。
- 不自动把用户贴入的链接正文保存或发到云端模型；先询问并记录用户确认的用途与来源规则。

## 项目落地建议

- `MethodologySource`（方法资料）与 `PlayerReportObservation`（具体球员观察）分开，不混入同一检索集合；前者指导职责定义，后者提供定性线索。
- 来源登记至少区分：`discover`、`fetch`、`persist`、`embed`、`inference`、`quote`、`public_display`；任一用途未获许可就关闭该用途，而不是将“允许阅读”合并成总 `approved` 标志。
- 每条报告记录保存来源 owner、原始 URL、作者、标题、发布日期/观察时间、球员 canonical ID（经身份核对）、条款/许可版本和证据类型；保留许可审核时间及下次复查时间。
- 外部模型开启前，按来源检查 prompt 内容、embedding endpoint 与供应方保留策略。系统默认只把结构化统计和项目自有观察发给模型；第三方全文仍需单独授权。
- 公开报告优先展示短事实/观察摘录、署名、日期和源链接，注明“来源报告观点”，不复制整篇文章；具体可展示限额以许可为准。
- 来源退出/撤回时删除原文、派生 chunks、embedding 和缓存，并重建受影响的报告引用；仅保留获准保存的 provenance 记录。

## 官方/作者一手来源

- [SCOUTED 产品与球员 profile](https://scoutedftbl.com/an-announcement-on-our-future/) · [SCOUTED 订阅与档案说明](https://scoutedftbl.com/about/) · [Future Fund 价格](https://scoutedftbl.com/the-future-fund/)
- [SCOUTED Pro 产品](https://pro.scoutedftbl.com/product/) · [Pro 条款](https://pro.scoutedftbl.com/terms/) · [Pro 定价](https://pro.scoutedftbl.com/pricing/)
- [CIES 报告目录](https://football-observatory.com/reports?nb=18) · [CIES Prospect Sheets](https://football-observatory.com/-Sheets-86-) · [CIES Glossary](https://football-observatory.com/IMG/pdf/ps_glossary_en.pdf) · [CIES Annual Review copyright sample](https://football-observatory.com/IMG/pdf/ar2014_excerpt.pdf)
- [PFSA Platform](https://scout.thepfsa.co.uk/) · [PFSA Terms](https://scout.thepfsa.co.uk/terms)
- [Hudl Wyscout Data API](https://www.wyscout-apps.hudl.com/products/wyscout/data-api) · [Wyscout Platform individual terms](https://static.hudl.com/craft/legal/Wyscout-Platform-Individual-Terms-and-Conditions_2023-08-21.pdf)
- [TU Dresden football linguistics corpus](https://fussballlinguistik.de/korpora/) · [2024 corpus documentation and rights](https://fussballlinguistik.de/korpora/korpusdokumentation/)
- [SocCor author repository](https://github.com/PaulLoehr/SocCor) · [SocCor paper](https://aclanthology.org/2025.konvens-1.8.pdf)
- [MEmoFC dataset record](https://research.tilburguniversity.edu/en/datasets/the-multilingual-emotional-football-corpus-memofc/)
- [PLOS “A Messi affair!”](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0225033)
- [SoccerNet Data](https://www.soccer-net.org/data) · [SoccerNet FAQ](https://www.soccer-net.org/faq) · [SoccerNet Caption repo](https://github.com/SoccerNet/sn-caption)
- [Football Scout 365 Terms](https://www.footballscout365.com/terms-of-service)
- [SEGA/Sports Interactive football professional privacy policy](https://www.footballmanager.com/privacy-policy-professionals) · [FM24 EULA](https://policy.sega.com/fm24-eula-end-user-license-agreement)
- [TransferTalk Players dataset card](https://huggingface.co/datasets/yanivohayon1/transfertalk-players) · [ProScout synthetic dataset card](https://huggingface.co/datasets/Ilayr222/proscout-players-1112)
