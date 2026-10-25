## 中文

**v0.5.19 · Android build 64**

- **兼容性变更：** Host 插件、随包客户端和 Android 不再支持旧版 ApiProxy，请升级到支持 Typert Remote 的 Host。
- 修复 Android 会话图片预览，支持全屏查看和重试（#159）。
- 优化 Android 流式回复自动滚动，新增阅读密度设置和离线 LaTeX 公式显示（#156、#157、#162、#164）。
- 修复 Android 继续 CodeX 会话时覆盖远端权限的问题（#160）。
- 适配 DS Bot 0.2.1，支持旁问 `/btw`、群聊继续、图表和计算卡片。
- 修复超大会话历史加载，以及连接时误启动第二个 Desktop 的问题（#161）。
- 临时断网时保留登录状态，修复关闭设备控制后的启动行为，优化侧栏布局。
- 修复自部署 Server Docker 文件权限和浏览器扩展多语言资源打包（#146）。
- 新增日文 README，更新安装说明。

感谢 @dreamfarer-space、@xiongyuyang 和 @bluesmilery 的贡献。

## English

**v0.5.19 · Android build 64**

- **Compatibility:** the Host plugin, bundled client and Android no longer support legacy ApiProxy. Upgrade to a Host with Typert Remote support.
- Fix Android conversation image previews, with full-screen viewing and retry (#159).
- Improve Android auto-scrolling during replies; add reading-density settings and offline LaTeX formulas (#156, #157, #162, #164).
- Fix Android overriding remote permissions when continuing CodeX conversations (#160).
- Support DS Bot 0.2.1 side questions (`/btw`), group continuation, charts and calculator cards.
- Fix oversized conversation history loading and connections launching a second Desktop (#161).
- Keep users signed in during temporary outages, fix startup with device control disabled, and tidy the sidebar layout.
- Fix self-hosted Server Docker file permissions and browser extension localization packaging (#146).
- Add a Japanese README and update installation instructions.

Thanks @dreamfarer-space, @xiongyuyang, and @bluesmilery for their contributions.
