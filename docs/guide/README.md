# 读代码指南（Code Walkthrough）

面向初学者的逐文件代码走读：每个核心文件一篇，先讲清名词、再逐段读代码、最后给动手练习。目标是**读得懂 + 跑得动 + 改得动**。

## 目录

| 篇 | 文件 | 主题 | 状态 |
|---|---|---|---|
| [01](01-agent-loop.md) | `server/agentLoop.ts` | Agent 循环：一个 agent 怎么转起来 | ✅ |
| [02](02-mcp.md) | `server/mcp.ts` | MCP 客户端：怎么把外部工具变成 agent 的手 | ✅ |
| [03](03-terminal.md) | `server/terminal.ts` | run_command：agent 的双手 + 进程生命周期（含 Windows 平台坑） | ✅ |
| [04](04-skills.md) | `server/skills.ts` | 技能系统：SKILL.md 两级加载 | ✅ |
| [05](05-memory.md) | `server/memory.ts` | 跨会话记忆：LRU + 去重合并 | ✅ |
| 06 | `server/compact.ts` | 上下文压缩：token 感知 + 兜底 | 规划中 |
| 07 | `server/workspace.ts` | 工作区：agent 的文件权限边界 | 规划中 |
| 08 | `server/vibe.ts` | Vibe 自治循环：目标驱动多轮执行 | 规划中 |

## 每一篇的结构

1. **术语速查**：先讲清这篇会碰到的新词（大白话，不含糊）
2. **位置图**：这个文件在整个项目里接什么、被谁调
3. **逐段走读**：带行号/函数名的代码讲解 + "为什么这么设计"
4. **名词复盘 + 动手建议**：怎么改、怎么验证、怎么玩坏再修好
5. **关联地图**：下一篇读什么

> 建议阅读顺序：01 → 02 → 03 ……（从最核心向外扩散）。
> 遇到黑话先翻对应篇的术语表；没 covered 的欢迎提 issue。
