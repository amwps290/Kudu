import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // 路径别名
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // Tauri 配置
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  // 构建优化
  build: {
    target: 'esnext',
    minify: 'esbuild',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('monaco-editor')) return 'monaco-editor'
          if (id.includes('ag-grid')) return 'ag-grid'
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) return 'react-vendor'
          if (id.includes('/node_modules/antd/') || id.includes('@ant-design')) return 'ant-design'
          if (id.includes('@tauri-apps')) return 'tauri'
          if (id.includes('@iconify')) return 'iconify'
        },
      },
    },
  },

  // Monaco Editor worker 配置
  define: {
    global: 'globalThis',
  },
})
