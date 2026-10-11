## 中文

- **Android 后台保活**：新增前台服务，切后台后保持远程连接；回到应用即可继续当前会话，无需重连。
- **Android 会话工具**：会话连接后即显示 Files/Terminal 工具入口，并修复会话工具、终端与工作区文件面板相关问题。
- **设备解绑交互重做**（社区贡献 @dreamfarer-space，[#99](https://github.com/liguobao/ds-harness-remote/pull/99)）：重新设计 Android 设备解除绑定的滑动交互与动效。
- **Host 身份恢复**：账号重新登录时轮换已被撤销的 Host 身份，被撤销设备可恢复凭据。
- **Plugin 修复**：恢复提交 bundle 中的 `harness.api.v1` capability，并修复远程工作区二进制响应的编码问题。

Plugin 与 Android 均为 **0.5.3**（Android `versionCode 42`）。iOS 客户端仍在内测招募中，欢迎通过 [iOS issue #20](https://github.com/liguobao/ds-harness-remote/issues/20) 报名和反馈。

## English

- **Android background keep-alive:** a dedicated foreground service keeps the remote connection alive in the background; returning to the app restores the ongoing session without reconnecting.
- **Android session tools:** the Files/Terminal tool access now appears once a session is connected, with session tool, terminal, and workspace file panel fixes.
- **Device unbind redesign** (community contribution by @dreamfarer-space, [#99](https://github.com/liguobao/ds-harness-remote/pull/99)): reworked Android swipe-to-unbind interaction and animations.
- **Host identity recovery:** a revoked Host identity is rotated when the account logs in again, so revoked devices can recover their credentials.
- **Plugin fixes:** the committed Plugin bundle restores the `harness.api.v1` capability, and remote workspace binary responses are encoded correctly.

Upgrade both Plugin and Android to **0.5.3** (Android `versionCode 42`). The iOS client is currently collecting beta users and feedback through [iOS issue #20](https://github.com/liguobao/ds-harness-remote/issues/20).

---

[安装说明](https://github.com/liguobao/ds-harness-remote/blob/main/README.zh.md#安装) · [Installation](https://github.com/liguobao/ds-harness-remote/blob/main/README.md#install) · [完整改动 / Changelog](https://github.com/liguobao/ds-harness-remote/compare/v0.5.2...v0.5.3)
