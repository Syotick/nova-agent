# 答案 03：run_command

> 对应 [练习册](../03-terminal.md)。**做完题再看本页**。

---

## 练习 1：进程注册表

**答案**：`sessionProcesses` 是 `Map<会话id, Set<ChildProcess>>`——key 是会话 id，value 是该会话正在跑的进程集合。`child.once("exit", () => set?.delete(child))` 是"销账"：进程自己正常退出时把它从集合里移掉。如果不监听 exit，已退出的进程会一直留在账本里：`killSessionProcesses` 清理时会对着已死进程再杀一遍（无害但多余），更糟的是账本失真后无法准确知道"还有哪些在跑"（比如判断是否该清理会误判）。

**为什么**：账本 + 定时核对（exit 监听）缺一不可——这是"会话级进程管理"的基石。对应指南 03 的 §2。

---

## 练习 2：cwd 越界防护

**答案**：必须用 `sub.startsWith(wsRoot + sep)`。只写 `sub.startsWith(wsRoot)` 的话，`wsRoot` 为 `C:\proj\workspace` 时，`C:\proj\workspace_evil`（一个名字以 workspace 开头的兄弟目录）也会被误判为在界内，agent 就能把命令 cwd 指到工作区之外。加上 `sep` 后，只有真正的 `workspace\xxx` 子路径才通过。

**为什么**："边界即安全"——能碰的目录就是文件边界，必须显式封死，不能靠模型自觉。这正是指南 03 的 §3 讲的内容；同理 07 篇工作区校验也用了 `sep` 拼接判断。

---

## 练习 3：超时终止 + 进程树

**答案**：

- 第 1 步：agent 执行永不退出的命令，120s 后收到"命令超时（120s）已自动终止进程树"，进程被 `killTree` 回收。
- 第 2 步：`taskkill /PID <父> /F` 只杀父进程——`cmd` 死了，但它拉起的 `node` 孙进程还活着、还占资源。
- 第 3 步：`taskkill /PID <父> /T /F` 带 `/T`（tree）连子进程树一起杀，全灭。

**为什么**：命令常拉起子命令（npm → node → …），只杀父进程留孙进程 = 留幽灵。代码里 `killTree` 的 Windows 分支就是 `taskkill /PID /T /F`。对应指南 03 的 §6。

---

## 练习 4：Windows 引号坑

**答案**：把 `windowsVerbatimArguments` 改成 `false` 后，跑 `node -e "console.log(1)"` 会输出丢失/语法错；改回 `true` 后正常。原因：Windows 下 Node 的 `spawn` 默认会"帮你"重写参数里的引号，与 `cmd /c` 自身的引号解析叠加，带引号的命令就被搅坏。`true` 是"参数原样传，别碰"。

**为什么**：平台差异都是坑出来的——这是项目踩过坑后补的开关。对应指南 03 的 §5 坑 1。
