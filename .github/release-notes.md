## 中文

- **Android 界面更新**：毛玻璃悬浮顶栏、胶囊操作按钮与圆角悬浮输入框；浅色主题统一为白色，细化卡片轮廓和会话行按压反馈。
- **新对话默认权限**：手机设置可保存新建 Harness / CodeX 对话的默认权限，支持使用默认权限、工作区内修改和完全权限。已有对话保持原权限；Harness 以 Host 确认结果为准，CodeX 按 Host / Thread 保存实际返回的权限。
- **会话入口简化**：移除 Android 独立「对话」页面，统一从设备的工作区进入会话；Remote 登录方式选项保持单行显示。
- **CodeX / ACP 终端改进**：支持验证后的交互 shell、终端屏幕快照恢复和更可靠的进程清理；已创建终端可跨请求超时和断线保留。修复取消、输入权隔离及后端重配清理重试，无窗口或订阅且连续两小时确认空闲后才自动回收。
- **Host 兼容与稳定性**：修复 Harness `0.2.1-alpha.4` 本地 RPC 丢失调用方 Peer 导致的 `gateway/internal` / `signal` 错误；Host 关闭时取消鉴权等 HTTP 请求，并让超时覆盖响应体读取；修复 AGY 原生 SQLite 加载兼容问题。
- **云 Host 构建入口**：镜像构建与 bootstrap 收入 `apps/cloud-host`，固定依赖、持久化设备凭据并维护镜像变更记录；云镜像独立管理版本。

### 感谢贡献者

感谢 [@dreamfarer-space](https://github.com/dreamfarer-space)（择梦舟）贡献 Android 界面改进与 Host 修复：

- [#111](https://github.com/liguobao/ds-harness-remote/pull/111)：Android 毛玻璃顶栏。
- [#112](https://github.com/liguobao/ds-harness-remote/pull/112)：胶囊悬浮导航栏与标题对齐。
- [#113](https://github.com/liguobao/ds-harness-remote/pull/113)：悬浮输入框与浅色主题优化。
- [#116](https://github.com/liguobao/ds-harness-remote/pull/116)：本地 Gateway RPC 保留调用方 Peer。
- [#117](https://github.com/liguobao/ds-harness-remote/pull/117)：Host 关闭请求取消与 AGY SQLite 加载修复。

Plugin 与 Android 均为 **0.5.8**（Android `versionCode 46`）。终端已完成 macOS 真 PTY 烟测；Windows/Linux PTY、Desktop/Android 加密跨设备及真实两小时空闲回收验收仍待完成。兼容 pipe 路径不支持 resize/job control。iOS 客户端仍在内测招募中，欢迎通过 [iOS issue #20](https://github.com/liguobao/ds-harness-remote/issues/20) 报名和反馈。

## English

- **Android interface refresh:** frosted floating headers, pill actions, a rounded floating composer, and a white light theme with subtle card outlines and rounded conversation-row feedback.
- **Default permissions for new chats:** save a local preference for new Harness / CodeX chats: backend default, workspace write, or full access. Existing chats retain their permissions. Harness uses the Host-confirmed result; CodeX saves the returned policy per Host and Thread.
- **Simpler navigation:** access conversations through their device's workspace after removal of the standalone Android Conversations screen. Remote login method tabs stay on one row.
- **CodeX / ACP terminals:** verified interactive shells, screen snapshot recovery, and reliable process cleanup. Created terminals survive request timeouts and disconnects. Fixes cancellation, input ownership, and cleanup retries during backend reconfiguration; unattended terminals are reclaimed only after two hours of confirmed idle activity without window holds or followers.
- **Host compatibility and stability:** preserves the calling Peer in local Gateway RPCs to fix Harness `0.2.1-alpha.4` `gateway/internal` / missing `signal` errors. Host shutdown cancels HTTP work including authentication; deadlines cover response body reads. Fixes native SQLite loading for AGY session discovery.
- **Cloud Host build inputs:** moves image builds and bootstrap into `apps/cloud-host`, with pinned dependencies, persistent device credentials, and a separate image changelog. Cloud images retain their own release versions.

### Thanks to our contributor

Thanks to [@dreamfarer-space](https://github.com/dreamfarer-space) for Android interface improvements in [#111](https://github.com/liguobao/ds-harness-remote/pull/111), [#112](https://github.com/liguobao/ds-harness-remote/pull/112), and [#113](https://github.com/liguobao/ds-harness-remote/pull/113), local Gateway Peer preservation in [#116](https://github.com/liguobao/ds-harness-remote/pull/116), and Host shutdown / AGY SQLite fixes in [#117](https://github.com/liguobao/ds-harness-remote/pull/117).

Plugin and Android are **0.5.8** (Android `versionCode 46`). Terminal smoke tests passed with a real macOS PTY; Windows/Linux PTY, encrypted Desktop/Android cross-device behavior, and actual two-hour idle reclamation still await acceptance testing. The compatibility pipe path does not support resize or job control. The iOS client is collecting beta users and feedback through [iOS issue #20](https://github.com/liguobao/ds-harness-remote/issues/20).

---

[安装说明](https://github.com/liguobao/ds-harness-remote/blob/v0.5.8/README.zh.md#安装) · [Installation](https://github.com/liguobao/ds-harness-remote/blob/v0.5.8/README.md#install) · [完整改动 / Changelog](https://github.com/liguobao/ds-harness-remote/compare/v0.5.7...v0.5.8)
