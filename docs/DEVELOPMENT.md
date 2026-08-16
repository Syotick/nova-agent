# Nova Agent 开发指南（零基础版）

> 这份文档假设你**完全不懂 Node.js**，从零开始教你怎么把项目跑起来、怎么改、怎么提交。
> 每步都有验证方法——照做就能知道自己对不对。

---

## 0. 你需要准备什么

| 东西 | 说明 | 怎么检查装没装 |
|---|---|---|
| **Node.js 22+** | 运行本项目的基础环境（就是"跑代码的引擎"） | 打开终端输 `node -v`，能显示 v22.x 以上即可 |
| **Git** | 版本管理工具 | 输 `git --version` |
| **一个代码编辑器** | 推荐 VS Code | — |
| **DeepSeek API Key** | 让 AI 说话的口令 | 到 platform.deepseek.com 注册获取 |

> **终端是什么？** Windows 上叫"命令提示符"或 PowerShell，就是那个黑窗口/蓝窗口，在里面敲命令。

---

## 1. 第一次把项目跑起来（约 10 分钟）

### 1.1 安装 Node.js

1. 打开 https://nodejs.org/ ，下载 **LTS 版本**（22.x 或更高）
2. 一路"下一步"装完
3. 验证：打开终端，输入 `node -v` 回车，看到 `v22.x.x` 就成功了

> 为什么要求 22+？本项目用 Node 内置的 SQLite 数据库（`node:sqlite`），这个功能从 Node 22.5 开始才有。好处是**不用装任何数据库软件**。

### 1.2 拿到项目代码

如果你有项目文件夹，直接打开；如果没有：

```bash
git clone https://github.com/Syotick/nova-agent.git
cd nova-agent
```

### 1.3 安装依赖

```bash
npm install
```

> **npm 是什么？** Node.js 自带的"应用商店"。`npm install` = 把项目需要的所有"零件"下载到 `node_modules/` 文件夹。
> 第一次会比较慢（要下载几百 MB 的浏览器工具），耐心等。
> 以后每次拿到新代码，如果提示缺东西，重新跑一次即可。

### 1.4 配置 API Key（二选一）

**方式 A：网页配置（推荐，最简单）**
1. 先启动项目（见 1.5），打开 http://localhost:5173
2. 点左侧边栏**右下角的 🔑 按钮**
3. 粘贴你的 DeepSeek API Key，保存

**方式 B：环境变量**
```bash
# Windows PowerShell
$env:DEEPSEEK_API_KEY = "sk-你的key"
```

> Key 存在项目**外面**（`.nova-agent-key.json`），AI 的工具摸不到它，安全。

### 1.5 启动项目

```bash
npm run dev
```

看到类似输出就成功了：

```
[server] nova-agent API listening on http://localhost:8787
```

然后浏览器打开 **http://localhost:5173** —— 你应该能看到深色主题的聊天界面。

> `npm run dev` = "启动开发模式"。它同时启动两个东西：
> - 前端开发服务器（端口 5173）：你看到的网页
> - 后端 API 服务（端口 8787）：真正干活的程序
>
> **想停止：** 在终端按 `Ctrl + C`。

---

## 2. 常用命令速查

| 命令 | 干什么 | 什么时候用 |
|---|---|---|
| `npm run dev` | 启动开发模式（前后端一起） | 日常开发 |
| `npm run build` | 构建生产版本（输出到 `dist/`） | 发布前验证 |
| `npx tsc --noEmit` | 类型检查（查代码有没有"语法病"） | 改完代码必跑 |
| `npm install` | 安装/更新依赖 | 新克隆项目、依赖变化后 |
| `Ctrl + C` | 停止正在运行的命令 | 想关掉服务 |

**开发铁律：改完代码，跑这两条再提交：**

```bash
npx tsc --noEmit   # 类型检查
npm run build      # 前端构建
```

两条都通过（没有红色报错）才能提交。CI 也会自动检查，没通过 PR 不能合并。

---

## 3. 项目里都有什么（30 秒认识结构）

```
nova-agent/
├─ src/       ← 前端（网页界面代码）
├─ server/    ← 后端（服务代码）
├─ skills/    ← 技能文件（给 AI 看的操作手册）
├─ mcp-servers/ ← 工具配置（AI 的"外接设备"）
├─ data/      ← 数据库（自动生成，不用管，别提交）
├─ workspace/ ← AI 专用工作区（AI 读写文件都在这里）
└─ docs/      ← 文档（先看这个）
```

每个文件干什么，看 [ARCHITECTURE.md](./ARCHITECTURE.md) 第 5 节的"目录地图"。

---

## 4. 常见任务教程

### 4.1 想新增一个"AI 助手"（零代码）

1. 打开网页，左侧边栏 **Agents** 区点 **＋**
2. 填名字、人设（比如"你是炒股分析师"）
3. 勾选要用的工具和技能
4. 创建完成，点它就能对话

### 4.2 想给 AI 加"技能"（零代码）

**方式 A：网页**
1. 侧边栏 → 📚 **技能管理**
2. 点"＋ 新建技能"，填表单（名称/简介/使用时机/正文）
3. 创建后，在 Agent 配置里勾选它

**方式 B：手动（懂一点文件操作时）**
在 `skills/` 下建文件夹，里面放 `SKILL.md`：

```markdown
---
name: 技能名
description: 一句话简介
when_to_use: 什么时候该用它
---
这里是操作步骤正文，AI 会把它当操作手册
```

### 4.3 想给 AI 加"工具"（零代码）

1. 在 `mcp-servers/` 下新建一个 JSON 文件（或复制现有文件改）
2. 内容格式：

```json
{
  "id": "我的工具",
  "name": "我的工具",
  "command": "npx",
  "args": ["-y", "某个-mcp-server包名"],
  "timeoutMs": 30000
}
```

3. 重启后端（`Ctrl + C` 再 `npm run dev`）
4. 网页 → 🧰 **工具浏览** 确认工具出现；在 Agent 配置里勾选

### 4.4 想加"定时任务"（零代码）

1. 网页 → ⏱️ **定时任务** → ＋ 新建任务
2. 填：任务名、选哪个 Agent、cron 表达式、任务指令
3. 例：`*/5 * * * *` + "检查最新行情并总结" = 每 5 分钟跑一次
4. 任务在**专用会话**里执行，上下文连续，结果在任务卡片上能看到

### 4.5 想改界面样式

- 全局颜色/主题：`src/styles.css`（里面有注释）
- 某个界面的样式：对应 `.vue` 文件的 `<style>` 部分

### 4.6 想加一个后端接口

1. 找到对应的路由文件（`server/routes/` 下），比如加会话相关接口就去 `sessions.ts`
2. 仿照已有的接口写法加一个路由（`router.get('/xxx', ...)`）
3. 前端调用：在 `src/api.ts` 加一个函数（所有请求都从这里发）
4. 跑 `npx tsc --noEmit` 和 `npm run build` 验证

---

## 5. 提交代码的规矩（Conventional Commits）

提交信息必须符合格式，否则自动发版工具看不懂：

```
类型: 简短描述
```

| 类型 | 什么时候用 | 例子 |
|---|---|---|
| `feat:` | 新功能 | `feat: 新增股票行情工具` |
| `fix:` | 修 Bug | `fix: 修复流式中断问题` |
| `docs:` | 改文档 | `docs: 更新使用说明` |
| `refactor:` | 重构（行为不变） | `refactor: 拆分存储层` |
| `chore:` | 杂务（依赖/构建） | `chore: 升级依赖` |
| `test:` | 加测试 | `test: 补充 cron 解析用例` |

```bash
git add .
git commit -m "feat: 新增股票行情工具"
git push origin main
```

> 为什么这么重要？GitHub 上的 release-please 会自动分析提交记录：有 `feat:` 就升 minor 版本（0.1.0 → 0.2.0），有 `fix:` 就升 patch（0.1.0 → 0.1.1），破坏性变更（`feat!:`）升 major。**提交规范 = 免费自动发版。**

---

## 6. 常见问题排查（FAQ）

**Q：`npm install` 报错 / 特别慢**
A：国内网络可能需要镜像。执行 `npm config set registry https://registry.npmmirror.com` 再试。

**Q：打开网页一片空白 / 接口报错**
A：确认终端里两个服务都起来了（前端 5173、后端 8787）。后端报错会直接显示在终端里。

**Q：`[server] DEEPSEEK_API_KEY set: false` 且对话报"API key is missing"**
A：没配 key。按 1.4 配置（网页 🔑 按钮或环境变量）。

**Q：改了后端代码没生效**
A：`tsx` 开发模式一般会自动重启；如果没生效，`Ctrl + C` 重新 `npm run dev`。

**Q：数据在哪？想备份**
A：所有数据在 `data/nova-agent.db`（一个文件），备份它即可。

**Q：AI 说"工具不存在"**
A：`mcp-servers/` 的配置在启动时加载，改完必须重启后端。

**Q：页面显示"会话过长"**
A：这是自动压缩在干活，不用管，AI 自己会总结旧对话。

---

## 7. 提交前检查清单

- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 通过
- [ ] 提交信息符合规范（`feat:` / `fix:` / `docs:` ...）
- [ ] 没把 `data/`、`workspace/`、key 文件提交上去（`git status` 确认）
