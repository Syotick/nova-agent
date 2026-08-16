# Contributing to Nova Agent

感谢你愿意参与贡献！本项目遵循 [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)：`main` 单主分支 + 短命特性分支 + PR 合并。

## 开发环境

```bash
npm install
npm run dev        # 前端 5173 + 后端 8787
```

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

| 类型 | 用途 |
|---|---|
| `feat:` | 新功能 |
| `fix:` | Bug 修复 |
| `refactor:` | 重构（无行为变化） |
| `chore:` | 构建/工具/依赖 |
| `docs:` | 文档 |
| `test:` | 测试 |

## 提交前检查

```bash
npx tsc --noEmit   # 服务端类型检查
npm run build      # 前端构建
```

CI 会在 PR 上自动运行同样的检查，必须通过才能合并。

## PR 流程

1. 从 `main` 切短命分支（`feat/xxx`、`fix/xxx`）
2. 小步提交，PR 尽量小、聚焦一件事
3. 提交 PR 时使用模板，说明改动、动机与验证方式
4. 等待 CI 通过 + 至少 1 个 review

## 版本与发布

- 遵循 [SemVer](https://semver.org/)；破坏性变更 bump major、新功能 minor、修复 patch
- Release 由维护者从 `main` 打 tag 发布
