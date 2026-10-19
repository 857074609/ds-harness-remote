## 中文

**0.5.14** 修复 Remote 退出登录与 Server 地址保存流程，并集中改进 Android 连接恢复、流式聊天与页面操作。自有包和客户端版本统一为 **0.5.14**，Tag 为 **v0.5.14**；Android `versionCode` 与 Expo iOS `buildNumber` 均为 **58**。

- **Remote 一次退出**：Remote 面板退出后，已打开的设置页同步清除账号显示；等待 Host/Client 清理并清除两份本地凭据。单项撤销或预览/流清理失败不跳过其他清理，迟到连接和工作区结果不能恢复已退出状态。
- **Server 地址保存**：登录面板的地址旁新增“保存”。保存后应用 Server 地址并自动重新加载登录方式，清理旧二维码、轮询与迟到结果；扫码和密码登录使用相同的已保存地址。
- **Android 连接恢复**：连接服务在鉴权前启动，通知与 CPU 唤醒锁跟随连接生命周期；定期验证加密 Host 链路，断线后最多尝试三次恢复，并保留当前会话与历史。恢复期间保留已有前台服务，不重放 Prompt、审批或终端输入。
- **Android 流式聊天**：合并 CodeX 增量事件、保留未变化消息引用并隔离旧订阅，修复连续回复中 React 更新深度异常与相关断线。键盘和输入区域变化时保持最新回复可见，手动上翻后保留阅读位置。
- **Android 页面体验**：工作区按选中类别加载；断线时显示连接中断/恢复操作，移除误导性的空列表和不可用消息操作。错误提示适配安全区，连接与恢复文字增加动态省略号。

### 验证与边界

本地全仓类型检查、**732 项测试**、生产构建（含 Android Hermes export）、DSH bundle 校验与版本一致性检查通过。发布流程再次检查与构建，并生成 npm 包、浏览器扩展和 Android APK。用户已确认本机 Desktop 的退出登录及保存 Server 修复版本可用；Android 此前已验证一次完整流式回复、键盘跟随、短时亮屏切 App 保持连接，以及小米手机唤醒后的重连恢复。

小米系统息屏冻结会禁用唤醒锁并销毁 sockets，本版本不能保证厂商省电限制下持续联网；现有省电设置保持不变。长期后台、跨设备/跨网络、Windows、真实平板/折叠屏仍需回归。Metro 的 `@noble/hashes/crypto.js` package exports fallback 已知警告保留。

## English

**0.5.14** fixes Remote sign-out and Server address saving, and improves Android connection recovery, streaming chat and navigation. All first-party packages and clients use **0.5.14**, matching tag **v0.5.14**; Android `versionCode` and Expo iOS `buildNumber` are **58**.

- **One Remote sign-out:** an already mounted settings page clears its account display when signing out from Remote. Both Host and Client cleanup and credential removal finish even when one revocation or stream/preview cleanup fails. Late connection and workspace results cannot restore signed-out state.
- **Save Server address:** a **Save** button beside the sign-in address applies the Server and automatically reloads its sign-in methods. Old QR sessions, polling and late results are discarded; QR and password sign-in use the same saved Server.
- **Android connection recovery:** start the connection service before authentication, scope notifications and CPU wake locks to the active connection, and verify the encrypted Host path periodically. Up to three recovery attempts retain the selected session and history, without replaying prompts, approvals or terminal input.
- **Android streaming chat:** coalesce CodeX deltas, retain unchanged message references and isolate retired subscriptions to fix React update-depth failures and associated disconnects. Keyboard/composer changes keep the latest reply visible, while manual scrolling preserves reading position.
- **Android navigation:** load workspace catalogs for the selected category, show recovery actions when disconnected, remove misleading empty states and unavailable message actions, place error messages inside safe areas, and animate connection/recovery text suffixes.

### Validation and limits

Local workspace type checks, **732 tests**, production builds (including Android Hermes export), DSH bundle validation and version consistency checks pass. The release workflow repeats checks and builds, then produces the npm plugin, browser extension and Android APK. The user confirmed the local Desktop build containing the sign-out and Server-saving fixes. Earlier Android device checks covered a complete streamed reply, keyboard following, a short screen-on app switch, and reconnection after waking a Xiaomi phone.

Xiaomi screen-off freezing can disable wake locks and destroy sockets. This version does not guarantee continuous connectivity under OEM battery restrictions; existing battery settings were unchanged. Long background runs, cross-device/network behavior, Windows and real tablets/foldables still require regression testing. The known Metro `@noble/hashes/crypto.js` package exports fallback warning remains.

---

[安装说明](https://github.com/liguobao/ds-harness-remote/blob/v0.5.14/README.zh.md#安装) · [Installation](https://github.com/liguobao/ds-harness-remote/blob/v0.5.14/README.md#install) · [完整改动 / Full changelog](https://github.com/liguobao/ds-harness-remote/compare/v0.5.13...v0.5.14)
