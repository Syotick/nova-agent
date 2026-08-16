# 📚 Nova Agent 文档中心

> 面向**开发者与维护者**的文档。想快速跑起来请先看 [DEVELOPMENT.md](./DEVELOPMENT.md)。

## 文档索引

| 文档 | 内容 | 适合谁 |
|---|---|---|
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 从零开始：装 Node.js → 跑起来 → 改代码 → 提交（零基础友好） | 新开发者 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构大白话详解：数据流、四个核心概念、目录地图、安全设计 | 想理解项目的人 |
| [CHANGELOG.md](./CHANGELOG.md) | 变更记录（人读中文版，按版本归档） | 所有人 |
| [README.zh-CN.md](./README.zh-CN.md) | 项目中文说明（对应根目录英文 README） | 中文读者 |
| [TECH-DECISION.md](./TECH-DECISION.md) | 技术选型调研：为什么不用 LangChain 系框架 | 架构评审 |
| [CICD-RESEARCH.md](./CICD-RESEARCH.md) | 大公司 CI/CD 与项目管理实践调研 + 落地清单 | DevOps 关注者 |

## 与根目录的关系

```
nova-agent/
├─ README.md        ← GitHub 首页展示（英文，面向使用者/星标者）
├─ LICENSE          ← MIT 开源协议
├─ CONTRIBUTING.md  ← 贡献指南（提交规范/PR 流程）
└─ docs/            ← 开发者文档（本目录）
```

> 原则：**根目录只放给 GitHub 看的（README/许可证/贡献指南），开发者的东西都在 docs/**。

## 目录约定（对齐主流开源项目）

- 项目本体代码：`src/`（前端）+ `server/`（后端）
- 可扩展内容：`skills/`（技能）、`mcp-servers/`（工具配置，JSON）
- 运行时数据：`data/`（SQLite）、`workspace/`（Agent 工作区）——**不入库**（见根 .gitignore）
- 工程配置：`package.json`、`tsconfig.json`、`vite.config.ts`、`release-please-config.json` 在根
- CI/CD：`.github/workflows/`

## 文档维护约定

- 新增功能 → 更新 `CHANGELOG.md`（人读版）+ README 功能清单
- 架构变化 → 更新 `ARCHITECTURE.md` 的目录地图与数据流
- 新接口 → 更新对应 README 的 API 表格与 `DEVELOPMENT.md` 教程
