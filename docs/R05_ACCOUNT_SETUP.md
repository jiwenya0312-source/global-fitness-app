# R05 邮箱账号接入

## 配置 Supabase

1. 在项目拥有者的 Supabase 项目中，启用 Email 登录方式，并按测试范围决定是否开放注册。应用使用同一入口处理注册与登录。
2. 在认证邮件模板中配置一次性验证码。按 Supabase 的邮件 OTP 指南，在 Magic Link 模板正文中使用 `{{ .Token }}`，并确认首次注册和再次登录收到的邮件均含验证码。正式邮件投递应配置项目自己的 SMTP 服务。
3. 把 `mobile/.env.example` 复制为 `mobile/.env.local`，填入项目的 HTTPS URL 和 Publishable Key。客户端只接受以 `sb_publishable_` 开头的公开密钥。数据库密码、Secret Key 和 Service Role Key 应放在服务端。
4. 重启 Expo，打开「我的 → 账号」。输入邮箱、发送验证码、完成验证，然后重开应用检查登录状态，最后退出此设备的会话。

项目 URL 和 Publishable Key 会被打包到客户端。数据库访问和云端记录隔离依赖后续的数据表权限与行级安全策略。

## 本阶段的数据范围

账号功能验证邮箱并管理会话。Android 和 iOS 将会话交给系统安全存储。Web 预览在当前浏览器标签页会话内储存登录状态。

训练、营养、身体记录和照片存放在设备本地。登录、切换账号和退出只管理认证会话，本地记录可独立使用。

[Supabase 邮箱验证码](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [Supabase API Key](https://supabase.com/docs/guides/getting-started/api-keys) · [Expo 环境变量](https://docs.expo.dev/guides/environment-variables/)
