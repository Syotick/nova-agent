import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 多个测试文件并发 import server/store.ts → db.ts 会同时打开同一个 SQLite
    // 文件并设置 WAL，产生瞬时锁冲突。文件级串行保证确定性（文件内用例仍可并行）。
    fileParallelism: false,
  },
})
