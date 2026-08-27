# 代码走读 04：技能系统 —— SKILL.md 两级加载，加技能=丢文件夹

> agent 会读文件、跑命令了，但它是"通用白板"——不懂领域套路。
> 技能（Skill）就是给它的"领域操作手册"：`skills/<名字>/SKILL.md` 一个文件夹 = 一本手册，agent 勾上的就照着干。
> 文件：`server/skills.ts`（约 96 行）——扫描、解析、注入、增删改。
> 建议顺序：先读 01，再读这篇。

## 0. 术语速查

| 名词 | 大白话 |
|---|---|
| **Skill（技能）** | 一份"操作手册"：教 agent 特定场景怎么干活（比如"怎么用浏览器操作"）。比一句话提示词强在：结构化、可复用、可分享 |
| **SKILL.md** | 技能的文件格式（[Agent Skills 规范](https://www.anthropic.com/engineering/effective-skills-for-claude-code)，Claude Code / Cursor 都用）。每个技能一个 `SKILL.md` 文件 |
| **frontmatter（前置元数据）** | 文件最顶部 `---` 包住的一段键值信息（如 `name:` / `description:` / `when_to_use:`），相当于技能的"身份证" |
| **system prompt（系统提示词）** | 每次对话开始给模型的"总纲"（01 篇讲过）。技能正文最终就是拼进这里，模型才"看到"手册 |
| **when_to_use（使用时机）** | 告诉模型"这个技能什么时候该用"。写在 frontmatter 里，模型据此判断是否调用 |
| **两级加载** | 第一级：扫描得到技能"目录页"（名字+简介+时机，几行字）；第二级：模型决定用哪个 → 才把该技能正文全文注入 prompt。**不用的技能不占 token** |
| **目录即安装（drop-in）** | 加一个技能 = 往 `skills/` 丢一个文件夹。不需要写代码、不需要注册，扫到就有 |
| **YAML** | 一种简单的配置文件格式（`键: 值`）。frontmatter 用的是它的极小子集 |
| **路径穿越（path traversal）** | 攻击手段：往路径里塞 `..` 或 `/`，想读写"规定目录之外"的文件。安全代码必须拦这个 |
| **白名单校验（whitelist）** | 只允许"明确允许"的值通过（这里是：只认字母数字中文连字符），比黑名单安全 |

---

## 1. 它在架构里的位置

```mermaid
flowchart TD
  LOAD["loadSkills()<br/>扫 skills/*/SKILL.md → 技能列表（目录页）"] --> UI["技能管理页"]
  UI -->|saveSkill / deleteSkill| FILE["skills/<id>/SKILL.md 文件"]
  FILE -->|扫描| LOAD
  AGENT["agent（勾选 skillIds）"] --> INJ["injectSkills(agent.skillIds)<br/>拼进 system prompt（agentLoop 01 篇调用）"]
  INJ --> AGENT
  UI -->|表单 → 生成| FILE
```

`agentLoop.ts` 里只有一行用它：
```ts
const system = `${agent.persona}\n${injectSkills(agent.skillIds)}${summaryBlock}...`
```
这行就是"把用户给这个 agent 勾选的技能手册，塞进它的总纲"。

---

## 2. 文件结构（先看"配置即文件"长什么样）

```
skills/
 ├─ browser-ops/SKILL.md   ← 浏览器操作手册
 └─ file-ops/SKILL.md      ← 文件操作手册
```

一个 `SKILL.md` 长这样（`skills/browser-ops/SKILL.md` 摘录）：

```markdown
---
name: 浏览器操作专家
description: 当用户要求打开网页、搜索、截图、操作浏览器时使用
when_to_use: 打开 URL、网页搜索、页面截图、点击/填写表单、读取页面内容
---
你是浏览器操作专家。使用 Playwright MCP 工具完成网页任务：
1. 打开网页：使用 browser_navigate 工具...
```

`---` 之间是**身份证**（frontmatter），`---` 之后是**正文**（操作手册）。
一个文件夹就是一个技能——**这是"加功能不用写代码"的极致**：往项目里丢个文件夹，模型就有了新本事。

---

## 3. 解析：parseFrontmatter（L14-24）——极简 YAML，够用主义

```ts
function parseFrontmatter(raw: string): { meta: Frontmatter; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)   // 抓两个 --- 之间的内容 + 之后的正文
  ...
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/)            // 每行 "key: value"
    meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '')            // 剥掉值的引号
  }
  ...
}
```

**两个设计点**：
1. **手写解析、不引 YAML 库**——frontmatter 只需要"单行 `键: 值`"这一种子集，一个正则搞定。这是项目的一贯哲学：**够用就不加依赖**（对比不少项目为解析 frontmatter 就拉一个库）。
2. 拿不到 `---` 就整篇当正文（`.match` 失败 → `{ meta: {}, body: raw }`）——**容错**：没有元数据的文件也不会崩，还能用。

---

## 4. 扫描：loadSkills（L26-44）

```ts
for (const dir of readdirSync(SKILLS_ROOT, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue                        // 只要目录
  const skillPath = join(SKILLS_ROOT, dir.name, 'SKILL.md')
  if (!existsSync(skillPath)) continue                    // 目录里没有 SKILL.md 就跳过
  ...parse 后压进 skills 数组
}
```

**"目录即安装"就是这么实现的**：扫 `skills/` 下所有目录，里面有 `SKILL.md` 就认作一个技能。
丢文件夹 → 下次扫描就有；删文件夹 → 就没有。**零注册、零数据库**。

---

## 5. 注入：injectSkills（L50-58）——省 token 的关键

```ts
export function injectSkills(skillIds: string[]): string {
  if (!skillIds.length) return ''                        // 没勾技能，一分钱不花
  const parts = skillIds
    .map((id) => getSkill(id))                           // 只取"这个 agent 勾选的"
    .filter(...)
    .map((s) => `## Skill: ${s.name}\n(使用时机: ...)\n${s.content}`)  // 正文全文进 prompt
  return `\n\n# 可用技能（按需使用）\n\n${parts.join('\n\n')}`
}
```

**为什么要"两级"**：技能可能很多，全塞进 system prompt 会撑爆 token。所以：
- **agent 勾选**才注入（`agent.skillIds`）
- 注入时还带上 **when_to_use**，让模型自己判断"这技能现在用不用"
- 不勾选的技能**完全不进 prompt**（省 token）

这就是"给能力"和"烧 token"之间的平衡：**能力上得起，成本控得住**。

---

## 6. 增删改：saveSkill / deleteSkill（L74-96）——可视化编辑器的底层

技能管理页的"＋ 新建技能"背后就是这两个函数：

```ts
saveSkill(input): SkillMeta
  // id = 用户给的或 safeId(input.name)（名字转安全目录名）
  // mkdir skills/<id>/ → writeFileSync SKILL.md（renderSkillFile 生成标准格式）
  //   ——所见即所得：表单填的东西 → 一个标准 SKILL.md 文件

deleteSkill(id): boolean
  // 防路径穿越：id 只认 [字母数字中文连字符]，塞 .. / \ 直接拒绝 → rmSync 整个目录
```

`safeId`（L61）：把"浏览器操作专家"变成 `浏览器操作专家`（中文保留）、把"my skill!"变成 `my-skill`——**目录名要安全**。

`renderSkillFile`（L66）+ `parseFrontmatter`（读）正好是**读写对称**：程序生成的文件，下次扫描也能读回来，不会坏。

`deleteSkill` 里那道**白名单校验**（L91）是教学重点：
```ts
if (!/^[\w\u4e00-\u9fa5-]+$/.test(id)) return false
```
因为 `id` 直接拼进文件路径（`join(SKILLS_ROOT, id)`），如果允许 `../` 或 `/`，就能删到工作区外任意目录——**凡是"用户输入拼进路径"，第一件事就是白名单**。这是本文件最该学的一行。

---

## 7. 名词复盘 + 动手建议

**一句话记牢**：Skill = 一个文件夹 + SKILL.md（身份证 + 操作手册）；两级加载让"能力上得起、token 控得住"；新增就是丢个文件夹。

动手做：
1. **页面上建一个**：技能管理 → ＋ → 填个"写周报"技能 → 保存 → 去 `skills/` 看生成的 SKILL.md（对得上 `renderSkillFile` 的格式）。
2. **手工丢一个**：新建 `skills/demo/SKILL.md` 写两三行（name/description/when_to_use + 正文）→ 刷新页面——技能列表立刻出现，不用重启。这就是"目录即安装"。
3. **看两级加载**：给 agent 勾上 demo 技能 vs 不勾，各发一句聊天，对比后端生成提示词（或感受回答差异）——体会有没有注入的区别。
4. **试路径穿越**：在删除接口用 `id="../xxx"` 试一下——会被白名单拦（返回 false），这正是安全校验的意义。

---

## ✅ 读完自查（你能做到吗）

- [ ] 能自己写一个 `skills/<名字>/SKILL.md`（frontmatter + 正文）并让 agent 生效（目录即安装）
- [ ] 能解释"两级加载"如何省 token：不勾选的技能完全不进 prompt，勾选才注入全文
- [ ] 能指出 `deleteSkill` 那行白名单校验为什么必要（用户输入拼进路径的第一道防线）
- [ ] 能说清 frontmatter 的 `when_to_use` 是干嘛的（让模型判断这技能现在用不用）
- [ ] 动手：从技能管理页建一个技能，再去 `skills/` 看生成的 SKILL.md 与你填的表单一一对应

> 卡住了？回头读对应小节；做完这 5 条再进 [练习册 04](../exercises/04-skills.md)。


## 附：关联地图

```
skills.ts（本篇：技能系统）
 ├── agentLoop.ts → injectSkills（塞进 system prompt）
 ├── types.ts     → SkillMeta（id/name/description/whenToUse/content）
 ├── server/routes/... → 技能管理页 CRUD（走 saveSkill/deleteSkill）
 └── skills/      目录 ← 用户的技能（文件即配置）
```

下一篇（05）建议：`server/memory.ts` —— 跨会话记忆：LRU + 去重合并，模型怎么"记得你"。
