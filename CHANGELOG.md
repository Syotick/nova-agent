# Changelog

## [0.5.0](https://github.com/Syotick/nova-agent/compare/nova-agent-v0.4.0...nova-agent-v0.5.0) (2026-09-04)


### ✨ 新功能

* **memory:** 记忆一键可插拔——一个开关管住工具+注入+指令段，构建逻辑收进 buildMemoryBlock 解耦 ([2d543ac](https://github.com/Syotick/nova-agent/commit/2d543acef1e9af7660d55f24b79c78c5b038b907))
* **memory:** 记忆检索升级——相关度×热度综合排序 + 热度补齐 + 管理页热度展示（无入侵增强） ([dbbf2e0](https://github.com/Syotick/nova-agent/commit/dbbf2e0ffa67a76562ee6f9652f7bb8badb6c6f2))
* **skills:** 技能按需加载——目录进 system + load_skill 工具取全文（对齐 DSH/Agent Skills） ([e14c68f](https://github.com/Syotick/nova-agent/commit/e14c68f87795a1a6b1a5712425fded654ec50996))
* **tools:** 统一工具注册表 ToolRegistry——内置+MCP 同管道装配，主循环只留一行 ([cff7bc2](https://github.com/Syotick/nova-agent/commit/cff7bc294150c95dc598569d5bee65eb3623cc67))

## [0.4.0](https://github.com/Syotick/nova-agent/compare/nova-agent-v0.3.0...nova-agent-v0.4.0) (2026-09-04)


### ✨ 新功能

* Codex 模式——run_command 终端工具 + 进程生命周期管理 ([8564f93](https://github.com/Syotick/nova-agent/commit/8564f93a12c86e26a79d35e0929d20fb7e6745e5))
* **context:** 上下文管理对齐 DSH——溢出自动恢复 + 工具结果修剪 + 按 token 预算保留 ([bab9342](https://github.com/Syotick/nova-agent/commit/bab93426bcb4ba3cd51780d03e449e8a02c86b34))
* **ui:** Nova 品牌视觉——新星 Logo（星+轨道环）+ 思考 Orb ([1958b46](https://github.com/Syotick/nova-agent/commit/1958b461e2973399c008225485240bcd76f93d74))
* **ui:** 侧边栏导航分组 + 空状态上手引导 ([7d99f06](https://github.com/Syotick/nova-agent/commit/7d99f06214637e2fa55d0997841cac3764c3b732))
* **ui:** 星空极光背景 + 侧边栏品牌化 ([232ee02](https://github.com/Syotick/nova-agent/commit/232ee02a24469e62393d7f89592f2b43d5217f45))
* **ui:** 轨迹视图步骤回放 + 工具卡片紧凑药丸态 ([84926e9](https://github.com/Syotick/nova-agent/commit/84926e97949b70d5e85962243d9c35280af0c9ba))
* **ui:** 首屏欢迎面板——大标题 + 可点击示例问题 ([7af756e](https://github.com/Syotick/nova-agent/commit/7af756efd66269961fc0419b916b4d9b52c73006))
* Vibe 自治循环——目标驱动多轮执行直到收敛 ([06a67f8](https://github.com/Syotick/nova-agent/commit/06a67f86c82c87d8f05191f604fe1d214aa24b5a))
* 上下文窗口感知与自动压缩兜底（1M 缺省/90% 阈值双触发） ([d5e5e75](https://github.com/Syotick/nova-agent/commit/d5e5e75e2bad9572c9a37cb1bf5833389c013e37))
* 会话导出（Markdown 人读 + JSON 完整无损） ([b76ebb7](https://github.com/Syotick/nova-agent/commit/b76ebb775820b7ca6befe108db8c718c6a742fa0))
* 内置 glob 工具——补齐六大核心编程工具之一（文件名模式匹配） ([bfa1c16](https://github.com/Syotick/nova-agent/commit/bfa1c16e4a19764e1df80a12fb989e7ef150a635))
* 内置工具可配置——Agent 可勾选启用的内置工具（默认全选） ([4fd04c9](https://github.com/Syotick/nova-agent/commit/4fd04c996b439158248411e8074b630c701ba450))
* 可配置工作区（Codex 式目录选择 + 兜底工具区 + 边界校验） ([b84681f](https://github.com/Syotick/nova-agent/commit/b84681fceee1c804c220612a9ccda54dc64c94b8))
* 工作区选择移到对话区常驻 + 移除首启弹窗 ([0458588](https://github.com/Syotick/nova-agent/commit/0458588bc9669d2e53e60a006b7949cf01ba3b4c))
* 记忆系统增强——AGENTS.md 项目记忆文件 + 存量归并 ([c3d824a](https://github.com/Syotick/nova-agent/commit/c3d824ad76668ef23acf1ee5dfda21d3926c7f5f))


### 🐛 修复

* file-ops 技能去掉本机写死路径（改为工作区通用描述） ([595614d](https://github.com/Syotick/nova-agent/commit/595614d7b354cdf4c4182192ee68b347b7d5de00))
* run_command 在执行前确保目标目录存在（CI 全新 clone 无 workspace 导致 spawn 失败） ([4a8fda4](https://github.com/Syotick/nova-agent/commit/4a8fda482ce9494436b5ad96112fec3ac3d210e9))
* workspace 测试平台无关化（CI Linux 失败：Windows 反斜杠/盘符断言不跨平台） ([0e4a2c1](https://github.com/Syotick/nova-agent/commit/0e4a2c16f0daf16241a7347dc9451a79277d057c))
* 前端流式展示——新增思考计时，移除蓝色打字光标 ([1cfc552](https://github.com/Syotick/nova-agent/commit/1cfc55272d8738545b681073e8cdb9205f8687d3))
* 工作区选择移到输入框工具栏（对话框旁边），移除顶部条 ([e08c12f](https://github.com/Syotick/nova-agent/commit/e08c12fdbd59e352372e2fbc688f06eb14aa20d4))


### 📄 文档

* **teaching:** 教学资产升级——课程地图 + 练习册/答案分册 + 术语总表 + Mermaid 图 + 读完自查 ([2c8b1f7](https://github.com/Syotick/nova-agent/commit/2c8b1f7ba11560bd08f75203fe7c70e80d87ee32))
* 仓库主页改为中文优先——根 README 中文完整版，英文版迁移至 docs/README.en.md ([84c9def](https://github.com/Syotick/nova-agent/commit/84c9deffd9f235e63a9ed4e9b0967dd34ad8ba26))
* 指南目录 06 描述错字修正 ([e00105a](https://github.com/Syotick/nova-agent/commit/e00105a506a922ca708550369c3a6e9dc4d52574))
* 校正英文 README 步骤上限表述（默认 24 步，NOVA_AGENT_MAX_STEPS 可调） ([75023c4](https://github.com/Syotick/nova-agent/commit/75023c454d6cdb069516ef4bfad1fdc3dfa9fd4e))
* 精简 README 首屏文案 ([cdfe310](https://github.com/Syotick/nova-agent/commit/cdfe310f7c36a023423ca919c94fe9c4d531876f))
* 精简 subagent 注释 ([81fb6cb](https://github.com/Syotick/nova-agent/commit/81fb6cba7175d225b1273b4773743b3f2b0dced3))
* 精简 vibe 引擎注释 ([d97860f](https://github.com/Syotick/nova-agent/commit/d97860f4a78f319c82426fdb8d522ddfb9afe7a3))
* 读代码指南 01/02——Agent Loop 走读（含术语速查）+ MCP 客户端走读 ([5e8d5a5](https://github.com/Syotick/nova-agent/commit/5e8d5a5fa1efaac1b0dbfeb3ec9137e9d0552d59))
* 读代码指南 03——run_command 终端工具走读（进程生命周期 + Windows 平台坑） ([ddf0079](https://github.com/Syotick/nova-agent/commit/ddf00791e521e53eb6bac5cd49dba399a2e9ad5e))
* 读代码指南 04——技能系统走读（SKILL.md 两级加载 + 目录即安装） ([b70a125](https://github.com/Syotick/nova-agent/commit/b70a1257436d16222e5cec8361874583bb91bdd4))
* 读代码指南 05——跨会话记忆走读（去重合并 + LRU + 词面子串检索） ([04d9249](https://github.com/Syotick/nova-agent/commit/04d92493119fafcca56d9b040bd3de714598b4a0))
* 读代码指南 06——上下文压缩走读（真实计数优先 + 双触发兜底） ([33cfcea](https://github.com/Syotick/nova-agent/commit/33cfcea402be01f5a3ad5b9cc3ce838d7258d8ab))
* 读代码指南 07——工作区走读（权限边界 + 占位符联动 + 危险目标拒绝） ([9c349bc](https://github.com/Syotick/nova-agent/commit/9c349bc7029705874622c83df1a36be5fbbaf9db))
* 读代码指南 08（完结）——Vibe 自治循环走读 + 全系列收尾地图 ([201a529](https://github.com/Syotick/nova-agent/commit/201a5298054294b48830d451ef268a834ef8b5a5))
* 读代码指南第 01 篇——Agent Loop 代码走读 ([bf9a31e](https://github.com/Syotick/nova-agent/commit/bf9a31ed970fb461db8ca211b7e7edfc0387d540))


### 🔧 其他

* add start.bat launcher (Node version check + auto install + start) ([0115375](https://github.com/Syotick/nova-agent/commit/01153755734318e8e3519910247ea695356b2c99))
* **meta:** README 加徽章 + 新增社交预览图（1280x640 banner） ([705cef1](https://github.com/Syotick/nova-agent/commit/705cef1c525fb0ed5405a5309c2c633600dde316))
* re-run CI ([c719e8b](https://github.com/Syotick/nova-agent/commit/c719e8b971134c3c9ca5cff738efc23e6e6ffcde))
* 开源准备——author 换 GitHub 隐私邮箱，移除 private 标记 ([a907eac](https://github.com/Syotick/nova-agent/commit/a907eac2fbbf2a19a85697584c7728dfb78229a3))


### 🧪 测试

* web_search 回退 curl 用例改为 mock child_process，去除真实网络依赖 ([7a4afaa](https://github.com/Syotick/nova-agent/commit/7a4afaa74046f340acd77ced03e3c4d04fe6948b))

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
