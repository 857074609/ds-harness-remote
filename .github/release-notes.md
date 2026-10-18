## 中文

**0.5.12** 汇总自 `v0.5.11` 以来的更新，重点加入 Android 横竖屏适配、修复 CodeX 新会话历史投影，并补充依赖安全与 Agent 可靠性更新。本仓库各自有包与客户端版本统一为 **0.5.12**；Android `versionCode` 与 Expo iOS `buildNumber` 均为 **50**。

- **Android 横竖屏适配**：解除竖屏锁定，跟随系统自动旋转；聊天消息、输入栏和轨迹页在宽窗口使用可读列，底部弹层按窗口高度收缩并可滚动，工作区对话框、设备重命名、Home 菜单、连接页与启动页适配横屏和短窗口；旋转后重新同步 IME inset。已在 Android 15 真机完成横竖屏往返烟测。
- **CodeX 新会话可打开**：当前 App Server 版本会在首条用户消息之后才 materialize Thread。尚未 materialize 的 Thread 不再被当作历史读取失败，而是投影为空历史基线；旧 Host 的 legacy `thread/read` 回退仍保留。
- **依赖安全更新**：同步兼容的安全补丁，生产依赖 audit 发现由 32 项降至 5 项；剩余 Expo/Metro 构建链公告与验收边界记录在 [TODO](https://github.com/liguobao/ds-harness-remote/blob/v0.5.12/docs/TODO.md)。
- **Agent 可靠性**：修复 Pi 现代模型/Thinking 状态确认，并在读取超大文件前执行文件预览内存限额。ACP/CodeX 请求与归属回滚在断线、后端替换时 fail closed，退役 Prompt 结果不再污染新任务；OpenCode 历史子进程在关闭或超限时停止。

### 验证与待验收范围

全仓类型检查、**692 个测试**、生产构建（含 Android Hermes 导出）、DSH GitHub bundle 与 npm 打包入口检查通过；Android 旋转已在真机完成横竖屏往返烟测。本次未完成 Windows、原生 APK/TalkBack、平板/折叠屏/分屏及加密跨设备全量验收；iOS 方向锁定也随本版解除，iOS 旋转布局尚未验证。新增能力不代表独立 Remote Web runtime 已完成接入。

本机缺少 Intelligent UI renderer 时使用安全降级；Release APK 工作流会另行打包固定审核版本。本次本机构建不能替代该 APK 的验收。Metro 的 `@noble/hashes/crypto.js` exports fallback 警告仍存在。

升级时请指定 **`ds-harness-remote@0.5.12`** 并同步更新 Host 插件和 Android 客户端；若 Desktop 仍显示旧插件，可按官方插件管理流程移除后指定版本重装。

### 感谢贡献者

感谢参与代码、审查、测试、文档和问题反馈的所有人。本版未引入新的外部代码贡献，发布整合由 [@liguobao](https://github.com/liguobao) 完成。

## English

**0.5.12** brings together changes since `v0.5.11`, adding Android screen rotation, fixing CodeX new-conversation history projection, and including dependency-security and Agent reliability updates. All first-party package and client versions are **0.5.12**; Android `versionCode` and Expo iOS `buildNumber` are **50**.

- **Android screen rotation:** removes the portrait lock and follows the system rotation setting. Chat content, the composer and the trajectory view use a readable column on wide windows; bottom sheets shrink to the live window height and scroll; workspace dialogs, device rename, the home menu, connection and boot screens adapt to landscape and short windows; IME insets are re-synced after rotation. Verified with portrait/landscape round trips on an Android 15 device.
- **CodeX new conversations open:** current App Server versions materialize a Thread only after its first user message. Threads that are not materialized yet are projected as an empty history baseline instead of a failed read; the legacy `thread/read` fallback for older Hosts remains.
- **Dependency security:** compatible security patches are applied; production-dependency audit findings drop from 32 to 5, with the remaining Expo/Metro build-chain advisories and acceptance limits tracked in [TODO](https://github.com/liguobao/ds-harness-remote/blob/v0.5.12/docs/TODO.md).
- **Agent reliability:** fixes Pi modern model/Thinking state confirmation and bounds file-preview allocation before reading oversized files. ACP/CodeX requests and ownership rollback fail closed on disconnect or backend replacement, retired Prompt results cannot pollute new tasks, and OpenCode history subprocesses stop on shutdown or overflow.

### Validation and acceptance limits

Workspace type checks, **692 tests**, production builds including Android Hermes export, DSH GitHub bundle validation and npm package-entry checks pass. Android rotation was smoke-tested on a real device. This release has not completed Windows, native APK/TalkBack, tablet/foldable/split-screen or full encrypted cross-device acceptance. iOS orientation locking is also removed by this release, but iOS rotation layouts have not been verified. New capabilities do not imply integration into the independent Remote Web runtime.

Local builds use a safe fallback when the Intelligent UI renderer is absent; the Release APK workflow separately bundles its pinned, audited renderer. Local builds do not replace acceptance of that APK. The existing Metro `@noble/hashes/crypto.js` exports fallback warning remains.

Pin **`ds-harness-remote@0.5.12`** when upgrading and update both the Host plugin and Android client. If Desktop still shows an older plugin, remove it through official plugin management and reinstall the pinned version.

### Contributors

Thank you to everyone who contributed code, reviews, tests, documentation and feedback. This release introduces no new external code contributions; release integration is by [@liguobao](https://github.com/liguobao).

---

[安装说明](https://github.com/liguobao/ds-harness-remote/blob/v0.5.12/README.zh.md#安装) · [Installation](https://github.com/liguobao/ds-harness-remote/blob/v0.5.12/README.md#install) · [完整改动 / Full changelog](https://github.com/liguobao/ds-harness-remote/compare/v0.5.11...v0.5.12)
