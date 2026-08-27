# 答案 02：MCP 客户端

> 对应 [练习册](../02-mcp.md)。**做完题再看本页**。

---

## 练习 1：建立连接四步

**答案**（`establish`，约 L121-147）：

```ts
const client = new Client({ name: "nova-agent", version: "0.1.0" }, { capabilities: {} });  // ① 建 client（协议"嘴"）
const transport = new StdioClientTransport({ command, args, env });                          // ② 建通信管道（要 spawn 的程序）
await client.connect(transport);                                                             // ③ 握手（协议初始化）
const listed = await client.listTools();                                                      // ④ 拉工具清单
```

**为什么**：① 定义了"以什么身份说话"；② 定义了"跟谁说话"（哪个子进程）；③ 握手不成功后面全是空中楼阁；④ 把工具清单存进连接，agent loop 才能包装成模型可调的工具。对应指南 02 的 §5。

---

## 练习 2：为什么是子进程

**答案**：三个好处——**语言无关**（server 可以是 Python/Go，只要按协议用 stdout 说话）；**隔离**（server 崩溃/出问题不影响主进程）；**即插即用**（换 server = 改一行配置，代码零改动）。反例思考：如果工具极简单、纯本地且频繁调用，塞进同一进程能省去 IPC/进程开销（但会失去隔离与语言自由度）。

**为什么**：这是"薄壳 + 标准件"架构观的核心：协议层要标准、逻辑层要薄。对应指南 02 的 §5 的 💡 部分。

---

## 练习 3：写一个 10 行的 MCP server

**答案**：

```js
// my-tool-server.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
const server = new McpServer({ name: "demo", version: "1.0" })
server.tool("add", { a: { type: "number" }, b: { type: "number" } }, ({ a, b }) => ({
  content: [{ type: "text", text: String(a + b) }],
}))
await server.connect(new StdioServerTransport())
```

```json
// mcp-servers/demo.json
{ "id": "demo", "name": "Demo", "command": "node", "args": ["./my-tool-server.js"] }
```

保存后工具页出现 `add`，agent 可调用。**看懂这段，MCP 对你没有秘密**——server 就是"注册工具 → 从 stdin 读请求、往 stdout 回结果"。

**为什么**：协议的全部要点浓缩在这几行：工具即函数、参数即 JSON Schema、结果即文本。对应指南 02 的 §11 动手建议第 4 条。

---

## 练习 4：指数退避

**答案**：延迟序列 `RECONNECT_BASE_DELAY_MS * 2 ** retryCount`：5s → 10s → 20s → 40s → 80s → 120s → 120s…（`RECONNECT_MAX_DELAY_MS = 120_000` 封顶）。

- **翻倍**：给 server 恢复留时间，同时避免"重试风暴"刷爆日志。
- **封顶 120s**：不能无限等下去，重连要有节律。
- **超过 `RECONNECT_MAX_ATTEMPTS = 20` 次暂停**：服务器若长期不可用，永动机式重试没有意义，等手动触发或下次调用再试。

动手观察：把 `command` 改成不存在的命令后，管理页显示连接失败，日志里重连尝试间隔越来越长。

**为什么**：这是"有限度的坚持"——与 agent loop 里"失败重试最多 1 次"的分级策略是同一个精神。对应指南 02 的 §8。
