## 中文

**v0.5.18**

- Android 登录按服务端能力发现 OAuth 方式，支持 Google 与各渠道二维码；三点菜单切换服务器，并隔离取消及切换后的迟到登录结果。
- 群聊工具回复在 Harness 和单 Bot 会话中直接显示正文，解析包装结果并隐藏重复完成提示，保留失败与工具诊断。
- 加固工具回复解析的嵌套深度与数组边界，避免异常工具输出导致聊天渲染栈溢出或误识别回复。
- 修复会话文件夹链接，打开现有文件浏览面板而非按文件预览。
- 修复排队消息不可见问题（#147），保留回显前的未确认状态，防止迟到队列投影隐藏已确认消息。

验证：全仓 check 与 794 tests 通过（Plugin 407、Android 195）。生产 build（含 Android Hermes export）与 DSH bundle 校验通过；本次未新增原生真机或跨设备验收。

## English

**v0.5.18**

- Discover Android OAuth providers from the server, including Google and per-provider QR login; switch servers from the overflow menu and isolate cancelled or stale sign-in results.
- Show group-tool replies directly in Harness and individual Bot conversations, parse wrapped payloads and hide redundant completion headers while retaining failures and tool diagnostics.
- Bound tool-reply nesting and array recovery to prevent render-time stack overflow and incorrect reply attribution from malformed output.
- Fix conversation folder links to open the existing file browser instead of a file preview.
- Fix queued-message visibility (#147): retain unconfirmed messages before their echo and prevent late queue projections from hiding confirmed messages.

Validation: full workspace check and 794 tests passed (407 Plugin, 195 Android). Production build (including Android Hermes export) and DSH bundle validation passed; no new native-device or cross-device acceptance was performed.
