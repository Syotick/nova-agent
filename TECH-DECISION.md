# 技术选型调研报告：为什么用「AI SDK + MCP + Agent Skills」自组装，而不是 LangChain / LangGraph / CrewAI

> 项目：nova-agent（开源 AI Agent）
> 日期：2026-08
> 结论先行：**我们的技术栈（Vercel AI SDK + MCP 协议 + Agent Skills + 自研 50 行 Agent 循环）在"最小可用 + 可扩展 + 标准协议"三个维度上全面优于 LangChain / LangGraph / CrewAI。**
> 依据：官方文档 + 社区实测 + **本机实测依赖体积/安装耗时**（数据见 §6）。

---

## 1. 需求回顾（选型的基准）

| 需求 | 说明 |
|---|---|
| 小巧但五脏俱全 | 工具/技能/多轮/轨迹/多 agent/会话/动画，全都要但都要薄 |
| 不花时间在工程构建 | 无 monorepo、无重脚手架、半天跑通 |
| 工具用最广泛协议 | → MCP（已捐 Linux Foundation，"AI 的 USB-C"） |
| 技能用最广泛格式 | → Agent Skills（SKILL.md，Claude Code/Cursor/Windsurf 事实标准） |
| 前端 Vue 2.7 | 用户指定，生态核实过（plugin-vue2 官方维护） |
| 可扩展 | 加工具=加一个 json；加技能=加一个 md；未来加 multi-agent=加一个路由 |

**关键判断**：这是一个**"薄壳 + 标准件"**的项目 —— 协议层要标准（MCP/Skills），逻辑层要薄（agent loop），表现层要活（Vue）。这三者恰好是 LangChain 系框架**最不擅长**的组合。

---

## 2. 候选方案全景

| 方案 | 定位 | 版本（实测） | 语言 | 核心抽象 |
|---|---|---|---|---|
| **LangChain** | 全能工具链（chain/agent/memory/retriever…） | 1.5.8 | JS/Python | Chain、Tool、Memory、Retriever |
| **LangGraph** | 有状态多步 agent 图编排 | 0.2.x | JS/Python | StateGraph、节点、边、checkpointer |
| **CrewAI** | 多 agent 角色协作 | 1.0.1 | Python | Crew、Agent、Task、Process |
| **Vercel AI SDK** ✅ | 模型层薄封装（流式/工具/结构化输出） | 7.0.65 | TS/JS | `streamText`/`generateText`/`tool()` |
| **OpenAI Agents SDK** | OpenAI 生态 agent（handoffs/guardrails） | 1.x | Python/JS | Agent、Runner、handoff |
| **自研 while 循环** | 最简单 agent | — | 任意 | 无 |

**我们最终的选择**：`Vercel AI SDK`（模型层）+ `MCP 官方 SDK`（工具层）+ `Agent Skills`（技能层）+ **50 行自研 agent loop**（编排层）+ Vue 2.7（表现层）。

---

## 3. 逐框架详细调研

### 3.1 LangChain（否决）

**它解决什么**：让"LLM + 外部工具"组合成 chain/agent，提供记忆、检索、工具、输出解析的全家桶。

**为什么否决**：
1. **抽象层级过多且耦合**：`Chain → Runnable → Tool → Memory → Retriever → Callback`，每个都是可组合的抽象。你的业务只是"模型→工具→模型循环"，90% 的抽象用不上，但**全部要装、要学、要跟着它的版本走**。
2. **依赖体积大**：本机实测纯 `langchain` JS 包 **48.9MB / 5577 文件 / 安装 47s**（§6）。我们的整个 Agent 逻辑层（ai + mcp-sdk）才 **11.5MB**。
3. **版本动荡**：LangChain 0.x → 1.x 经历了大规模 API 重写（LCEL、Runnable、deprecation 风暴），社区抱怨"学完就过时"是常态。
4. **与 MCP 是重复轮子**：LangChain 有自己的 Tool 抽象和工具生态；但 2025 后业界共识是 **MCP 才是工具互操作标准**（§5.1），LangChain 现在反过来要兼容 MCP —— 等于在标准之上再包一层自己的抽象。
5. **对你项目最致命**：它**不提供前端**，轨迹/工具卡片/多 agent 配置界面全要自己写；它省的只有"那 50 行 agent loop"，代价是 48.9MB + 学习曲线 + 版本绑定。

### 3.2 LangGraph（否决）

**它解决什么**：把 agent 流程建模成**有向状态图**（StateGraph），节点=处理函数，边=转移条件，支持 checkpoint、并行、循环、人工介入。

**为什么否决**：
1. **图编排是"重型问题的解"**：LangGraph 的价值在**复杂的条件分支、并行子图、长期运行状态机**（如客服机器人、多阶段流水线）。我们的 agent loop 是"模型→工具→循环"，一个 `for` 循环就够 —— 引入 StateGraph 等于用状态机表达 while 循环。
2. **概念税高**：StateGraph/Node/Edge/Checkpointer/Reducer/Compile，学完才能写第一个 agent。而我们的 loop 是 50 行可读代码，任何接手的人 5 分钟看懂。
3. **体积与依赖**：`@langchain/langgraph + langchain-core` 实测 **50.9MB / 6264 文件 / 26.6s**（§6），且强依赖 langchain 生态。
4. **checkpoint 是它的卖点，但我们的 JSON 检查点够用**：我们的场景是"每条消息落盘"，不需要图级事务 checkpoint。
5. **社区定位变化**：LangChain 官方文档现在把 LangGraph 定位为"production runtime"，同时承认**简单 agent 用 while loop 就行**（§7 参考）。

### 3.3 CrewAI（否决）

**它解决什么**：**多 agent 角色协作** —— 定义 Crew（团队）、每个 Agent 有 role/goal/backstory、Task 列表、Process（顺序/层级）。

**为什么否决**：
1. **它解决的是我们明确"本轮不做"的事**：multi-agent 编排。我们的需求是单 agent 循环 + 多 agent 配置切换（每个 agent 独立工具/技能），不是"多个 agent 协同完成一个任务"。
2. **Python-only**：本机 JS/TS 栈（Vue2 + Node + AI SDK）无法集成，需另起 Python 服务 —— 违背"单 package.json、不花时间在工程"。
3. **重依赖**：Python 生态（pydantic、openai、chromadb 等一堆），实测 npm 侧无对应、安装超 5 分钟（§6 备注）。
4. **"Coordination Tax"**：社区实测多 agent 框架有显著的协调开销（token/延迟/失败率），对单 agent 项目是纯负担。
5. **未来要加 multi-agent 时也不选它**：我们的架构留了 `POST /api/subagent` 路由，未来用"AI SDK 起子 agent + 我们自己的 worker"即可，不必引入 CrewAI 的固定抽象。

### 3.4 OpenAI Agents SDK（否决，简述）

- 绑死 OpenAI 生态（handoff/guardrail 是其特色）；我们模型路由是 DeepSeek（OpenAI 兼容）。
- 它的 agent 模型（Runner + handoff）对我们单 agent 场景也是过度设计。
- 若未来深度绑定 OpenAI 才值得重估。

### 3.5 为什么选 Vercel AI SDK（保留）

**它不是 agent 框架，是"模型层薄封装"** —— 这是关键区分：
- `streamText()` 一行搞定：流式 + 工具调用循环（`maxSteps`/`stopWhen`）+ token 统计 + 错误处理 + **框架无关**（peerDeps 仅 zod，实测确认）。
- 官方 DeepSeek provider（`@ai-sdk/deepseek`，实测 3.0.28），baseURL 可配任意 OpenAI 兼容服务。
- 不绑定你的业务流程：agent loop 由我们写，AI SDK 只做"一次模型调用+工具执行"。
- 体积：`ai` 包 6.4MB，合理。
- 用它的**工具循环**而非手写：省掉 tool-loop 状态机、SSE 解析、usage 统计 —— 这些是**容易写错且无业务价值**的部分，值得用成熟件。

---

## 4. 我们的架构 vs 框架：逐维度对比

| 维度 | 我们（AI SDK+MCP+Skills） | LangChain | LangGraph | CrewAI |
|---|---|---|---|---|
| **Agent 循环代码量** | ~50 行（for loop + streamText） | 需学 Chain/Agent API | 需学 StateGraph API | 需学 Crew/Agent/Task API |
| **工具系统** | MCP 标准协议，加工具=加 json | 自研 Tool 抽象 + 兼容层 | 同 LangChain | 自研 Tool + 兼容 MCP |
| **技能系统** | SKILL.md 开放格式，加技能=加 md | 无标准对应（用 prompt 模板） | 无 | 无 |
| **多 agent** | 配置级（切换），留 subagent 接口 | 需额外编排 | 图内节点 | 核心能力（过度） |
| **依赖体积（实测）** | **11.5MB（agent 逻辑层）** | 48.9MB | 50.9MB | Python 全家桶 |
| **前端** | 自研 Vue2（全功能） | 无 | 无 | 无 |
| **轨迹展示** | 自研（事件拍平+inspector） | 无（需配 LangSmith） | 无（需配 LangSmith） | 无 |
| **流式/SSE** | AI SDK 原生 | 需手接 | 需手接 | 需手接 |
| **学习曲线** | 低（2 个 API） | 高 | 很高 | 高 |
| **与标准协议关系** | **原生即标准** | 标准之上套抽象 | 同左 | 同左 |
| **可审计/透明** | 全自研可控，代码可读 | 黑盒抽象多 | 黑盒抽象多 | 黑盒抽象多 |

**一句话**：LangChain 系框架的价值 = 帮你省那 50 行 loop + 给你一堆用不上的抽象；代价 = 48-50MB 依赖、学习曲线、版本绑定、黑盒。**在 nova-agent 这样的小巧型项目里，这买卖亏。**

---

## 5. 为什么"标准协议 > 框架抽象"是 2026 的共识

### 5.1 MCP 已取代"框架自带工具"成为工具层标准
- MCP 由 Anthropic 2024-11 发布，**2025-12 捐赠 Linux Foundation**，被媒体称为"AI 的 USB-C"（[来源](https://www.wedbush.com/investor/tokenring-2025-12-29-the-usb-c-of-ai-anthropic-donates-model-context-protocol-to-linux-foundation-to-standardize-the-agentic-web)）。
- OpenAI、Google、DeepSeek 生态全线接入；官方 SDK 跨语言（[MCP 2026 现状](https://futureagi.com/blog/model-context-protocol-mcp-2025/)）。
- **后果**：框架自己造的工具抽象（LangChain Tool、CrewAI Tool）变成"标准之上多一层"，未来都要兼容 MCP。**直接用 MCP = 跳过这层。**

### 5.2 Agent Skills（SKILL.md）成为技能层事实标准
- Claude Code、Cursor、Windsurf 共同采用：一个目录 + 一个 MD = 一个技能（[生态参考](https://www.npmjs.com/package/openskills)）。
- 可移植、可共享、Git 友好、零代码。
- 框架没有对应的技能抽象 —— 技能是"提示词工程 + 文件约定"，不需要框架。

### 5.3 "简单 while loop > 框架"被广泛验证
- Render.com 官方博客实测对比：LangChain / OpenAI Agents / Vercel AI / **简单 while loop**，结论是多数场景 while loop 更清晰可控（[来源](https://render.com/articles/comparing-agent-sdks-langchain-vs-openai-agents-vs-vercel-ai-vs-a-simple-while-l)）。
- 社区涌现"160 行打败 LangChain"的讨论，指向同一件事：**agent 核心逻辑本来就简单，框架把简单变复杂**（[来源](https://dev.to/charudatta10/orbit-the-160-line-rebellion-against-ai-framework-bloat-1m90)）。

---

## 6. 本机实测数据（最有说服力的部分）

| 包 | 安装耗时 | 体积 | 文件数 | 说明 |
|---|---|---|---|---|
| `langchain`（纯 JS） | 47.4s | **48.9MB** | 5,577 | 全部依赖 |
| `@langchain/langgraph + langchain-core` | 26.6s | **50.9MB** | 6,264 | 图编排+核心 |
| `crewai` | >5min | Python 全家桶 | — | JS 侧无对应包 |
| **我们的 Agent 逻辑层**（`ai` + `@modelcontextprotocol/sdk`） | ~15s | **11.5MB** | ~2,000 | 两个核心包 |
| 我们的完整项目（含前端/构建/浏览器） | — | 131MB | 8,991 | 其中 **playwright 浏览器 + vite/ts 构建工具占 ~80MB**，纯框架开销极低 |

**关键解读**：
- 我们的完整项目 131MB 看起来大，但拆开看：typescript 22.5 + vite/esbuild 24 + playwright-core 13 + playwright 5 = 构建工具和浏览器功能本体。
- **真正属于"Agent 框架"的只有 ai(6.4) + mcp-sdk(5.1) = 11.5MB**，是 LangChain 的 **1/4**，LangGraph 的 **1/4.4**。
- 省下的体积换来的是：**零版本动荡、零抽象税、全代码可读**。

---

## 7. 参考来源

- 框架对比：[Choosing an agent framework: LangChain vs LangGraph vs CrewAI vs PydanticAI vs Mastra vs Vercel AI SDK（Speakeasy）](https://www.speakeasy.com/blog/ai-agent-framework-comparison)、[Comparing agent SDKs（Render.com）](https://render.com/articles/comparing-agent-sdks-langchain-vs-openai-agents-vs-vercel-ai-vs-a-simple-while-l)、[Langfuse 开源 agent 框架对比](https://langfuse.com/blog/2025-03-19-ai-agent-comparison)、[AI SDKs 2026 对比](https://tokenmix.ai/blog/ai-sdks-2026-openai-vercel-langchain-llamaindex)
- LangGraph/CrewAI 定位：[LangGraph vs CrewAI 2026（Redwerk）](https://redwerk.com/blog/langgraph-vs-crewai/)、[多 agent 协调税讨论](https://dev.to/roryqis/autogen-and-crewai-developers-your-swarm-has-a-coordination-tax-heres-how-to-measure-it-4bl6)
- 体积争议：[LangChain 是否臃肿（官方论坛）](https://forum.langchain.com/t/is-langchain-langgraph-bloated/1953/2)、[160 行框架 vs LangChain](https://dev.to/charudatta10/orbit-the-160-line-rebellion-against-ai-framework-bloat-1m90)
- MCP 标准：[MCP 捐赠 Linux Foundation](https://www.wedbush.com/investor/tokenring-2025-12-29-the-usb-c-of-ai-anthropic-donates-model-context-protocol-to-linux-foundation-to-standardize-the-agentic-web)、[MCP 2026 指南](https://futureagi.com/blog/model-context-protocol-mcp-2025/)、[MCP vs A2A](https://futureagi.com/blog/mcp-vs-a2a-2025/)
- Agent Skills：[openskills 生态](https://www.npmjs.com/package/openskills)、[Agent Skills 革命](https://www.theproductionline.ai/newsletter/archive/issue-2-march-2026)
- AI SDK v7：[Vercel AI SDK 7](https://vercel.com/blog/ai-sdk-7)
- 本机实测：npm registry 实际安装测量（§6）

---

## 8. 结论

1. **LangChain**：全能但笨重，抽象税 + 48.9MB + 版本动荡，与 MCP 重复造轮子 —— **否决**。
2. **LangGraph**：图编排解决我们不需要的复杂问题，50.9MB + 高概念税 —— **否决**。
3. **CrewAI**：解决我们明确不做的事（multi-agent），且 Python-only —— **否决**。
4. **Vercel AI SDK**：薄模型层，提供"容易写错且无业务价值"的流式/工具循环/usage 统计 —— **保留**。
5. **MCP + Agent Skills**：工具层/技能层直接采用行业标准，**新增能力零代码** —— **核心选择**。
6. **50 行自研 agent loop**：编排层保持透明可控 —— **核心选择**。

**最终技术栈**：Vue 2.7 + Pinia + Vite（前端）｜Express + Vercel AI SDK + MCP SDK（后端）｜Agent Skills（技能）—— 已在 nova-agent 项目落地并通过浏览器操作端到端验收。
