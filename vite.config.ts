import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.NOVA_API_PROXY ?? 'http://localhost:8787',
    },
  },
  build: {
    // 代码分割：两个层面
    // 1) 非首屏视图（管理页/轨迹）已在 MainPane 用 React.lazy 懒加载成独立 chunk
    // 2) 这里把大体积第三方库拆成独立 vendor chunk——首屏只加载核心 + 用到的库，
    //    且 vendor 内容不常变，可被浏览器长期缓存（本地重启不重复下载）
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/, priority: 20, minSize: 50_000 },
            { name: 'vendor-radix', test: /node_modules[\\/]@radix-ui[\\/]/, priority: 10, minSize: 20_000 },
            { name: 'vendor-lucide', test: /node_modules[\\/]lucide-react[\\/]/, priority: 10, minSize: 20_000 },
            { name: 'vendor-markdown', test: /node_modules[\\/](markdown-it|linkify-it|mdurl|uc\.micro|entities)[\\/]/, priority: 10, minSize: 20_000 },
            { name: 'vendor-highlight', test: /node_modules[\\/]highlight\.js[\\/]/, priority: 10, minSize: 20_000 },
            { name: 'vendor-misc', test: /node_modules[\\/](clsx|tailwind-merge|class-variance-authority)[\\/]/, priority: 5, minSize: 10_000 },
          ],
        },
      },
    },
  },
})
