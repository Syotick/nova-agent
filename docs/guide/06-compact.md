# 代码走读 06：上下文压缩 —— 长对话不爆，全靠它兜底

> 聊得越长，发给模型的历史越多：烧钱、变慢、甚至超出模型的"上下文窗口"直接报错。
> 成熟产品（Claude Code 这类）的做法是：接近上限时，用模型把旧历史"总结成摘要"顶上去。
> 这篇讲 `server/compact.ts`（约 125 行）——什么时候压、怎么算占用、怎么压。
> 建议顺序：01 → 01 里的"压缩前置"那段 → 这篇。

## 0. 术语速查

| 名词 | 大白话 |
|---|---|
| **上下文窗口（context window）** | 模型一次能"看见"的最大 token 数。超了会被截断或报错。主流模型 1M = 100 万个 token（约几十万汉字） |
| **token** | 模型读写文本的计数单位（01 篇讲过）。上下文窗口、计费都以它计 |
| **上下文占用（context usage）** | 当前这一轮发给模型的总 token 数（历史 + 新消息）。接近窗口上限就该处理 |
| **真实计数 vs 估算** | 真实计数＝API 返回的实际 token 数（准）；估算＝按字符数猜（不太准但免费）。能用真实的不估，估不着的才估 |
| **压缩（compaction）** | 把"较早的一批消息"交给模型，让它总结成一段摘要，替代掉那批原文——腾出上下文空间 |
| **摘要（summary）** | 压缩的产物：一段保留"目标/关键事实/完成/待办"的浓缩文本 |
| **阈值（threshold）** | 触发压缩的门槛（如"占用超窗口 90%"或"消息超 40 条"） |
| **兜底（fallback）** | 主方案没戏时的保底。这里"消息数 40 条"就是"token 感知"之外的保守兜底 |
| **percent（百分比）** | 压缩阈值按"占窗口的百分之多少"算（默认 90%）——成熟项目做法（Claude Code 默认 ~95%） |
| **generateText** | AI SDK 的一次性生成（不像 streamText 是流式）：要一段文字就用它 |
| **双条件触发** | "消息数超限 **或** 占用超百分比" 任一成立就压——两层保险 |

---

## 1. 它在架构里的位置

```
用户发消息
  │  agentLoop.runTurn（01 篇）
  ▼
  shouldCompact(session, agent.model)   ← 本篇：要不要压？
  ├─ true → compactSession() → LLM 总结旧历史 → session.summary
  │          （摘要不进消息列表，agentLoop 在拼 system prompt 时注入 summaryBlock）
  └─ false → 直接跑
```

**压缩和记忆是两回事**（别混）：
- **记忆**（05 篇）：跨会话长期事实，存独立表，常驻
- **压缩摘要**：本会话早期历史的浓缩，临时顶替旧消息，跟着这个 session 走

---

## 2. 三个参数，两套保险（L7-13）

```ts
COMPACT_MIN_MESSAGES = 40   // 消息数兜底：超过 40 条就压
COMPACT_KEEP        = 20    // 压完保留最近 20 条（更早的进摘要）
COMPACT_PCT         = 90    // 占用超窗口 90% 就压（可 NOVA_AGENT_COMPACT_PCT 覆盖）
```

触发逻辑（L101-106）：
```ts
export function shouldCompact(session, model?): boolean {
  if (session.messages.length > COMPACT_MIN_MESSAGES) return true   // 保险①：条数兜底（保守，无 token 时也能兜）
  if (!model || !session.messages.length) return false
  const window = contextWindowFor(model)
  return contextUsage(session.messages) > (window * COMPACT_PCT) / 100  // 保险②：token 占用（精确，主方案）
}
```

**为什么双重**：token 感知是"精确体温计"，但有些消息没 token 记录（早期数据、用户输入），体温计失灵时——**消息条数兜底**保证"聊到 41 条无论如何都会压一次"。成熟项目这也正是标配：**百分比阈值为主 + 条数为保守兜底**。

---

## 3. 占用怎么算：真实计数优先（L18-46）

```ts
export function contextUsage(messages) {
  // 找最后一条"带真实 input count"的 assistant 消息
  // 它记录的是"那一次请求的完整输入 token 数"——API 真值，已包含全部历史
  // 以它为基准，再加它之后新消息的估算
  ...
}
```

**关键洞察**：每轮对话，API 返回的 `input_tokens` 是"这次送进去的完整 token 数"（**已经包含所有历史**）。
所以**不要傻傻把每条消息的 token 加起来**（会重复计）——而是拿最近一次的真值当基准，只对"之后新增的"做补充估算。这是"成熟项目做法"的核心：**能用真实计数的，绝不用累加猜测**。

补估算用 `estimateTokens`（L38-46）：
```ts
// 中文约 0.7 token/字，其他约 0.25 token/字符
return Math.ceil(cn * 0.7 + other / 4)
```
中文稠密（一个字约零点几个 token），英文稀疏（四个字符约一个 token）——这是经验近似，够用。

**窗口兜底**（L49-59）：注册表里配的窗口万一坏了（0/负数/非数字），`sanitizeContextWindow` 一把拉回缺省 1M，防止进度条/压缩阈值算出畸形值。**防御性编程**：不是不会出问题，而是出了问题也不炸。

---

## 4. 压成什么样：summarizeMessages（L68-98）

压缩 = 用一次 LLM 调用，把旧历史变成一段摘要。三步：

**① 拼"对话文本"**（L70-83）——旧消息变成给模型的输入：
```ts
## 用户
……内容……
  - 调用了工具 web_search（失败）

## 助手
……回复……
```
- 工具调用细节**只保留一个名字 + 成败**（L74-79）——"机械细节省略，关键结果保留"，省 token
- 整段截断到 30000 字符（L83）——**防止喂给摘要模型的本身超上下文**

**② 结构化指令**（L87-92）——给助手（摘要模型）的"考试要求"：
```
保留：用户目标与需求、关键事实/决定、已完成工作、未完成或待办、重要数据与结论
省略：寒暄、重复、工具调用的机械细节
总长度 ≤ 2000 字符；以"对话摘要："开头；直接输出正文，不要解释
```
**写出"保留什么、省略什么"** 是关键——摘要模型不是随便概括，是照着这份"审计清单"干活。

**③ 生成 + 长度保险**（L85-97）：
```ts
const { text } = await generateText({ model, system, prompt: transcript })
return text.trim() 且超 2000 字符就截
```

---

## 5. 落地：compactSession（L111-125）

```ts
export async function compactSession(session, agent): Promise<CompactResult | null> {
  if (messages.length <= COMPACT_MIN_MESSAGES) return null   // 不够长不压
  keepFrom = messages.length - COMPACT_KEEP                  // 要保的最近 20 条从哪开始
  toSummarize = messages.slice(0, keepFrom)                  // 该总结的（最早的）
  kept = messages.slice(keepFrom)                            // 留下的（最近的）
  summary = await summarizeMessages(toSummarize, agent.model)
  session.messages = kept                                    // 旧消息换成摘要
  session.summary = summary
  return { summary, removed: toSummarize.length, kept: kept.length }
}
```

**关键设计**：摘要**不进消息列表**（L109 注释写明），而是放 `session.summary`；
下面所有 turn 靠 01 篇的 `summaryBlock` 把它注入 system prompt。为什么？
- 摘要进消息列表 = 它会参与后续计数/再压缩，越滚越大
- 放独立字段 = 每轮固定拼进 prompt，干净可控

前端压缩横幅读 `session.summary` 显示"已压缩 N 条 + 摘要内容"，用户能知道历史去哪了。

---

## 6. 名词复盘 + 动手建议

**一句话记牢**：压缩 = 占用超 90%（token 真实计数优先）**或**消息超 40 条就触发 → 用 LLM 把最早的总结成摘要 → 剩下 20 条 + 摘要进下一轮。

动手做：
1. **快速触发：** 启动时设 `NOVA_AGENT_COMPACT_MIN=5`，聊 6 条左右就触发压缩——看前端横幅"已压缩 N 条"，再看对话区顶部出现摘要。
2. **看计数逻辑：** 带一个超长聊天的 session，打印 `contextUsage`——体会"最后一条真实 input 是基准"。
3. **调窗口比例：** 设 `NOVA_AGENT_COMPACT_PCT=30`，一个稍长对话就触发——直观感受"百分比阈值"。
4. **看摘要质量：** 触发后读 `session.summary`，对照"保留目标/完成/待办、省略寒暄"的要求——体会那段提示词的作用。

---

## 附：关联地图

```
compact.ts（本篇：上下文压缩）
 ├── agentLoop.ts → shouldCompact（turn 前置检查）/ compactSession / summaryBlock 注入
 ├── models.ts    → contextWindowFor（读模型注册表窗口）/ createModel
 ├── store/session → session.messages 与 session.summary（摘要独立字段）
 └── 前端          → 压缩横幅（读 session.summary）
```

下一篇（07）建议：`server/workspace.ts` —— 工作区：agent 的文件权限边界（可配置 + 占位符 + 边界校验）。
