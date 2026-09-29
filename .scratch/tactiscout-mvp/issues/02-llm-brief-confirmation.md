# LLM 解析自然语言招募需求后由用户确认

Type: grilling
Status: resolved
Labels: wayfinder:grilling

## Question

自然语言需求如何进入球探流程，LLM 应能决定哪些内容，用户如何确认解析结果？

## Answer

MVP 包含 LLM 自然语言解析。服务端通过兼容 OpenAI 的接口和结构化输出，将需求描述转成可编辑的招募条件；模型地址、名称与密钥放在服务端环境配置，浏览器不持有密钥。球队或位置缺失、含糊时，标出缺失项并要求用户补齐。用户确认后，确定性筛选与评分才开始。无密钥时保留结构化表单使用路径。

## Comments
