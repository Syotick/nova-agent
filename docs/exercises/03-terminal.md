# 练习册 03：run_command —— 双手 + 进程生命周期

> 读完 [指南 03](../guide/03-terminal.md) + 代码 `server/terminal.ts` 后完成。规则：先自己动手，做完再对答案（答案在 [answers/03-terminal.md](answers/03-terminal.md)，别偷看）。

## 🎯 本课练习目标

- 能解释"为什么杀进程要杀整棵树"
- 能说出两个 Windows 平台坑及修法
- 能说明"超时≠失败"的设计意图

---

## ✍️ 练习

### 练习 1：读代码——进程注册表（入门）

**目标**：说清"会话进程注册表"解决了什么问题。

**步骤**：

1. 打开 `server/terminal.ts`，读 `sessionProcesses` 与 `registerProcess`、`killSessionProcesses`。
2. 回答：这个 Map 的 key 和 value 各是什么？`child.once("exit", ...)` 那一行在干嘛？
3. 追问：如果不监听 exit，会发生什么（内存/正确性上的问题）？

**预期结果（自检）**：能说出 key=会话 id、value=该会话正在跑的进程集合；exit 监听负责"进程自己退出就移出账本"；不监听会留下"已经退出的进程还被记着"，时间长了账本失真、清理时多杀不存在的进程。

**提示**：把 `sessionProcesses` 想成"会话的进程账本"，register 是记账，exit 监听是销账。

---

### 练习 2：读代码——cwd 越界防护（入门）

**目标**：理解"边界即安全"。

**步骤**：

1. 找到 `executeCommand` 里校验 cwd 的代码（`sub.startsWith(wsRoot + sep)` 那段）。
2. 回答：为什么必须用 `wsRoot + sep`（带路径分隔符）而不是简单的 `sub.startsWith(wsRoot)`？
3. 想一个能被"不带 sep 的写法"骗过去的路径例子。

**预期结果（自检）**：能说出如 `workspace-evil` 这种目录会被 `startsWith("workspace")` 误判为在界内，而 `startsWith("workspace" + sep)` 能排除它。

**提示**：想想目录名叫 `workspace_backup` 或者 `workspace2` 时会发生什么。

---

### 练习 3：动手——超时终止 + 进程树（进阶）

**目标**：亲眼看到"超时杀树"和"杀父不杀孙"的区别。

**步骤**：

1. 让 agent 执行一个永远在跑的命令（如 `node -e "setInterval(()=>{},1000)"`），观察它在 120 秒被"命令超时已自动终止"。
2. 手动开一个会拉子进程的命令：`cmd /c node -e "setInterval(()=>{},1000)"`，先只杀父（`taskkill /PID <父> /F`），去任务管理器看 node 孙进程是否还活着。
3. 再对整树杀（`taskkill /PID <父> /T /F`），确认全灭。

**预期结果（自检）**：第 1 步看到超时文案且进程被回收；第 2 步发现"只杀父"时 node 孙进程还活着；第 3 步整树杀干净。

**提示**：`/T` 就是"连子进程树"，对照 `killTree` 里 Windows 分支的实现。

---

### 练习 4：Windows 引号坑（挑战）

**目标**：理解 `windowsVerbatimArguments` 为什么必须开。

**步骤**：

1. 在 `terminal.ts` 里临时把 `windowsVerbatimArguments: true` 改成 `false`。
2. 让 agent 执行 `node -e "console.log(1)"`，观察输出是否丢失/报错。
3. 改回来，再跑一次，对比。

**预期结果（自检）**：关闭后带引号命令的输出异常（丢输出/乱码/语法错），改回后正常。你能解释"Node 默认重写引号 × cmd 自身解析叠加"为什么坏事。

**提示**：Windows 下 `cmd /c` 的引号规则和 Node 的参数重写叠加，`true` 就是"参数原样传，别碰"。

---

## 🔑 答案

见 [答案分册](answers/03-terminal.md)。先做再看。
