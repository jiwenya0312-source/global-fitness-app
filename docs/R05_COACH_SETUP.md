# R05 云端训练问答

App 入口是「首页 → 训练助手 → 向 AI 提问」。离线训练助手可以独立使用。云端问答先登录账号，再预览问题及所选摘要并确认发送。摘要默认关闭，选择范围为计划、重量参考和本周统计。

## 部署

1. 配置现有 [邮箱账号](R05_ACCOUNT_SETUP.md)，并部署包含 [问答限流迁移](../supabase/migrations/20261119000100_coach_quota.sql) 的迁移。
2. 在 Supabase 的 Edge Function Secrets 中设置 `OPENAI_API_KEY`。可用 `FITNESS_COACH_MODEL` 指定支持 Responses API 的模型，默认 `gpt-4.1-mini`。App 仍只使用 Supabase URL 和 publishable key。
3. 从仓库根目录运行 `supabase functions deploy fitness-coach --project-ref <project-ref>`。如果网关因签名密钥迁移拒绝有效用户 JWT，按 Authorization headers 文档调整网关设置。函数会把用户 JWT 交给当前项目的 PostgREST 校验，请求需通过有效会话和账号匹配的限流函数才能调用模型。[Supabase 鉴权](https://supabase.com/docs/guides/functions/auth-headers)
4. 使用测试账号验证三种情况：只发送问题、只附一类摘要、断网或服务不可用后返回离线助手。验证未登录与切换账号的访问行为，以及达到额度后的提示。

## 数据范围

函数向 OpenAI 发送已授权的问题、摘要和回复语言。邮箱、账户标识、原始训练备注、图片和恢复问卷均不自动提供给模型。问题与回复在 App 当前页面临时展示。数据库限流表只保存计数，并随账号注销清除。Responses API 请求设置 `store: false`。服务商对请求数据的处理和保留取决于项目设置及相应条款。[OpenAI API 数据控制](https://developers.openai.com/api/docs/guides/your-data)

每个账号最多每分钟 5 次、每 UTC 日 30 次。服务端先后检查请求和回答内容。回答仅供阅读，计划及日志的修改仍在相应业务页面完成。[Responses API](https://developers.openai.com/api/docs/api-reference/responses/create) · [Moderation](https://developers.openai.com/api/docs/guides/moderation)
