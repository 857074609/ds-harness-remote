## 中文

**0.5.15** 改进 Remote 历史加载、工作区创建与交互卡片支持。Android versionCode 与 Expo iOS buildNumber 为 **59**。

- 新增按连接隔离的可选精简历史；保留正文、分页、事件关联与实时审批。
- CodeX 大型工具输出支持按需展开，详情句柄按已认证连接隔离并自动过期。
- Harness 创建工作区时支持创建缺失目录，校验绝对非根路径并保留原路径语义。
- 支持 DS Bot 交互卡片回复，修复侧栏布局干扰，并明确记录 Server 主动断线来源。
- Android 改进历史浏览与卡片刷新，移除持久化对话正文预览，新增五种界面语言。

本地 Plugin/共享包构建、类型检查、bundle 校验及打包通过。Plugin 测试首轮 ACP 文件监听断言失败，单文件与全量复测通过（404 项）；真实 Desktop 与跨设备验收待完成。

## English

**0.5.15** improves Remote history delivery, workspace creation and interactive cards. Android versionCode and Expo iOS buildNumber are **59**.

- Add optional, connection-scoped compact history while preserving text, pagination, event correlation and live approvals.
- Load large CodeX tool outputs on demand using expiring, authenticated-peer-scoped detail handles.
- Create missing Harness workspace directories after validating absolute, non-root paths.
- Support DS Bot interactive card replies, avoid overriding host sidebar layout, and identify Server-initiated disconnects.
- Improve Android history browsing and card refresh, remove persisted conversation previews, and add five interface languages.

Local Plugin/shared-package builds, type checks, bundle verification and packaging passed. One ACP file-watcher assertion failed on the initial test run; focused and full reruns passed (404 Plugin tests). Desktop and cross-device acceptance remain pending.
