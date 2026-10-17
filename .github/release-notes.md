## 中文

**0.5.11** 汇总自 `v0.5.10` 以来的更新，重点改进 Agent 模型切换、OpenCode 历史与归档、Android 会话导航，以及 macOS/Linux 安装。本仓库各自有包与客户端版本统一为 **0.5.11**；Android `versionCode` 与 Expo iOS `buildNumber` 均为 **49**。

- **模型切换以 Host 确认为准**：Desktop/Android 接入 OpenCode、Cursor 和 Claude 的实际模型目录与切换结果，移除 OpenCode 硬编码目录和上游失败后的假成功。Cursor 模型设置按会话隔离；Android 补齐 AGY 模型/effort 选择，Pi 显示名保持一致。
- **会话与历史更可靠**：未知 ACP 会话不能回退到其他会话；完整模型 ID 优先匹配，有歧义的别名直接拒绝。OpenCode 历史失败保留具体错误供重试，读取历史无需取得会话控制权。ACP 会话按 Host 活动时间排序，读取历史不再改变更新时间。
- **OpenCode 保存的会话与工具**：支持官方 `~/.opencode/bin/opencode` 安装位置、项目/会话发现及历史回放；修正 Files/Terminal 的后端作用域。Desktop/Android 使用 OpenCode 原生 API 归档，状态跨重启保留并同步到其他客户端；活动回复不能归档，暂不提供恢复归档或其他 ACP 后端的原生归档。
- **Claude 客户端入口**：补齐工作区、历史、文字会话与模型选择；恢复会话先加载可信目录，取消加载不会启动迟到回复。Claude 目前仅支持文字输入，Files/Terminal 尚未开放。
- **Android 会话体验**：改进回复展示、当前工作侧栏和统一会话导航，新增会话信息入口；Remote 工作区入口与原生侧栏行样式对齐。
- **旧 Host 主题兼容**：修复 RC.1 Desktop 连接旧 Harness Host 时，主题设置缺少新字体字段导致界面初始化失败的问题；仅补齐显示默认值，保留 Host schema、revision 与写入拒绝结果。
- **单一安装入口**：macOS/Linux 统一使用 `scripts/install.sh`，修复 macOS 系统 Bash 3.2 语法问题。Linux 要求 root；缺少 DSH 时引导安装私有 Node.js/DSH/pnpm，支持一次性 Host 注册 Token，并启用 root systemd 系统服务。已有 DSH 直接复用，不自动升级；**服务中的 Host、工具和终端具有 root 权限**。移除独立卸载/Token 包装脚本、Windows 安装脚本及云主机镜像打包入口；Windows 安装与各平台卸载使用官方插件管理或命令。

### 验证与待验收范围

全仓类型检查、**683 个测试**、生产构建（含 Android Hermes 导出）、DSH GitHub bundle 与 npm 打包入口检查通过；安装器已在 Bash 3.2 和新版 Bash 下完成文件/管道执行烟测。本次未完成 Windows、原生 APK/真机或新增能力的加密跨设备验收；Linux 干净服务器安装和重启自启仍待实机验证。新增 ACP 客户端能力不等于独立 Remote Web runtime 已完成接入。

本机缺少 Intelligent UI renderer 时使用安全降级；Release APK 工作流会另行打包固定审核版本。本次本机构建不能替代该 APK 的验收。Metro 的 `@noble/hashes/crypto.js` exports fallback 警告仍存在。

升级时请指定 **`ds-harness-remote@0.5.11`** 并同步更新 Host 插件和 Android 客户端；若 Desktop 仍显示旧插件，可按官方插件管理流程移除后指定版本重装。感谢 [#129](https://github.com/liguobao/ds-harness-remote/issues/129) 的反馈与确认；该反馈不代表本版已完成 Windows 全量回归。

### 感谢贡献者

感谢参与代码、审查、测试、文档和问题反馈的所有人。本版特别感谢：

- [@sugershun](https://github.com/sugershun)：反馈 Windows Desktop/Android 连接问题，并确认指定版本重装的结果（[#129](https://github.com/liguobao/ds-harness-remote/issues/129)）。
- [@pengyz](https://github.com/pengyz)：此前贡献 Android 可靠发送、队列、Agent 团队面板及响应改进（[#115](https://github.com/liguobao/ds-harness-remote/pull/115)）。
- [@dreamfarer-space](https://github.com/dreamfarer-space)：此前贡献发送/Markdown 修复、Intelligent UI、Android 沉浸式适配及真机/模拟器记录（[#118](https://github.com/liguobao/ds-harness-remote/pull/118)、[#126](https://github.com/liguobao/ds-harness-remote/pull/126)、[#128](https://github.com/liguobao/ds-harness-remote/pull/128)）。
- [@luojiyin1987](https://github.com/luojiyin1987)：此前整理验收优先级并贡献真实 WebSocket Relay 安全测试（[#121](https://github.com/liguobao/ds-harness-remote/pull/121)、[#123](https://github.com/liguobao/ds-harness-remote/pull/123)）。

上述此前贡献是本版持续改进的基础，并非本版新增代码贡献。自 `v0.5.10` 以来的代码实现、审查修复与发布整合由 [@liguobao](https://github.com/liguobao) 完成。

## English

**0.5.11** brings together changes since `v0.5.10`, focusing on Agent model selection, OpenCode history and archiving, Android session navigation, and macOS/Linux installation. All first-party package and client versions are **0.5.11**; Android `versionCode` and Expo iOS `buildNumber` are **49**.

- **Host-confirmed model selection:** Desktop/Android use actual OpenCode, Cursor and Claude catalogs and confirmed selection results. Removes OpenCode's hardcoded catalog and false success after upstream errors. Cursor settings are isolated by session; Android adds AGY model/effort selection and consistent Pi naming.
- **Safer sessions and history:** unknown ACP session IDs cannot fall back to another session. Exact model IDs take precedence; ambiguous aliases are rejected. OpenCode history errors remain visible for retry, and history reads no longer require session control ownership. ACP conversations follow Host activity timestamps; reading history does not change their update time.
- **OpenCode saved sessions and tools:** discovers the official `~/.opencode/bin/opencode` installation, projects and sessions, and replays saved history. Corrects Files/Terminal backend scope. Desktop/Android use OpenCode's native archive API, with state retained across restarts and catalog updates shared with other clients. Active turns cannot be archived; unarchive and native archive for other ACP backends are not supported yet.
- **Claude client entry points:** adds workspaces, history, text chats and model selection. Restored sessions load the trusted catalog first; cancellation cannot start a late turn. Claude currently supports text input; Files/Terminal are unavailable.
- **Android conversations:** improves reply visibility, the current-work sidebar and consistent session navigation, adds conversation information, and aligns Remote workspace entries with native sidebar rows.
- **Older Host theme compatibility:** fixes RC.1 Desktop initialization when an older Harness Host omits new theme font fields. Only display defaults are supplied; Host schemas, revisions and write refusals are preserved.
- **One installer:** macOS/Linux use `scripts/install.sh`, including a fix for macOS system Bash 3.2. Linux requires root, bootstraps private Node.js/DSH/pnpm when DSH is missing, accepts one-time Host registration tokens, and enables a root systemd system service. Existing DSH is reused without an automatic upgrade; **the service's Host, tools and terminals run with root privileges**. Removes separate uninstall/token wrappers, Windows installer scripts and cloud Host image packaging. Use official plugin management or commands for Windows installation and uninstallation on each platform.

### Validation and acceptance limits

Workspace type checks, **683 tests**, production builds including Android Hermes export, DSH GitHub bundle validation and npm package-entry checks pass. Installer file/pipe smoke checks pass under Bash 3.2 and modern Bash. This release has not completed Windows, native APK/device or encrypted cross-device acceptance for the new changes. Clean Linux server installation and reboot startup still need real-machine verification. New ACP client features do not imply integration into the independent Remote Web runtime.

Local builds use a safe fallback when the Intelligent UI renderer is absent; the Release APK workflow separately bundles its pinned, audited renderer. Local builds do not replace acceptance of that APK. The existing Metro `@noble/hashes/crypto.js` exports fallback warning remains.

Pin **`ds-harness-remote@0.5.11`** when upgrading and update both the Host plugin and Android client. If Desktop still shows an older plugin, remove it through official plugin management and reinstall the pinned version. Thanks for the report and confirmation in [#129](https://github.com/liguobao/ds-harness-remote/issues/129); that report does not establish full Windows regression coverage for this release.

### Contributors

Thank you to everyone who contributed code, reviews, tests, documentation and feedback:

- [@sugershun](https://github.com/sugershun) for reporting the Windows Desktop/Android connection issue and confirming the result of a version-pinned reinstall ([#129](https://github.com/liguobao/ds-harness-remote/issues/129)).
- [@pengyz](https://github.com/pengyz) for earlier Android delivery, queue, agent-team and responsiveness improvements ([#115](https://github.com/liguobao/ds-harness-remote/pull/115)).
- [@dreamfarer-space](https://github.com/dreamfarer-space) for earlier delivery/Markdown fixes, Intelligent UI, edge-to-edge support and device/emulator records ([#118](https://github.com/liguobao/ds-harness-remote/pull/118), [#126](https://github.com/liguobao/ds-harness-remote/pull/126), [#128](https://github.com/liguobao/ds-harness-remote/pull/128)).
- [@luojiyin1987](https://github.com/luojiyin1987) for earlier acceptance priorities and real WebSocket Relay security tests ([#121](https://github.com/liguobao/ds-harness-remote/pull/121), [#123](https://github.com/liguobao/ds-harness-remote/pull/123)).

Those earlier contributions underpin this release's improvements; they are not new code contributions in 0.5.11. Implementation, review fixes and release integration since `v0.5.10` are by [@liguobao](https://github.com/liguobao).

---

[安装说明](https://github.com/liguobao/ds-harness-remote/blob/v0.5.11/README.zh.md#安装) · [Installation](https://github.com/liguobao/ds-harness-remote/blob/v0.5.11/README.md#install) · [完整改动 / Full changelog](https://github.com/liguobao/ds-harness-remote/compare/v0.5.10...v0.5.11)
