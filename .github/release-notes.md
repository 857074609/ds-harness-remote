## 中文

- **DS Bot 远程接入**：可在远程 Harness 工作区使用 Host 上已启用的 DS Bot，会话、成员与群聊管理通过加密通道转发。Host 与 Client 插件均需更新。
- **远程访问边界**：DS Bot 操作采用固定白名单，安装升级、日程增删、凭据、能力脚本及未知操作保留在 Host 本地；新会话只有进入官方 Session 目录后才会展示。
- **登录方式自动发现**：Desktop、CLI 与 dsh-TUI 从 Server 获取已启用的 OAuth 登录方式，支持服务端定义的扫码 provider，并兼容旧 Server 的 GitHub/知乎登录状态接口。
- **侧栏与日程**：Remote 与 DS Bot 入口上下排列，展开侧栏保留文字和独立退出按钮；补齐原生日程 UI 的只读列表接口。
- **文件预览与恢复**：修复远程图片和 Office 预览的字节丢失，兼容 CodeX 新会话修改权限时的 resume 拒绝，并明确 Android 会话写入被占用时完整退出另一 Harness 进程的恢复步骤。
- **TURN 节点信息**：上报实际选择的 TURN 节点，帮助 Server 识别连接使用的中继；旧 Server 可忽略该可选字段。

Plugin 与 Android 均为 **0.5.7**（Android `versionCode 45`）。iOS 客户端仍在内测招募中，欢迎通过 [iOS issue #20](https://github.com/liguobao/ds-harness-remote/issues/20) 报名和反馈。

## English

- **Remote DS Bot:** use DS Bot enabled on the Host from a Remote Harness workspace. Chat, roster, and group management travel through the encrypted channel. Update the Remote plugin on both Host and Client.
- **Access boundaries:** a fixed DS Bot operation allowlist keeps installation, upgrades, schedule mutations, credentials, capability scripts, and unknown operations local to the Host. New Sessions are exposed only after they enter the official Session catalog.
- **OAuth discovery:** Desktop, CLI, and dsh-TUI discover enabled login providers from the Server, including server-defined QR providers, with a fallback for older GitHub/Zhihu status endpoints.
- **Sidebar and schedules:** stacks Remote below DS Bot, retains labels and a separate Exit action in the expanded sidebar, and supports the native schedule UI's read-only list endpoints.
- **Previews and recovery:** preserves remote image and Office preview bytes, handles CodeX resume refusals for newly created Threads during permission changes, and explains how Android users can recover from Session writer conflicts by fully exiting the other Harness process.
- **TURN node reporting:** reports the selected TURN relay node so the Server can identify the relay in use. Older Servers may ignore this optional field.

Upgrade Plugin and Android to **0.5.7** (Android `versionCode 45`). The iOS client is currently collecting beta users and feedback through [iOS issue #20](https://github.com/liguobao/ds-harness-remote/issues/20).

---

[安装说明](https://github.com/liguobao/ds-harness-remote/blob/main/README.zh.md#安装) · [Installation](https://github.com/liguobao/ds-harness-remote/blob/main/README.md#install) · [完整改动 / Changelog](https://github.com/liguobao/ds-harness-remote/compare/v0.5.5...v0.5.7)
