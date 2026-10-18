## 中文

**0.5.13** 汇总下一版本的 Android 大屏扫码登录。本仓库各自有包与客户端版本统一为 **0.5.13**；Android `versionCode` 与 Expo iOS `buildNumber` 均为 **51**。

- **显式扫码入口**：登录页先展示知乎/GitHub 浏览器 OAuth 与邮箱密码登录；点击「扫码登录」后才请求 Server provider 并在页内显示二维码，大屏使用更大的二维码。
- **本地渲染与一次性会话**：二维码由 App 本地渲染 Server 返回的同源 `scanUrl`；轮询拿到一次性 token 后注册本机设备，token 不进入二维码或日志。
- **完成阶段修复**：领取 token 后立即停止轮询，注册与跳转不再依赖会随渲染变化的 effect 依赖，扫码成功后不会因为再次轮询已消费会话而显示“二维码过期”或跳过登录。
- **安全边界**：只接受同源 provider/QR URL，拒绝外域与畸形响应；离开扫码视图停止轮询，修改服务地址作废旧二维码，旧 Server 回退到 per-provider OAuth status 接口。
- **平板双栏**：聊天页在宽度 ≥760 dp 时左侧常驻会话列表（按当前工作/工作区/其他对话分组），右侧显示消息和输入栏；左栏切换会话只更新右侧内容，窄屏与短窗口仍为单栏。

### 验证与待验收范围

Android `check`、**24 个测试文件 / 136 个测试**与类型检查通过；真实 Server 的 providers、QR start 与 poll 合约已核验。平板双栏已在模拟 800×1280 dp 窗口的真机上验证会话切换，真实平板/折叠屏、扫码端到端仍需在设备上完成。

## English

**0.5.13** brings the next Android large-screen QR sign-in release. All first-party package and client versions are **0.5.13**; Android `versionCode` and Expo iOS `buildNumber` are **51**.

- **Explicit QR entry:** the login screen first offers Zhihu/GitHub browser OAuth and email/password sign-in. Tapping **Sign in with QR code** requests the Server providers and shows the code in place; large screens use a bigger code.
- **Local rendering and one-time sessions:** the app renders the Server-provided same-origin `scanUrl` locally, polls a one-time token and registers this device. Tokens never enter the QR code or logs.
- **Completion fix:** polling stops once the token is claimed, and registration/navigation no longer depend on render-dependent effect dependencies. A successful scan no longer re-polls a consumed session and reports “QR code expired” or skips login.
- **Safety boundaries:** only same-origin provider/QR URLs are accepted and malformed responses are rejected; leaving the scan view stops polling, changing the Server invalidates the code, and older Servers fall back to the per-provider OAuth status endpoints.
- **Tablet split view:** at ≥760 dp wide the chat keeps the grouped session list on the left and the conversation header, messages and composer on the right; picking another conversation updates only the right pane. Narrow and short windows keep the single-pane layout.

### Validation and acceptance limits

Android `check`, **24 test files / 136 tests** and type checks pass; the providers, QR start and poll contracts were verified against the real Server. The split view was exercised on a real device at a simulated 800×1280 dp window, including switching conversations; real tablets/foldables and end-to-end QR scanning still need device verification.

---

[安装说明](https://github.com/liguobao/ds-harness-remote/blob/v0.5.13/README.zh.md#安装) · [Installation](https://github.com/liguobao/ds-harness-remote/blob/v0.5.13/README.md#install) · [完整改动 / Full changelog](https://github.com/liguobao/ds-harness-remote/compare/v0.5.12...v0.5.13)
