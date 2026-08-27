# 答案 01：Agent Loop

> 对应 [练习册](../01-agent-loop.md)。**做完题再看本页**。

---

## 练习 1：找 7 个阶段

**答案**（以当前代码为准，行号取近似区间）：

```
① 上下文压缩检查   L53-66   （shouldCompact + compactSession）
② 用户消息落盘+附件 L68-86   （userMsg push + modelUserText 拼附件绝对路径）
③ 装配工具         L89-407  （MCP 工具 + web_search/subagent/glob/run_command/remember）
④ 拼 system prompt  L409-448（persona + 技能 + 摘要 + 记忆 + stepBudget）
⑤ streamText 执行   L450-507（streamText + await result.steps 的懒执行）
⑥ 收集结果         L509-530（文本/工具记录/token，工具记录在 execute 端收集）
⑦ 落盘 + done      L548-563（finalMsg push + usage/done 事件）
```

**为什么**：压缩前置必须在用户消息落盘之前（否则新消息可能被压缩误伤）；工具装配要在 streamText 之前（否则模型没工具可调）；这 7 步的顺序不是随意的，每步都在为下一步准备输入。对应指南 01 的 §1、§4-§9。

---

## 练习 2：去掉 `stopWhen` 会怎样

**答案**：删除 `stopWhen: isStepCount(MAX_STEPS)` 后，`streamText` 的多步工具循环**没有步数上限**。模型可以无限"查→看→再查"，每一步都消耗 API 调用和时间；任务若迟迟不收敛，成本和时间都没有刹车。观察到的现象是 agent 会一直循环（直到模型自己决定结束或上下文被耗尽）。

**为什么**：这正是"预算先行的防御"的意义——`MAX_STEPS=24` 是经验值：浏览器/文件任务常 10-20 步，太少做不完、太多失控。对应指南 01 的 §2。

---

## 练习 3：prompt 即策略

**答案**：在 `stepBudget` 模板里加的句子会成为 system prompt 的一部分，agent 的行为会明显向该方向偏移（例如"先确认文件存在再改"被遵守）。但提示词是**软约束**——不保证 100% 遵守，冲突时模型会权衡。

**为什么**：system prompt 是"总纲"，模型没有常识，一切经验都要靠显式写进去；但它不是硬编码，是概率性的行为引导。对应指南 01 的 §7（"这段是教模型做人的"）。

---

## 练习 4：中断清理为什么是"发散式"

**答案**：`abortRun` 做三件事：① abort 主回合的流式请求；② `killSessionProcesses` 杀该会话所有命令进程树；③ 连带 abort 所有子任务。若只做①，会遗留两类"幽灵"：

- **命令进程树还在跑**：`npm run dev` 被中断后 node 仍占着端口，下次启动冲突。
- **子任务还在烧 token**：subagent 是独立 loop，主 abort 不会自动停它，会继续花钱跑。

动手验证：让 agent 跑长命令 → 点停止 → 任务管理器里 node 进程被清干净（`killSessionProcesses` 生效）。

**为什么**："中断"不是只切断流，而是发散到所有正在运行的资源——两个账本（`activeRuns` 管主回合 abort、`activeSubruns` 管子任务、`sessionProcesses` 管命令进程）分别对应一类需要清理的资源。对应指南 01 的 §2、§9。
