# Changelog

## [0.4.0](https://github.com/Syotick/nova-agent/compare/nova-agent-v0.3.0...nova-agent-v0.4.0) (2026-08-20)


### ✨ 新功能

* Codex 模式——run_command 终端工具 + 进程生命周期管理 ([060d286](https://github.com/Syotick/nova-agent/commit/060d286eed8d83022b1c4b24f77ffb72b2450cd3))
* MCP 服务器管理页 + 技能导入导出 + 记忆生命周期 v2 ([c2f636d](https://github.com/Syotick/nova-agent/commit/c2f636d196fe31caef78e35c0ad1e8977464995a))
* P1 foundation - SQLite storage, task scheduler, modular routes, MCP health ([5dcdeff](https://github.com/Syotick/nova-agent/commit/5dcdeff75a9e5ee28a39001e3c8e5ac83851d891))
* React 前端重写 + 多渠道模型 + 搜索增强 + 系统加固 ([7185c47](https://github.com/Syotick/nova-agent/commit/7185c47c9ce035590fa028774aa80e5e90d1e6b5))
* real context compaction with LLM summarization ([c7081af](https://github.com/Syotick/nova-agent/commit/c7081af9cad21aeea2db7375c86f9aaf987a5451))
* release-please automation + beginner-friendly docs ([1cb2a9b](https://github.com/Syotick/nova-agent/commit/1cb2a9b7956ba255b2430daf1eed6ee96c2684ba))
* subagent 子 Agent 编排 + token 用量展示 ([63c0056](https://github.com/Syotick/nova-agent/commit/63c005602d4b177c3d5a106d7c7753b9e9125412))
* **ui:** Nova 品牌视觉——新星 Logo（星+轨道环）+ 思考 Orb ([0a6ecd7](https://github.com/Syotick/nova-agent/commit/0a6ecd7e4ac0441e26421d9ceaa1880f26334289))
* **ui:** 侧边栏导航分组 + 空状态上手引导 ([5d33374](https://github.com/Syotick/nova-agent/commit/5d33374b3f99e6ed693d346ccf87728a269ce7af))
* **ui:** 星空极光背景 + 侧边栏品牌化 ([9b6f865](https://github.com/Syotick/nova-agent/commit/9b6f8652df680a1a809c6b9bc7047a47baf1bb69))
* **ui:** 轨迹视图步骤回放 + 工具卡片紧凑药丸态 ([644ee2d](https://github.com/Syotick/nova-agent/commit/644ee2d2499b8e7d382dfcfabc2ed90f1904cd02))
* **ui:** 首屏欢迎面板——大标题 + 可点击示例问题 ([6bae8e2](https://github.com/Syotick/nova-agent/commit/6bae8e2dea4960a3a2649563057f2ec0480df0a3))
* Vibe 自治循环——目标驱动多轮执行直到收敛 ([ea2fa2b](https://github.com/Syotick/nova-agent/commit/ea2fa2bb5be67fac5312a906094d5b544e873338))
* 上下文窗口感知与自动压缩兜底（1M 缺省/90% 阈值双触发） ([b8af12b](https://github.com/Syotick/nova-agent/commit/b8af12bb536a55f8e48ede1f7369699cedc8309b))
* 会话导出（Markdown 人读 + JSON 完整无损） ([2112603](https://github.com/Syotick/nova-agent/commit/2112603a9cb0f9a8da1edb9941c345f9b31a3a40))
* 内置 glob 工具——补齐六大核心编程工具之一（文件名模式匹配） ([2d262da](https://github.com/Syotick/nova-agent/commit/2d262daf10cde95e38457f3261bdf73c29fd4890))
* 内置工具可配置——Agent 可勾选启用的内置工具（默认全选） ([5276c07](https://github.com/Syotick/nova-agent/commit/5276c07b6a9520ddcb2b14174d45391244fcc390))
* 可配置工作区（Codex 式目录选择 + 兜底工具区 + 边界校验） ([19f3048](https://github.com/Syotick/nova-agent/commit/19f3048d2d8051c3b405a16d9f7d4cb0a1aa7d00))
* 工作区选择移到对话区常驻 + 移除首启弹窗 ([c0982b3](https://github.com/Syotick/nova-agent/commit/c0982b332dcf1b539c85510f6978cfd1a9fa8765))
* 记忆系统增强——AGENTS.md 项目记忆文件 + 存量归并 ([ab7fb7b](https://github.com/Syotick/nova-agent/commit/ab7fb7b1cffb88fbf4cd16137eb3fd3bfbefe3c8))


### 🐛 修复

* create data directory before opening SQLite (CI/fresh env) ([1c28dd3](https://github.com/Syotick/nova-agent/commit/1c28dd3156128789b5a2c72fe5c5a7d363caf255))
* file-ops 技能去掉本机写死路径（改为工作区通用描述） ([f5a049c](https://github.com/Syotick/nova-agent/commit/f5a049c4a3f6094a5fa58371f1432d6cbe8b73d5))
* release-please manifest mode (config-file + manifest-file) ([88812b4](https://github.com/Syotick/nova-agent/commit/88812b4e3f8737b6e2c6fdb03b156ecfec046aad))
* run_command 在执行前确保目标目录存在（CI 全新 clone 无 workspace 导致 spawn 失败） ([6418fc4](https://github.com/Syotick/nova-agent/commit/6418fc4e7894a480a2bb9f10d9c65a6b5f33275a))
* workspace 测试平台无关化（CI Linux 失败：Windows 反斜杠/盘符断言不跨平台） ([cf2a63b](https://github.com/Syotick/nova-agent/commit/cf2a63be2a8bb07c7e1c6baedd8ebfb7fbbb0b7b))
* 前端流式展示——新增思考计时，移除蓝色打字光标 ([6eed027](https://github.com/Syotick/nova-agent/commit/6eed027abf7064850559e593cc5122ad251885ae))
* 工作区选择移到输入框工具栏（对话框旁边），移除顶部条 ([ae6e55b](https://github.com/Syotick/nova-agent/commit/ae6e55b80a4751e8f36c835af17729494e61e68f))


### 📄 文档

* add CI/CD & project management best-practices research report ([751b6db](https://github.com/Syotick/nova-agent/commit/751b6dbcfd123a60e345d18cde9a7cad0e13aade))
* move internal research docs out of public repo ([24330e6](https://github.com/Syotick/nova-agent/commit/24330e6d1fcf7dd00f855ee09270f8cea3534bf8))
* reorganize repo structure per open-source conventions ([589a156](https://github.com/Syotick/nova-agent/commit/589a15640bcecc9f225c08463625f300e3333c64))
* split public docs vs private devdocs ([c3027f6](https://github.com/Syotick/nova-agent/commit/c3027f6a773e3da7b98362e2048ac49070457c8e))
* 指南目录 06 描述错字修正 ([e6da7ab](https://github.com/Syotick/nova-agent/commit/e6da7ab8da93922013fe4b418add7535c7abfb74))
* 精简 README 首屏文案 ([13aa4e2](https://github.com/Syotick/nova-agent/commit/13aa4e2870a070fcde38150efae3ffbd9a7ec056))
* 精简 subagent 注释 ([c44eb29](https://github.com/Syotick/nova-agent/commit/c44eb2934a8ca36ed2c73e9be8c52a131def804e))
* 精简 vibe 引擎注释 ([1715a45](https://github.com/Syotick/nova-agent/commit/1715a45f0fd24ad299cfb8690f0c832d628ee03b))
* 读代码指南 01/02——Agent Loop 走读（含术语速查）+ MCP 客户端走读 ([42c7960](https://github.com/Syotick/nova-agent/commit/42c7960d2e2c9dbeb8fdb157f035dc9b9dd07abe))
* 读代码指南 03——run_command 终端工具走读（进程生命周期 + Windows 平台坑） ([ecada41](https://github.com/Syotick/nova-agent/commit/ecada4183c061ffb057f8c7dcfb716eaf67697b3))
* 读代码指南 04——技能系统走读（SKILL.md 两级加载 + 目录即安装） ([3cf89ed](https://github.com/Syotick/nova-agent/commit/3cf89ed5449578c540bdc8c936f2ea9af5e23562))
* 读代码指南 05——跨会话记忆走读（去重合并 + LRU + 词面子串检索） ([3ee9a4c](https://github.com/Syotick/nova-agent/commit/3ee9a4c14927cf7a64ff603ceff7c9ba722949b6))
* 读代码指南 06——上下文压缩走读（真实计数优先 + 双触发兜底） ([ff62be8](https://github.com/Syotick/nova-agent/commit/ff62be8f24f417c9d8bc0db1ab66efb0cb4cc526))
* 读代码指南 07——工作区走读（权限边界 + 占位符联动 + 危险目标拒绝） ([089bdcb](https://github.com/Syotick/nova-agent/commit/089bdcbed1cecf541e4300583daaf699633cdada))
* 读代码指南 08（完结）——Vibe 自治循环走读 + 全系列收尾地图 ([e59315e](https://github.com/Syotick/nova-agent/commit/e59315e8b5d66ab43a1399eff21338a57566111f))
* 读代码指南第 01 篇——Agent Loop 代码走读 ([9922c31](https://github.com/Syotick/nova-agent/commit/9922c317ce6c0382db4aaf8fdbf1f1499532d2f2))


### 🔧 其他

* add start.bat launcher (Node version check + auto install + start) ([e95485f](https://github.com/Syotick/nova-agent/commit/e95485fd8e02d58e07df7049baad5be8d7967181))
* bump-minor-pre-major for pre-1.0 releases ([387dcd8](https://github.com/Syotick/nova-agent/commit/387dcd8dbe1e07821a3f884c9e99a241e0e5a171))
* gitignore SQLite database files ([480e1ae](https://github.com/Syotick/nova-agent/commit/480e1aef42be6c164c8ada64dbc9291095896b0c))
* initial commit - my-agent (Claude Code mini, Vue2.7 + Express + AI SDK + MCP) ([3781097](https://github.com/Syotick/nova-agent/commit/3781097e5c71c88545b09d7dbaabe188b4e952bb))
* **main:** release nova-agent 0.2.0 ([#3](https://github.com/Syotick/nova-agent/issues/3)) ([208b4ca](https://github.com/Syotick/nova-agent/commit/208b4ca23d3c7b63197cff6899626fb90bd7beb4))
* **main:** release nova-agent 0.3.0 ([7fda7f1](https://github.com/Syotick/nova-agent/commit/7fda7f139f9e4d8cefeaa79a523af06546e65c01))
* **main:** release nova-agent 0.3.0 ([2ca8f1f](https://github.com/Syotick/nova-agent/commit/2ca8f1fad4ef0739bb865c94e5c90e00e0e61929))
* re-run CI ([ea67842](https://github.com/Syotick/nova-agent/commit/ea678427e72936988424e83281bb398dfc944ae7))
* rebrand to nova-agent, open-source docs ([ce0e28c](https://github.com/Syotick/nova-agent/commit/ce0e28cf287afd979201e8fb3789d7a78657a480))
* upgrade actions to v5 (Node 20 deprecation) ([9d13b1b](https://github.com/Syotick/nova-agent/commit/9d13b1bcc0d3fbb11bc38238dc7e5ac8745ccc2f))
* 开源准备——author 换 GitHub 隐私邮箱，移除 private 标记 ([fb27d05](https://github.com/Syotick/nova-agent/commit/fb27d05b278dd1a388f9de12ba71c18c8c5cc431))

## [0.3.0](https://github.com/Syotick/nova-agent/compare/nova-agent-v0.2.0...nova-agent-v0.3.0) (2026-08-16)


### ✨ 新功能

* MCP 服务器管理页 + 技能导入导出 + 记忆生命周期 v2 ([f20b1ab](https://github.com/Syotick/nova-agent/commit/f20b1ab5e64dab6af98d53078ca0d4fe10a9c2c7))
* React 前端重写 + 多渠道模型 + 搜索增强 + 系统加固 ([22c1ee7](https://github.com/Syotick/nova-agent/commit/22c1ee7429cf090139b20ef01714d350ae3aaeae))
* subagent 子 Agent 编排 + token 用量展示 ([9cc55a0](https://github.com/Syotick/nova-agent/commit/9cc55a0441ca28d12397ff8b91cd6be5bb911d45))


### 🐛 修复

* create data directory before opening SQLite (CI/fresh env) ([b60619d](https://github.com/Syotick/nova-agent/commit/b60619d2084427a14e7ab0de41d23dd1b9c89cd7))


### 📄 文档

* move internal research docs out of public repo ([0b9e95e](https://github.com/Syotick/nova-agent/commit/0b9e95e5aff11cb03f0559a380a02c7f0d948c10))
* split public docs vs private devdocs ([e72da0e](https://github.com/Syotick/nova-agent/commit/e72da0e6c37cfe45521c32229eb65af97a462c3e))

## [0.2.0](https://github.com/Syotick/nova-agent/compare/nova-agent-v0.1.0...nova-agent-v0.2.0) (2026-08-16)


### ✨ 新功能

* SQLite storage, task scheduler, modular routes, MCP health ([5dcdeff](https://github.com/Syotick/nova-agent/commit/5dcdeff75a9e5ee28a39001e3c8e5ac83851d891))
* real context compaction with LLM summarization ([c7081af](https://github.com/Syotick/nova-agent/commit/c7081af9cad21aeea2db7375c86f9aaf987a5451))
* release-please automation + beginner-friendly docs ([1cb2a9b](https://github.com/Syotick/nova-agent/commit/1cb2a9b7956ba255b2430daf1eed6ee96c2684ba))


### 🐛 修复

* release-please manifest mode (config-file + manifest-file) ([88812b4](https://github.com/Syotick/nova-agent/commit/88812b4e3f8737b6e2c6fdb03b156ecfec046aad))


### 📄 文档

* add CI/CD & project management best-practices research report ([751b6db](https://github.com/Syotick/nova-agent/commit/751b6dbcfd123a60e345d18cde9a7cad0e13aade))
* reorganize repo structure per open-source conventions ([589a156](https://github.com/Syotick/nova-agent/commit/589a15640bcecc9f225c08463625f300e3333c64))


### 🔧 其他

* bump-minor-pre-major for pre-1.0 releases ([387dcd8](https://github.com/Syotick/nova-agent/commit/387dcd8dbe1e07821a3f884c9e99a241e0e5a171))
* gitignore SQLite database files ([480e1ae](https://github.com/Syotick/nova-agent/commit/480e1aef42be6c164c8ada64dbc9291095896b0c))
* initial commit - my-agent (Claude Code mini, Vue2.7 + Express + AI SDK + MCP) ([3781097](https://github.com/Syotick/nova-agent/commit/3781097e5c71c88545b09d7dbaabe188b4e952bb))
* rebrand to nova-agent, open-source docs ([ce0e28c](https://github.com/Syotick/nova-agent/commit/ce0e28cf287afd979201e8fb3789d7a78657a480))
* upgrade actions to v5 (Node 20 deprecation) ([9d13b1b](https://github.com/Syotick/nova-agent/commit/9d13b1bcc0d3fbb11bc38238dc7e5ac8745ccc2f))
