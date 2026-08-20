# 代码走读 07：工作区 —— Agent 的文件权限边界

> agent 能读写文件、能跑命令，那它"能碰哪些文件"？答案全在这个文件里。
> `server/workspace.ts`（约 110 行）定义"工作区"：Agent 唯一能碰的目录（filesystem 工具挂载根、命令执行根、附件上传根）。
> 这篇讲：默认值怎么兜底、路径怎么解析、哪些"危险目标"必须拒绝、怎么和 MCP 配置联动。
> 建议顺序：01 → 02（MCP，占位符在这里联动）→ 这篇。

## 0. 术语速查

| 名词 | 大白话 |
|---|---|
| **工作区（workspace）** | Agent 的文件"领地"。它读写文件、跑命令、收附件都只能在这个目录里，**领地之外一概不碰** |
| **权限边界（permission boundary）** | 安全模型：明确"能碰什么、不能碰什么"的那条线。工作区就是这条线的物理实现 |
| **挂载根（mount root）** | filesystem MCP server 只"看得见"这个目录（它启动时把目录当根）。工作区改，挂载根跟着改 |
| **相对路径 vs 绝对路径** | 相对 = 从某个基准出发（`my-app` 表示"项目根/my-app"）；绝对 = 从盘符/根出发（`D:\work\proj`） |
| **项目根（project root）** | 项目代码所在目录（有 package.json 那层）。**默认禁止**当工作区（否则 agent 能读源码和数据库） |
| **resolve（解析）** | 把"相对路径"按基准换算成"绝对路径"的过程（Node 的 `path.resolve`） |
| **占位符（placeholder）** | 配置里的"替身"，运行时替换成真值。`{{workspace}}` 会被替换成当前工作区的绝对路径 |
| **兜底（fallback）** | 主方案不可用时用的默认。工作区默认 `workspace/` 就是"用户没配置时的兜底" |
| **大小写不敏感比较** | Windows 路径不区分大小写（`D:\A` 和 `d:\a` 是同一目录）。安全判断必须忽略大小写，否则能被"大小写变体"绕过 |
| **路径穿越（path traversal）** | 往路径里塞 `..`/`../..` 越出规定目录的攻击手法。这里拒绝"指向项目根/密钥目录"的解析结果，防的就是它 |
| **normalize（规范化）** | 把路径里的杂分隔符/`.`/`..` 整理成标准写法（`a/b/../c` → `a/c`） |
| **config 表** | SQLite 里的键值配置表。工作区配置存在这（`workspacePath` 键） |

---

## 1. 它在架构里的位置

```
用户（输入框工具栏的工作区入口 / 设置页）
  │  PUT /api/workspace
  ▼
server/index.ts → setWorkspacePath（校验 → 存 config）
  │
  ├─ server/workspace.ts（本篇：唯一事实源）
  │    ├─ getWorkspacePath()  ← 所有人都从这拿"当前工作区"
  │    │    ├─ agentLoop：附件绝对路径拼接
  │    │    ├─ uploads 路由：附件存 <工作区>/uploads
  │    │    ├─ mcp.ts：resolveMcpArgs（{{workspace}} → 工作区）
  │    │    └─ terminal/glob：命令和搜索只在工作区内
  │    └─ validateWorkspaceRaw()（危险目标拒绝）
  └─ MCP filesystem server 挂载根 = 工作区
```

一句话：**全项目所有"文件相关"的地方，都从 `getWorkspacePath()` 拿根**——这是"单一事实源"设计：改一处（配置），全链路跟着变，不会出现"A 处用旧目录、B 处用新目录"的分裂。

---

## 2. 默认与兜底：不配置也能跑（L9-10, 27-31）

```ts
const CONFIG_KEY = 'workspacePath'
export const DEFAULT_WORKSPACE = 'workspace'   // 相对项目根

export function resolveWorkspace(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return join(process.cwd(), DEFAULT_WORKSPACE)  // 空 = 项目根/workspace
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(process.cwd(), trimmed)
}
```

**两个设计点**：
- **空值 = 兜底**：用户没配（`raw` 为 null/空）→ 直接用 `项目根/workspace`。开箱即用，不用先配置。
- **相对/绝对双支持**：填 `my-app` → `项目根/my-app`（相对）；填 `D:\work\proj` → 原样（绝对）。用户怎么方便怎么来。

`getWorkspacePath()`（L34-36）就是"当前生效值"——`resolveWorkspace(getWorkspaceRaw())`。所有模块都调它，不重复存路径，从根源避免"两份配置不一致"。

---

## 3. 安全：哪些"危险目标"必须拒绝（L62-83）

工作区 = Agent 的权限边界，所以**边界本身必须设防**。`validateWorkspaceRaw` 拒绝三类：

```ts
// ① 项目根：Agent 会获得项目源码/数据库访问权限
if (resolvedLower === cwdLower) return '工作区不能是项目根目录...'
// ② 密钥文件所在目录或其任何祖先：filesystem 即可读到项目外的 API key
const keyParentLower = KEY_FILE_PARENT.toLowerCase()
if (resolvedLower === keyParentLower || keyParentLower.startsWith(resolvedLower + sep)) {
  return '工作区不能位于项目上级目录（API key 文件所在区域）...'
}
// ③ NUL 字符 / 超长路径：防脏输入
```

逐个讲为什么：

- **拒绝项目根**：工作区若等于项目本身，agent 就能读项目源码、数据库（`data/nova-agent.db` 存着所有会话）、甚至配置。违背"只碰工作区"的最小权限。
- **拒绝密钥文件目录及其祖先**：API key 存在项目**上级**的 `.nova-agent-key.json`（项目外，agent 够不着是安全基线）。如果工作区指向上级目录（`..`）或更上层，filesystem 挂载那里就能读到密钥——**直接把安全基线击穿**。所以不仅"上级目录本身"，连"它的祖先"（`../..` 等）一起拒。
- **大小写不敏感比较**（`toLowerCase`，L16-19 的 `samePath`）：Windows 路径不区分大小写，`d:\data\...` 和 `D:\Data\...` 是同一目录。如果按字符串硬比，"小写盘符变体"就能绕过"项目根拒绝"——**安全判断必须忽略大小写**。这是很典型的"看起来对、实际可绕过"的细节。

校验是**纯函数**（L62-63 注释），不碰数据库——好处是测试直接喂字符串就能断言，不需要起服务（`workspace.test.ts` 就是这么测的）。

---

## 4. 设置与重置（L85-96）

```ts
export function setWorkspacePath(raw: string): string | null {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') { deleteConfigValue(CONFIG_KEY); return null }  // 空串 = 重置回默认
  const err = validateWorkspaceRaw(trimmed)                           // 先校验
  if (err) return err
  setConfigValue(CONFIG_KEY, trimmed)                                 // 再存
  return null
}
```

流程是"**先校验、后存储**"——校验不通过直接返回错误信息（前端弹给用户），不会把脏值写进配置。
存的是**原始字符串**（相对路径存相对、绝对存绝对），读取时才统一解析成绝对路径——**存原文、读时解析**，用户看到的输入永远是他自己填的那个样子。

---

## 5. 和 MCP 配置联动：`{{workspace}}` 占位符（L98-110）

```ts
export function resolveMcpArgs(args: string[]): string[] {
  const ws = getWorkspacePath()
  return args.map((arg) => {
    if (arg.includes('{{workspace}}')) return normalize(arg.replaceAll('{{workspace}}', ws))  // 占位符 → 工作区绝对路径
    if (arg.startsWith('./') || arg.startsWith('../')) return resolve(process.cwd(), arg)     // 相对参数 → 项目根
    return arg
  })
}
```

这是 02 篇里 MCP 连接（`establish`）在启动子进程前调用的函数。它解决一个实际问题：
**MCP 配置不能写死路径**（不然别人 clone 就跑不了），所以配置里写"占位符/相对路径"，**启动时替换成真实值**。

```json
// mcp-servers/filesystem.json（真正的样子）
"args": ["node_modules/.../index.js", "{{workspace}}"]
```

- `{{workspace}}` → 当前工作区绝对路径（用户改工作区后 filesystem 自动跟随，不用改配置）
- `./xxx` 相对参数 → 按项目根解析（子进程不保证 cwd，显式给绝对路径最稳）

**这条联动是"工作区"价值的核心**：配置即模板，运行才落地。占位符还能嵌在中间（`-p {{workspace}}/docs`）。

---

## 6. 与周边模块的配合（串联看更清楚）

| 调用方 | 怎么用工作区 |
|---|---|
| `server/index.ts` | 启动时 `ensureWorkspace()`（目录不存在就建）；`GET/PUT /api/workspace` 暴露给前端 |
| `server/routes/uploads.ts` | 附件存 `<工作区>/uploads`（实时取，改工作区即时跟随） |
| `server/agentLoop.ts` | 附件注入给模型的绝对路径 = `join(getWorkspacePath(), att.path)` |
| `server/mcp.ts` | `resolveMcpArgs`（占位符）→ filesystem 挂载根 |
| `server/terminal.ts` / `server/glob.ts` | 命令 cwd 与搜索起点必须落工作区内（越界拒绝） |
| 前端 | 输入框工具栏 `WorkspacePicker`（显示当前目录 + 点击切换）；`WorkspaceForm` 表单（校验错误/重连提示） |

**改工作区时发生了什么**（一条链路）：前端 PUT → 后端校验+存 config → `ensureWorkspace` 建目录 → 重连挂载 `{{workspace}}` 的 MCP server（filesystem 换根）→ 之后所有文件操作都用新根。**全程不用重启、不用改任何配置**。

---

## 7. 名词复盘 + 动手建议

**一句话记牢**：工作区 = Agent 的文件边界；默认兜底、可配置、危险目标（项目根/密钥目录）拒绝、MCP 用占位符跟随——所有文件操作都从这一个根出发。

动手做：
1. **切个工作区**：输入框工具栏点工作区 → 填 `my-test`（相对）→ 保存 → 在工作区里放个文件，问 agent"列出我的文件"——它只看到 `my-test` 里的内容。
2. **看被拒绝**：填 `..`（项目上级）或项目根路径 → 保存被 400 拒绝，错误信息直接告诉你为什么。
3. **看占位符生效**：打开 `mcp-servers/filesystem.json`（内容是 `{{workspace}}`），再在管理页看 filesystem 的挂载根——已是当前工作区绝对路径。
4. **改回默认**：工作区入口 → 清空输入保存 = 重置回兜底 `workspace/`。

---

## 附：关联地图

```
workspace.ts（本篇：Agent 文件权限边界）
 ├── store.ts        → config 表（存 workspacePath）
 ├── index.ts        → ensureWorkspace（启动）/ GET·PUT /api/workspace
 ├── mcp.ts          → resolveMcpArgs（{{workspace}} 占位符）
 ├── agentLoop.ts    → 附件绝对路径
 ├── routes/uploads.ts → 附件存 <工作区>/uploads
 ├── terminal.ts / glob.ts → 命令/搜索限工作区内
 └── 前端 WorkspacePicker / WorkspaceForm（输入框工具栏入口）
```

下一篇（08，完结篇）：`server/vibe.ts` —— Vibe 自治循环：目标驱动多轮执行直到收敛。
