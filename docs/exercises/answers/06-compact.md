# 答案 06：上下文压缩

> 对应 [练习册](../06-compact.md)。**做完题再看本页**。

---

## 练习 1：contextUsage

**答案**：以"最后一条带真实 input count 的 assistant 消息"为基准——它记录的 `input_tokens` 是那次请求的**完整输入**（已包含全部历史）。所以不再累加每条消息（会重复计），只对基准之后新增的消息用 `estimateTokens` 估算（中文约 0.7 token/字、其他约 0.25 token/字符）。早期无 token 记录的消息就靠这个估算补。

**为什么**："能用真实计数的，绝不用累加猜测"——成熟项目做法。对应指南 06 的 §3。

---

## 练习 2：双触发

**答案**：消息数 > 40（`COMPACT_MIN_MESSAGES`）→ 条数兜底；上下文占用 > 窗口 90%（`COMPACT_PCT`）→ token 占用主方案。失效场景：每条消息都很短、占用不到 90%，但聊了几百条——"条数兜底"保证无论如何都会压一次。

**为什么**：token 感知是"精确体温计"，但有些消息没 token 记录（早期数据、用户输入），体温计失灵时条数兜底顶上——两层保险。对应指南 06 的 §2。

---

## 练习 3：快速触发压缩

**答案**：`NOVA_AGENT_COMPACT_MIN=5` 下聊 6 条即触发。前端横幅显示"已压缩 N 条"，顶部出现摘要；`session.summary` 是浓缩摘要。代码里把旧消息 `session.messages = kept` 并把摘要放 `session.summary`（不进消息列表）。

**为什么**：对应指南 06 的 §4、§5。

---

## 练习 4：摘要为什么不进消息列表

**答案**：若摘要作为普通消息 push 进 messages：① 它会被下一轮压缩当成"待总结的旧消息"——摘要再次被总结，越滚越大；② 它参与 `contextUsage` 计数，污染"占用是否超阈值"的判断。独立字段（`session.summary`）的好处：每轮固定拼进 system prompt、内容干净可控、永远不会被再次压缩。

**为什么**：这正是"压缩的自我克制"——摘要放独立字段是成熟项目的通用做法。对应指南 06 的 §5。

---

## 练习 5：保留条数 + token 预算

**答案**：固定 20 条对超长消息不公平——20 条 × 5000 token ≈ 10 万 token，小窗口模型照样爆；对超短消息又留太少，模型缺上下文。所以 `computeKeepFrom` 加"token 预算"约束：保留部分估算 token ≤ 窗口 × `COMPACT_RETAIN_PCT`（默认 16%）；超预算就把最旧的保留消息并入压缩范围，但至少保留 `COMPACT_MIN_KEEP`（默认 5）条。对应指南 06 的 §5。

**为什么**：这是 DSH `retainRatio` 的语义（保留按 token 预算而不是只按条数）。抽成纯函数是为了单测友好（`compact.test.ts` 里 5 条用例直接测它）。

---

## 练习 6：溢出自动恢复

**答案**：
1. system/history 的组装必须在 `attemptModel` 内部——因为压缩会改写 `session.summary` 与 `session.messages`，重试前必须重新读，否则重试的还是同一份爆掉的上下文。
2. 溢出恢复传 `{ force: true, keep: 6 }`（force 忽略"40 条"门槛、keep 保留更少）；"压不动就不重试"——若压缩返回 null（如全是本轮新消息、无可压），重试等于白跑一遍工具（还可能重复副作用），所以直接透出原错误让前端提示用户。

**为什么**：对应 DSH compaction-basic 的 context-overflow recovery（`maxOverflowRetries = 1`）。`isContextWindowExceededError` 沿 `err.cause` 查，是因为很多 provider 错误被 `fetch failed` 这类传输层包装，真身在 cause 链里。对应指南 06 的 §6。

---

## 练习 7：修剪 + 溢出动手

**答案**：
1. `NOVA_AGENT_PRUNE_THRESHOLD=500` 下，长输出命令的工具卡出现"模型侧已修剪"徽章；`call.output` 仍是完整原文，模型读到的是 `head + [... tool result middle pruned ...] + tail`。
2. `Array.from(text)` 按 Unicode 码点切——`'😀'.length === 2`（UTF-16 两个单元），按 `.length` 会把 emoji 从中间劈成乱码；`Array.from` 按完整码点切，稳。
3. 溢出恢复时横幅显示"溢出自动恢复"（`trigger: 'overflow'`）。

**为什么**：修剪只影响"喂给模型的 content"（`toolResultForModel`），`record.output` 始终完整——"展示不丢、上下文受控"。这是对齐 DSH `tool-result-pruner` 的 8192 → 4096 + 标记 + 1024 默认值。对应指南 06 的 §7。
