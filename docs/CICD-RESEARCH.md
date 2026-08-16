# CI/CD 与软件项目管理最佳实践（成熟大公司调研）

> 面向 Node.js + Vue 开源项目的 DevOps 与工程管理落地研究。
> 调研对象：Google / Netflix / Spotify / Shopify / Stripe / GitHub 生态（公开资料多轮交叉验证）。

---

## 一、CI/CD 核心实践

### 1. Trunk-based Development 与分支策略

Google（《Software Engineering at Google》）明确反对长期特性分支：几乎所有代码直接向主干提交，任何偏离主干的长期分支都是"异常状态"——「分支合并有风险，长期不合并的分支加剧不稳定」。

- **Google trunk-based**：分支管理章节（[链接](https://github.com/findxyz/qiangmzsx-Software-Engineering-at-Google/blob/main/zh-cn/Chapter-16_Version_Control_and_Branch_Management/Chapter-16_Version_Control_and_Branch_Management.md)）
- **GitHub Flow**（main + 短命特性分支 + PR）：在重构/发布行为上与 trunk-based 一致，更适合开源协作（[对比](https://www.harness.io/blog/github-flow-vs-git-flow-whats-the-difference)）
- **GitFlow**（长期 develop/release 分支）：适合"发布车"节奏的传统模式，多分支、多合并冲突（[分支策略白皮书](https://rdkcentral.github.io/rdk-halif-aidl/0.11.0/whitepapers/branching_strategies/)）

### 2. CI 时间预算与延迟

- Google 核心原则：构建与测试必须快到"立刻验证刚写的改动"，即时反馈是关键差异 → CI 需**分钟级**完成（[持续集成章节](https://raw.githubusercontent.com/cutedogspark/Software-Engineering-at-Google/main/zh-cn/Chapter-23_Continuous_Integration/Chapter-23_Continuous_Integration.md)）
- 社区共识：**10 分钟内的 CI 是可用阈值**（[HN 讨论](https://news.ycombinator.com/item?id=32717487)）
- Stripe：5000 万行 Ruby monorepo 用**选择性测试执行**（只跑受影响代码的测试）显著提速（[Stripe blog](https://stripe.dev/blog/selective-test-execution-at-stripe-fast-ci-for-a-50m-line-ruby-monorepo.md)）

### 3. 发布频率与持续部署

- **Netflix**：持续部署闻名，构建管线自动完成从提交到生产的大部分步骤，测试由"质量守卫者"把关（[如何构建代码](https://netflixtechblog.com/how-we-build-code-at-netflix-c5d9bd727f15)）
- **Spotify**：每周向 6.75 亿用户发布。做法：**分阶段发布（phased rollout）** + 小步回滚 + **特性开关（feature flag）** + canary（[发布幕后](https://www.engineering.atspotify.com/2025/4/how-we-release-the-spotify-app-part-1)、[术语表](https://confidence.spotify.com/glossary/phased-rollout)）
- **Shopify**：1000+ 开发者靠 **merge queue** 解决合并（排队、基于主干最新状态重新 base、自动处理冲突），强调**小批量 PR** 与 PR 纪律（[merge queue](https://shopify.engineering/introducing-the-merge-queue)、[PR 纪律](https://shopify.engineering/on-the-importance-of-pull-request-discipline)、[1000+ 开发者合并](https://shopify.engineering/successfully-merging-work-1000-developers)）

### 4. GitHub Actions 最佳实践

- **缓存**：缓存 npm 依赖安装产物，显著减少安装时间
- **矩阵构建（matrix）**：多 Node 版本/多平台并行
- **并发控制（concurrency）**：分组取消重复/过期 job，防资源浪费与竞态
- **secrets**：只放 CI 环境变量，不在日志/代码中明文
- 大仓库按路径过滤（path filter）触发 job，避免全量跑

（[GitHub 官方最佳实践](https://github.com/github/awesome-copilot/blob/main/instructions/github-actions-ci-cd-best-practices.instructions.md)、[大型 monorepo Actions 讨论](https://github.com/orgs/community/discussions/187543)）

---

## 二、代码质量门禁与 PR 流程

### lint / typecheck / 测试在 CI 中的角色

大公司共同模式：**所有静态检查与测试在 CI 中强制运行，作为合并门禁（blocking）**，而非口头自觉。快反馈（分钟级）是关键——越早发现，修复成本越低。

### PR Review 文化

- **Google Code Review 指南**：diff 越小越好、reviewer 快速响应、把 review 当作"改进高于完美"（improvement over perfection）（[解读](https://dev.to/kanywst/the-essence-of-google-style-code-review-a-culture-of-improvement-over-perfection-566f)、[中文解读](https://developer.aliyun.com/article/834801)）
- **Shopify**：小 PR 纪律 + code review 是团队"超能力"（[great code reviews](https://shopify.engineering/great-code-reviews)）
- **CODEOWNERS + 分支保护**：按文件路径自动指派 reviewer，强制 owner 批准才能合并（[微软治理教程](https://learn.microsoft.com/zh-cn/training/modules/governance-guardrails-operations/3-enforce-governance-github-controls)）

### Conventional Commits 与 SemVer

- 强制 `feat:/fix:/breaking` 提交格式，由工具（`semantic-release`、Google 开源 `release-please`）**自动解析 commit → 决定 semver → 生成 changelog → 打 tag / 发布**，完全自动化（[速查](https://github.com/khasky/awesome-commit-conventions)、[release-please ADR](https://azure.github.io/osdu-spi/adr/004-release-please-versioning/)）
- SemVer 策略：破坏性变更 bump major、新功能 minor、bugfix patch；由 CI 在合并后自动推进，避免人工判断

---

## 三、项目管理流程

### Scrum vs Kanban

行业共识（多源交叉验证）：
- **Scrum**：固定迭代 + 仪式（planning/retro），适合需求节奏稳定的团队
- **Kanban**：无固定迭代、限制 WIP、价值流连续流动，更适合维护型/持续交付/需求不确定的团队——很多工程团队实际更接近 Kanban 或混合
- 选择依据是**团队成熟度**，而非教条

（[Larksuite 对比](https://www.larksuite.com/en_us/blog/scrum-vs-kanban)、[Mendix 选择指南](https://www.mendix.com/blog/kanban-vs-scrum/)、[团队成熟度决定方法](https://blog.csdn.net/innopmaster/article/details/157910363)）

### 分层管理实操

- **Issue 分类与 triage**：labels（bug / enhancement / help wanted / good first issue）+ 定期 triage
- **Milestone**：发布分组，将 issue 关联到里程碑，形成版本范围 road map
- **GitHub Projects 看板**：To do / In progress / Review / Done 状态流转
- 小团队建议：**从 Kanban 看板入手，限制 WIP，不强制 sprint ceremony**——比僵化跑 Scrum 更贴合"小团队想规范"的需求

---

## 四、开源项目特有实践

### maintainer 的 CI

- 所有 PR 自动跑 lint/typecheck/test 作为"能合并"的最低门槛
- **依赖更新自动化**：Dependabot 或 Renovate 定期开升级 PR；避免 **PR 疲劳**——批量/窗口化聚合，major 单独处理，依赖 PR 自动过 CI 否则打回；Renovate 在批量/调度上更强（[防疲劳策略](https://safeguard.sh/resources/blog/dependency-update-automation-strategies)、[triage 策略](https://safeguard.sh/resources/blog/dependency-update-triage-strategy-engineering-teams)）

### 社区贡献流程

- **CONTRIBUTING.md**：构建/测试/提交（commit 与 branch 规范）/PR 提交流程
- **issue template + PR template**：结构化信息；issue 标 `good first issue` / `help wanted`
- **CODEOWNERS**：自动为改特定目录的 PR 指派维护者
- 私有开源建议加 CODE_OF_CONDUCT，降低外部协作摩擦（[实操示例](https://github.com/spacialglaciercom-lab/rmp.ca/commit/486cfed4d04d67ea5232489d6be70c8cd9977898)）

### 发布 Checklist

用**自动化发布（semantic-release / release-please）**替代手工 checklist：commit → bump version → changelog → tag → publish → 通知。人工只保留无法自动化的部分（安全审计、破坏性变更确认）。

---

## 五、落地建议清单（按优先级）

| # | 实践 | 对应来源 | 状态 |
|---|---|---|---|
| 1 | **Trunk 化**：main 单主分支 + GitHub Flow 短命特性分支 | 一·1 | ✅ 已落地 |
| 2 | **CI 质量门禁**：PR 强制 `npm ci → typecheck → build`，concurrency 取消过期 job，Node matrix | 一·2/4、二 | ✅ 已落地（matrix 待加） |
| 3 | **Conventional Commits + 语义化发布**：release-please 自动 bump/changelog/tag | 二·3 | ⏳ 待做 |
| 4 | **CODEOWNERS + 分支保护**：≥1 review + CI 通过才能合并 | 二·2 | ⏳ 开源后启用 |
| 5 | **依赖自动化更新**：Renovate/Dependabot，PR 由 CI 验证 | 四·1 | ⏳ 开源后启用 |
| 6 | **贡献规范**：CONTRIBUTING + issue/PR 模板 + CODE_OF_CONDUCT | 四·2 | ✅ 已落地（COC 待补） |
| 7 | **Kanban 看板 + Milestone**：GitHub Projects + labels 分类 | 三 | ⏳ 开源后启用 |
| 8 | **分阶段发布 + 特性开关**：canary/灰度 + feature flag 回滚 | 一·3 | ⏳ 有真实用户后 |
