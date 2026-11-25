# R06 安卓独立测试版

应用标识为 `com.globalfitness.training`，版本为 `1.0.0`，首个安卓构建号为 `1`。中文系统显示「全球健身」，其他系统语言默认显示「Global Fitness」。「我的 → 关于版本」可查看当前版本和运行方式。

## 生成内部测试 APK

在 Expo 账号登录并完成项目关联后，从 `C:\Development\global-fitness-app\mobile` 运行以下命令。首次云构建会把构建所需源码上传到 Expo，并提示配置安卓签名。这些操作应由项目所有者授权后进行。

~~~powershell
npx.cmd eas-cli@latest build --platform android --profile preview
~~~

`preview` 生成可直接安装的 APK，供内部测试。版本号由 `mobile/app.json` 管理。以后给同一包名做覆盖升级时，沿用同一签名并提高安卓构建号。[Expo 内部 APK 文档](https://docs.expo.dev/build-reference/apk/) · [Expo 版本管理](https://docs.expo.dev/build-reference/app-versions/)

## 手机验收

1. 下载构建完成的 APK，在安卓手机安装后从桌面打开「全球健身」。
2. 关闭手机网络，确认可以打开首页、建档、生成训练计划、记录一组训练和一餐饮食。退出重开后核对记录。
3. 前往「我的 → 关于版本」，核对版本和「独立安装版」标识。训练时验证息屏回来后的倒计时及震动。
4. 需要登录、跨设备同步或 AI 问答时，给构建环境配置 [Supabase 公共参数](R05_ACCOUNT_SETUP.md)，并按 [云端问答配置](R05_COACH_SETUP.md) 部署服务端。

独立安装版与 Expo Go 各自保存本机数据。账号同步可用后，可以分别登录并同步已授权的记录。JSON 导出用于查看和留存。
