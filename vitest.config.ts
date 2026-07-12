import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// 独立于 vite.config.ts：单测仅覆盖纯函数（迁移计划 D11），
// 不需要加载 Vue/React 插件链，只需对齐 @ / @react 路径别名。
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@react': resolve(__dirname, 'src-react'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src-react/**/*.test.ts'],
    environment: 'node',
  },
})
