## 中文

**0.5.10** 汇总自 `v0.5.8` 以来的更新：适配 Harness `0.2.1-rc.1`，扩展 Agent 后端，并改进 Android 的会话可靠性与交互体验。本仓库各自有包及客户端版本统一为 **0.5.10**；Android `versionCode` 与 Expo iOS `buildNumber` 均为 **48**。

- **Harness 0.2.1 RC 支持**：适配官方 Gateway Peer、事件回复、Fetch 路由和新版会话投影；终端接入官方双向流，输入按 Host 确认，断线不重放。
- **更多 Agent 后端**：新增实验性 Pi Agent，以及 Claude、OpenCode 的 Host 与客户端工作区接入。改进历史、流式工具输出、中断和重启恢复；ACP 审批只接受单次允许或拒绝，并隔离连接、会话与后端实例。Pi 工具默认不逐次审批，需要本机扩展启用确认。
- **Android 聊天更可靠**：改进发送失败提示、待处理队列、Agent 团队面板及实时会话状态；修复归档会话重新出现、切换账号或 Host 后迟到结果覆盖当前状态的问题。抽屉按工作区展示会话，每次展开三个，主机信息与版本更清晰。
- **Android Intelligent UI**：支持交互卡片、版本恢复和原位更新，Release APK 内置固定审核版本的离线 renderer。模型操作需原生确认，生成内容在隔离 WebView 中渲染，禁止外部资源下载。详见 [接入与验证边界](https://github.com/liguobao/ds-harness-remote/blob/v0.5.10/docs/intelligent-ui-android.md)。
- **Android 沉浸式体验**：优化 Android 14/15+ 系统栏、手势与三键导航、键盘底座和弹窗避让；社区提供了真机与 Android 15 官方模拟器的对照记录。
- **连接与恢复修复**：拆分 Control、ICE、WebRTC 和 Noise 启动超时；修复 Windows Desktop 顶栏 Remote 控件点击，以及 CodeX 重进工作区的会话恢复。历史读取失败保留具体错误，不再伪装为空会话；增加真实 WebSocket Relay 安全验证。

本次版本包含本机自动化及部分真实 Agent Gateway 验证；新版 Harness 和新增后端的加密跨设备、Windows、Android 原生回归仍需继续验收。Intelligent UI 的完整确认 → Prompt → Patch 和重连流程尚未完成真机验收。已有 Android 界面实测不代表上述链路全部通过。Metro 的 `@noble/hashes/crypto.js` exports fallback 警告仍存在。iOS 继续通过 [issue #20](https://github.com/liguobao/ds-harness-remote/issues/20) 招募内测。

### 感谢参与者

感谢本轮贡献代码、审查、测试、截图、文档和反馈的所有参与者，特别感谢：

- [@pengyz](https://github.com/pengyz)：Android 可靠发送、队列状态、Agent 团队面板及聊天响应改进（[#115](https://github.com/liguobao/ds-harness-remote/pull/115)）。
- [@dreamfarer-space](https://github.com/dreamfarer-space)：发送失败与 Markdown 引用补充修复、Intelligent UI、Android 沉浸式适配，以及真机和模拟器验证记录（[#118](https://github.com/liguobao/ds-harness-remote/pull/118)、[#126](https://github.com/liguobao/ds-harness-remote/pull/126)、[#128](https://github.com/liguobao/ds-harness-remote/pull/128)）。
- [@luojiyin1987](https://github.com/luojiyin1987)：任务与验收优先级整理，以及真实 WebSocket Relay 安全测试（[#121](https://github.com/liguobao/ds-harness-remote/pull/121)、[#123](https://github.com/liguobao/ds-harness-remote/pull/123)）。
- [@liguobao](https://github.com/liguobao)：Harness RC 适配、Agent 后端接入与恢复修复、模块整理及发布集成。

## English

**0.5.10** brings together the changes since `v0.5.8`: Harness `0.2.1-rc.1` support, more Agent backends, and improved Android chat reliability and interaction. All first-party package and client versions are **0.5.10**; Android `versionCode` and Expo iOS `buildNumber` are **48**.

- **Harness 0.2.1 RC:** adapts official Gateway Peers, event replies, Fetch routes and session projections. Terminals use the official duplex stream, with Host-confirmed input and no replay after disconnect.
- **More Agent backends:** adds experimental Pi Agent and Claude/OpenCode Host and client workspace integration. Improves history, streamed tool output, interruption and restart recovery. ACP approvals remain single-use and scoped to the connection, session and backend instance. Pi requires a local extension for per-tool confirmation; it is not enabled by default.
- **More reliable Android chats:** improves delivery errors, queue visibility, agent-team display and live session status. Fixes archived sessions reappearing and stale account/Host results overwriting current state. Drawer sessions expand three at a time, with clearer Host and version information.
- **Android Intelligent UI:** adds interactive cards, version recovery and in-place updates. Release APKs include a pinned, audited offline renderer. Model-directed actions require native confirmation; generated content runs in an isolated WebView without external resource downloads. See the [integration and acceptance notes](https://github.com/liguobao/ds-harness-remote/blob/v0.5.10/docs/intelligent-ui-android.md).
- **Android edge-to-edge:** improves Android 14/15+ system bars, gesture and three-button navigation, keyboard positioning and modal insets, with contributed device and official Android 15 emulator records.
- **Connection and recovery fixes:** separates Control, ICE, WebRTC and Noise startup deadlines; restores Windows Desktop caption clicks and CodeX workspace re-entry. History errors remain visible instead of becoming empty conversations. Adds real WebSocket Relay security coverage.

Local automated checks and selected real Agent Gateway checks do not replace encrypted cross-device, Windows or native Android acceptance for the new Harness/backend integration. Intelligent UI's full confirmation → Prompt → Patch flow and reconnect behavior still need device acceptance. The existing Metro `@noble/hashes/crypto.js` exports fallback warning remains. iOS beta feedback is welcome in [issue #20](https://github.com/liguobao/ds-harness-remote/issues/20).

### Contributors

Thank you to everyone who contributed code, reviews, tests, screenshots, documentation and feedback, especially **[@pengyz](https://github.com/pengyz)** for Android delivery, queues and agent teams (#115); **[@dreamfarer-space](https://github.com/dreamfarer-space)** for follow-up fixes, Intelligent UI, edge-to-edge improvements and device records (#118, #126, #128); **[@luojiyin1987](https://github.com/luojiyin1987)** for acceptance priorities and real WebSocket Relay security tests (#121, #123); and **[@liguobao](https://github.com/liguobao)** for Harness compatibility, Agent backends, recovery fixes and release integration.

---

[安装说明](https://github.com/liguobao/ds-harness-remote/blob/v0.5.10/README.zh.md#安装) · [Installation](https://github.com/liguobao/ds-harness-remote/blob/v0.5.10/README.md#install) · [完整改动 / Full changelog](https://github.com/liguobao/ds-harness-remote/compare/v0.5.8...v0.5.10)
