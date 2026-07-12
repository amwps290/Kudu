import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// 独立于 vite.config.ts：单测仅覆盖纯函数（迁移计划 D11），
// 不需要加载 React 插件链，只需对齐 @ 路径别名。
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
