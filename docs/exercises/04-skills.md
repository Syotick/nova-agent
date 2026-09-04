# 练习册 04：技能系统

> 读完 [指南 04](../guide/04-skills.md) + 代码 `server/skills.ts` 后完成。规则：先自己动手，做完再对答案（答案在 [answers/04-skills.md](answers/04-skills.md)，别偷看）。

## 🎯 本课练习目标

- 能手写一个 SKILL.md 并让它生效（目录即安装）
- 能解释"目录 + load_skill 按需加载"如何省 token
- 能说出删除技能那行白名单校验为什么必要

---

## ✍️ 练习

### 练习 1：读代码——parseFrontmatter（入门）

**目标**：理解极简 YAML 解析怎么实现。

**步骤**：

1. 读 `server/skills.ts` 的 `parseFrontmatter`。
2. 回答：正则 `^---\n([\s\S]*?)\n---` 抓的是什么？如果文件里没有 `---` 会怎样？
3. 追问：`kv[2].replace(/^["']|["']$/g, "")` 在干嘛？

**预期结果（自检）**：能说出正则抓"两个 --- 之间的元数据 + 之后的正文"；没有 `---` 时整篇当正文（容错）；replace 是剥掉值两侧的引号。

**提示**：`[\s\S]` 是"包括换行在内的任意字符"（`.` 不匹配换行，所以要用它）。

---

### 练习 2：写一个自己的 SKILL.md（进阶）

**目标**：亲手完成"目录即安装"。

**步骤**：

1. 新建 `skills/demo/SKILL.md`，写一个两三行的技能（frontmatter：name / description / when_to_use + 一段正文），比如"周报专家：把聊天记录整理成周报"。
2. 刷新技能页：`demo` 出现（不用重启）。
3. 给某个 agent 勾上它，随便聊一句，确认技能正文进了 system prompt（可对比勾与不勾的回答差异）。

**预期结果（自检）**：技能列表出现 `demo`；勾选的 agent 行为受正文影响（如按"周报专家"的口吻回答）。

**提示**：frontmatter 必须是文件**最顶部** `---` 开头；正文就是给模型的"操作手册"。

---

### 练习 3：目录 + 按需加载省 token（进阶）

**目标**：验证"system 只进目录几行，正文由 load_skill 按需取"。

**步骤**：

1. 读 `skillCatalog` 与 `loadSkillContent`（`server/skills.ts`），以及 `toolRegistry.ts` 里 `load_skill` 工具（注意它的 `when:` 条件装配）。
2. 回答：一个 agent 有 10 个技能、只勾 2 个，system prompt 里会进去多少内容？模型要用某技能时怎么做？
3. 临时给 `skillCatalog` 加一行 `console.log`，输出它拼出的字符串——对比"勾 2 个 vs 全勾"，验证目录长度几乎不变（都是几行），而正文根本不在里面。

**预期结果（自检）**：答出"只进目录（每技能一行名字+描述+时机），正文不在 system 里；模型要用时调 `load_skill` 按名取全文"；日志确认目录不随技能多少爆炸。

**提示**：`agent.skillIds` 是"这个 agent 勾选的"清单；`load_skill` 只在勾选过技能时才注册（`when: agent.skillIds.length > 0`）。

---

### 练习 4：白名单校验（挑战）

**目标**：理解"用户输入拼进路径"必须白名单。

**步骤**：

1. 读 `deleteSkill` 里的 `if (!/^[\w\u4e00-\u9fa5-]+$/.test(id)) return false`。
2. 构造攻击：如果注释掉这行校验，向删除接口传 `id="../../xxx"` 会发生什么？（读代码推理，不要真删）
3. 追问：`\.\.`（相对上级）和 `/`（路径分隔）为什么必须被拒？

**预期结果（自检）**：能说出 `join(SKILLS_ROOT, "../../xxx")` 会拼出工作区外路径，`rmSync(dir, { recursive: true, force: true })` 就会删到那里去——这是路径穿越攻击。

**提示**：id 直接拼进文件路径，白名单是"只认安全字符"的第一道防线，比黑名单（挡 `..`）更稳。

---

## 🔑 答案

见 [答案分册](answers/04-skills.md)。先做再看。
