# 代码走读 01：Agent Loop —— 一个 agent 是怎么"转"起来的

> 本文带你逐段读 `server/agentLoop.ts`（约 595 行，多轮对话 + 工具调用 + 中断的核心引擎）。
> 读完这份走读 + 代码本身，你就能讲清楚"agent 循环"到底在干什么，
> 也能理解为什么说"这个项目的 agent loop 只有几十行"。

---

## 0. 先明白两件事

**Agent loop 是什么**：一条用户消息进来，模型可能不会一次回答完——它要先查个东西、再跑个命令、看到结果再继续。所以引擎要做的是：
「模型产出文本/工具调用 → 执行工具 → 把结果喂回模型 → 再产出 → …… 直到模型直接给出最终回答」。

**这个文件在项目里的位置**：`server/agentLoop.ts` 是**最核心的编排文件**，它不自己连模型、不自己读文件，而是把一堆零件（models / mcp / skills / memory / terminal / glob / compact）组装成一次完整的"回合"（turn）。零件各自有文件，这篇只讲这个组装过程。

### 0.5 术语速查（给新手：遇词先来这查，别硬猜）

| 名词 | 大白话 |
|---|---|
| **Agent** | 会"自己决定下一步做什么"的 AI 程序。不是一问一答的聊天机器人，而是会调用工具的"办事员" |
| **Agent Loop（agent 循环）** | 让模型反复"思考 → 行动 → 看结果 → 再思考"的循环。核心循环由框架（AI SDK）做，我们做外围装配 |
| **turn（回合）** | 用户发一条消息 → agent 完整处理一次（内部可能调好几次工具）→ 给出最终回答。多轮对话 = 多个 turn |
| **token（分词）** | 模型读写文本的基本单位（大约 1 个英文单词≈1~2 token，1 个汉字≈1~2 token）。计费、上下文窗口、"token 用量"都按它算 |
| **SSE（Server-Sent Events）** | 服务器向浏览器"单向实时推送"的协议。用来把 agent 的过程事件（文本增量、工具开始/结束）一帧帧推给前端，实现流式打字机、实时观看工具执行 |
| **streamText** | AI SDK 提供的一个函数：发起一次"带工具"的模型对话流，内部帮你做多步工具循环 |
| **工具调用循环（tool-calling loop）** | 模型说"我要调用 xxx 工具，参数是…"→ 程序执行 → 把结果当新输入喂回模型 → 模型再决定下一步。agent "干活"就靠它 |
| **MCP（Model Context Protocol）** | 让外部工具"即插即用"的标准协议（好比 AI 界的 USB-C）。MCP **server** 是工具提供方（独立进程），MCP **client** 是连接方（我们） |
| **system prompt（系统提示词）** | 每次对话开始时给模型的"总纲"：你是谁、怎么干活、有哪些工具和限制。模型看不到也改不了它，但它决定模型行为 |
| **persona（人设）** | system prompt 最开头那句"你是……"，agent 身份设定 |
| **prompt 工程（提示词工程）** | "怎么写提示词让模型更好用"的工程实践：给约束、给策略、给例子（本项目大量用） |
| **上下文压缩** | 对话太长时，让模型把"较早的历史"总结成一条摘要，省 token、防溢出（对应"自动压缩"） |
| **跨会话记忆** | 需要"不同会话之间都能记住"的长期事实（不是对话历史）。存记忆库，用 LRU 缓存 |
| **subagent（子 agent）** | 主 agent 派出去独立干活的"小 agent"，干完把结果带回来，甚至能带自己的模型 |
| **嵌套深度** | 子 agent 又派子 agent 的层数。本项目 0=主、1=子、2=孙、3=曾孙，最多 3 层（防成本爆炸） |
| **中断传播** | 主回合被"停止"时，把中断信号**向下传递**：一起停子任务、杀未跑完的命令进程，防后台幽灵工作（详见 §2） |
| **进程树 / 幽灵进程** | 一条命令（如 npm run dev）会拉起子进程形成"树"。中断后没杀干净、残留继续跑的就是幽灵进程（占端口、耗资源） |
| **LRU（Least Recently Used）** | 缓存淘汰策略：放不下时优先淘汰"最久没被用"的项，记忆库用了它 |
| **SQLite 持久化** | 把会话/消息存进本地文件数据库（Node 内置 node:sqlite），重启不丢 |

> 文中再遇到黑话，回来翻这张表；没查到的欢迎去提 issue 补上。

---

## 1. 全局视角：一个 turn 的 7 个阶段

```
用户发消息 ──▶ ① 上下文压缩检查（太长先总结旧的）
                ② 用户消息落盘 + 附件注入
                ③ 装配工具（MCP 工具 + 内置工具们）
                ④ 拼 system prompt（persona + 技能 + 摘要 + 记忆 + 约束）
                ⑤ streamText 多轮执行（模型 ↔ 工具，直到回答或步骤用尽）
                ⑥ 收集文本/工具记录/token
                ⑦ 落盘 assistant 消息 + 发 done 事件
```

`runTurn()` 这个名字很直白：**跑一轮**。多轮对话就是"用户每发一句 → 跑一轮"。vibe 自治循环则是把 runTurn 循环着调（见 `server/vibe.ts`，另一篇走读）。

---

## 2. 常量与全局表（L17-40）

```ts
const MAX_STEPS = Number(process.env.NOVA_AGENT_MAX_STEPS ?? 24)   // 每轮最多工具步数
const MAX_SUBAGENT_DEPTH = Number(process.env.NOVA_AGENT_MAX_SUBAGENT_DEPTH ?? 3) // 子agent最多3层
```

**为什么要有步骤上限**：模型可以无限"查→再查"，每步都烧 token 和耗时。24 是一个经验值——浏览器/文件任务常常 10-20 步，太少任务做不完，太多失控。环境变量可调，这是"预算先行的防御"。

```ts
const activeRuns = new Map<string, { abort: () => void }>()      // 会话 → abort 函数
const activeSubruns = new Map<string, Set<() => void>>()         // 主会话 → 子任务 abort 集合
```

**中断注册表**：`abortRun(sessionId)`（L29）是"用户点停止"的入口（由 `/api/chat/stop` 调用）。
注意它做了三件事（L29-40）：
1. abort 主回合的流式请求
2. `killSessionProcesses`——**杀掉这个会话正在跑的命令进程树**（否则 npm run dev 中断后还占着端口）
3. 连带 abort 所有子任务（防幽灵执行）

这是一个很值得学的工程点：**"中断"不是只切断流，而是发散到所有正在运行的资源**。

---

## 3. runTurn 入口（L42-51）

```ts
export async function runTurn(
  session: Session,          // 会话（近于"聊天记录"，含 messages 数组）
  agent: Agent,              // agent 配置（persona / 模型 / 勾选的 MCP 服务器 / 技能）
  userText: string,          // 本轮用户输入
  push: (e: ChatEvent) => void,  // SSE 事件推送函数（前端靠它实时渲染）
  ...
): Promise<Message>          // 返回本轮生成的 assistant 消息
```

关键在 `push`：它把**过程事件**（文本增量、工具开始/结束、步骤数、token 用量）实时推给前端。
所以前端能"看着 agent 一步步干活"，而不是等全部结束才拿结果——这就是流式（SSE）体验的由来。

---

## 4. 第一步：上下文压缩前置（L53-66）

```ts
if (shouldCompact(session, agent.model)) {
  const result = await compactSession(session, agent)   // LLM 把旧历史总结成摘要
  ...
}
```

**为什么压缩要在"本轮用户消息落盘之前"**：压缩会把"较早的 N 条消息换成一条摘要"。
如果先把用户这条新消息塞进历史再压缩，新消息可能被误伤（刚说的话被总结掉）。
所以顺序是：先压缩旧历史 → 再追加新消息。

压缩不是必耗时：`shouldCompact` 只在"消息太多 或 上下文占用超阈值"时才返回 true。
压缩失败也不阻塞——保留原历史继续（catch 里只 warn）。

## 5. 用户消息落盘 + 附件注入（L68-86）

```ts
session.messages.push(userMsg)   // 用户消息先进内存（后面由路由统一 saveSession 落 SQLite）
```

附件（用户上传的文件）会被注入到**给模型看的那条输入**里，而不是给用户看的原文里：
把每个附件的名字 / 大小 / **绝对路径** 追加成一段说明。为什么给绝对路径？因为 filesystem
MCP 工具要求传绝对路径，模型照着路径就能 `read_file`。

---

## 6. 核心之一：装配工具（L89-407）

工具是"模型能调的胳膊"。这里把三类工具塞进一个 `tools` 字典：

### 6.1 MCP 工具（L89-125）——从服务器拉的
```ts
const mcpTools = await listToolsFor(agent.mcpServerIds)   // 当前 agent 勾选的 MCP 服务器
for (const t of mcpTools) {
  tools[t.name] = tool({ ... })   // 用 AI SDK 的 tool() 包装成模型可调用的 schema
}
```
MCP 服务器（filesystem / playwright…）是一个个独立子进程，它们的工具列表通过 `listToolsFor`
聚合。这里**只做了包装**，真正的执行在 `callMcpTool(t.serverId, t.name, args, timeout)`。
留意超时：`t.timeoutMs ?? 120000`——工具调用默认 120 秒，每类 MCP 配置可覆盖。

### 6.2 内置工具——所有 agent 自动拥有（不用勾选）
- **web_search**（L128-145）：走 `builtinTools` 数组（见 `server/builtinTools.ts`），搜索是做"查资料"最省步数的路子。
- **subagent**（L150-259）：子 agent 编排。核心是**递归调用自己**：
  ```ts
  const msg = await runTurn(subSession, subAgent, task, () => {}, undefined, undefined, depth + 1)
  ```
  子任务 = 一个内存临时会话（不入库）+ 完整独立的一轮 loop，`push` 传空函数（子过程不推给前端，只把最终文本交回主 agent）。
  有几个聪明的防护：
  - 深度限制 `depth >= MAX_SUBAGENT_DEPTH`（L187）：防无限递归，成本随深度爆炸。
  - **中断传播**（L208-211）：主 abort 时连带 abort 子任务。
  - **失败策略**（L236-245）：子任务失败返回"原因 + 部分产出"，由主 agent 决策——不盲目重试、禁止编造结果。
- **glob**（L263-305）：六大核心编程工具之一，文件名模式匹配（实现见 `server/glob.ts`，支持 `*` `**` `?`）。
- **run_command**（L310-353）：终端执行（实现见 `server/terminal.ts`），是"改代码 → 跑构建/测试验证"的关键一环；命令进程参与会话级进程树管理，中断会清理。
- **remember**（L357-407）：跨会话记忆，把算"值得长期记住"的一句话写进记忆库（`server/memory.ts`）。

> 观察：MCP 工具和内置工具的 execute **结构完全一样**（record → push start → 执行 → push end → 返回），
> 这是刻意的一致性，让前端渲染、记录收集走同一套逻辑。

---

## 7. 核心之二：拼 system prompt（L409-448）

```ts
const system = `${agent.persona}\n${injectSkills(agent.skillIds)}${summaryBlock}${memoryBlock}${stepBudget}`
```

一段 system prompt = 五块拼起来：
1. **persona**：agent 的人设（"你是...用中文回答..."）
2. **技能**：`injectSkills(agent.skillIds)`——把勾选的技能正文注入（见 skills 篇）
3. **历史摘要**：压缩产生的 `session.summary`（有才注入）
4. **长期记忆**：`memoryBlock`（L416-431）——按用户输入做词面检索 Top-K + 最近记忆兜底；命中≥3 时不兜底避免噪声；注入后 `touchMemories` 保活（LRU 里提升生命周期）
5. **执行约束**：`stepBudget`（L432-447）——**这段是"教模型做人"的**：
   - 最多 24 步，要高效规划
   - 必须给最终结论，禁止"请稍等"就结束
   - 工具失败分级处理（网络错误重试 1 次 / 空结果换关键词 / 换表述），**禁止反复重试同一工具**
   - 工具选择策略：查资讯用 web_search 不开浏览器；浏览器工具只在用户明确要求时用
   - 任务执行策略：读代码用 read/search、改代码用 edit/write、验证用 run_command

**这段为什么重要**：模型没有"常识"，它不会自动知道"别一次搜索 8 遍"、"改完代码要自己跑测试验证"。这些经验全部要靠提示词显式写。这也是 prompt 工程最实际的应用。

---

## 8. 组装历史 + 开跑（L450-507）

```ts
const history = session.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))
history.push({ role: 'user', content: modelUserText })
```
历史去掉最后一条（刚 push 的用户消息，用带附件的 modelUserText 版本替换）给模型。

```ts
const result = await streamText({
  model: createModelForAgent(agent),
  system,
  messages: history,
  tools: ...,
  stopWhen: isStepCount(MAX_STEPS),            // 步骤上限
  abortSignal: abortController.signal,         // 中断
  providerOptions: buildProviderOptions(...),  // 思考模式（reasoning）
  onChunk: ...  // 文本增量
  onStepEnd: ... // 每步结束 + token 统计
})
```

**AI SDK 的懒执行**很关键：`streamText` 返回一个查询对象，真正的请求发出 + 多步循环，在你 `await result.steps` 时才开始（L509-519）。模型 401 / 网络错误都是在这个 await 抛出来的——这里特意**不能吞掉错误**，否则前端只收到一条空消息、没有任何提示。

---

## 9. 结果收集与三态收尾（L509-563）

工具调用记录**不从 steps 解析**——AI SDK v7 的 `step.toolCalls` 不含 result（执行输出）。
所以采用**在 execute 端收集**：每个工具的 execute 里自己 push 到 `executedToolCalls`（与推给前端的事件同源）。这是本项目踩过坑后修出来的（详见各 execute 里的 `executedToolCalls.push`）。

收尾分三种情况：
1. **模型错误**（L532）：发 `error` 事件，不落盘空消息。
2. **中断且无输出**（L542）：不落盘、不发 done——因为中断的展示由前端负责，后端再落盘会重复。
3. **正常结束**（L548）：组装 `finalMsg`（文本 + 工具记录 + token 用量 + 时间线 segments），push 进 messages，发 `usage` + `done` 事件。

三种情况都要 `activeRuns.delete(session.id)` + `killSessionProcesses`——清理中断注册和命令进程，为下一轮腾干净。

---

## 10. "几十行"的本质在哪

去掉 MCP 包装、内置工具细节、prompt 拼装、错误分支，**驱动循环的最小骨架**其实就是：

```ts
const result = await streamText({ model, system, messages, tools, stopWhen: isStepCount(N) })
for await (const step of result.steps) { /* 工具已由 AI SDK 执行并喂回 */ }
return finalMessage
```

真正"转起来"的逻辑——模型产出 → 执行工具 → 结果喂回 → 再产出——是 **AI SDK 的 `streamText` 加 `tools` 帮你做掉的**（内部就是多步循环）。我们写的几百行是在**外围**：
装配哪些工具、prompt 怎么写、过程怎么推给前端、错误/中断怎么处理、命令进程怎么清理。
所以"agent loop 只有几十行"这句话的内核是：**多步工具循环本身不难，难的是把它放进一个真实可用的产品里**。

---

## 11. 动手建议（把这篇用起来）

1. **先跑起来**：`npm install && npm run dev`，对着一个会话聊，观察轨迹视图——每步工具调用都能看到输入/输出/耗时。
2. **看效果**：把 `MAX_STEPS` 临时改成 `2`（`NOVA_AGENT_MAX_STEPS=2` 跑 dev），聊一个需要 5 步的任务，你会亲眼看到"步骤用完被截断"是什么样。
3. **改一改**：在 `stepBudget` 里加一句你自己的工具策略，重启，让 agent 照你说的做——体会"prompt 即策略"。
4. **打断**：让 agent 跑一个 `npm run dev` 之类的长命令，中途点停止，然后到任务管理器确认 node 进程被清了（`killSessionProcesses` 在起作用）。

---

## 附：与其他文件的关联地图

```
agentLoop.ts（本篇：编排）
 ├── models.ts      → createModelForAgent / buildProviderOptions（模型与思考模式）
 ├── mcp.ts         → listToolsFor / callMcpTool（MCP 工具桥接）
 ├── builtinTools.ts→ web_search
 ├── skills.ts      → injectSkills（技能注入）
 ├── compact.ts     → shouldCompact / compactSession（压缩）
 ├── memory.ts      → searchMemories / addMemory / listMemories / touchMemories（记忆）
 ├── terminal.ts    → executeCommand / killSessionProcesses（run_command）
 ├── glob.ts        → executeGlob（glob）
 └── types.ts       → ChatEvent / Message / ToolCallRecord（共享类型）
```

下一篇（02）建议：MCP 客户端 `server/mcp.ts`——"怎么把外部工具变成 agent 的手"。
