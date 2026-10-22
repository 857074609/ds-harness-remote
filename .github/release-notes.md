## 中文

**v0.5.17**

- Android 新增原生 Bot 模式，统一入口与管理控件，支持 Bot 提及跳转和会话文件链接预览，折叠系统上下文与回执。
- 文件预览支持 Markdown 渲染；Android 10+ 可直接保存文件到系统 Downloads。
- 启动时自动进入唯一在线且已信任主机的工作区，统一设置开关配色。
- 加固自部署 Server Docker 的 protocol 包打包，并在镜像构建时校验模块加载（#146）。
- 修复发布构建中共享包产物的并发读写冲突，并增加生产 bundle 一致性校验。

## English

**v0.5.17**

- Add native Android Bot mode with unified navigation and management controls, Bot mention navigation, conversation file-link previews, and folded system context and receipts.
- Render Markdown file previews and save files directly to system Downloads on Android 10+.
- Open workspaces automatically for a single online, trusted Host at startup and unify settings switch colors.
- Harden protocol packaging for the self-hosted Server Docker image and validate module loading during image builds (#146).
- Fix concurrent shared-package output writes during release builds and verify production bundle consistency.
