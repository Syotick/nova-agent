# 📚 Nova Agent 文档中心

> 面向**使用者与开源社区**的公开文档。
> 开发者内部的学习/维护文档（教程、架构、故障手册）保存在本地 `devdocs/` 目录，不随仓库发布。

## 公开文档索引

| 文档 | 内容 |
|---|---|
| [README.zh-CN.md](./README.zh-CN.md) | 项目中文说明（对应根目录英文 README） |
| [TECH-DECISION.md](./TECH-DECISION.md) | 技术选型调研：为什么不用 LangChain 系框架 |
| [CICD-RESEARCH.md](./CICD-RESEARCH.md) | 大公司 CI/CD 与项目管理实践调研 + 落地清单 |

## 与根目录的关系

```
nova-agent/
├─ README.md              ← GitHub 首页展示（英文）
├─ LICENSE / CONTRIBUTING.md
├─ docs/                  ← 公开文档（本目录）
├─ src/ + server/         ← 项目本体
├─ skills/ + mcp-servers/ ← 可扩展内容
└─ data/ + workspace/     ← 运行时数据（gitignored）
```

## 文档维护约定

- 新增功能 → 更新根 README 功能清单
- 技术决策 → 更新 `TECH-DECISION.md`
- 工程实践变化 → 更新 `CICD-RESEARCH.md` 的落地清单
