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
    // Tauri on Windows uses the user's WebView2 runtime. Avoid emitting syntax
    // that is only guaranteed by the latest Chromium releases.
    target: 'es2020',
    minify: 'esbuild',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('monaco-editor')) return 'monaco-editor'
          if (id.includes('ag-grid')) return 'ag-grid'
        },
      },
    },
  },

  // Monaco Editor worker 配置
  define: {
    global: 'globalThis',
  },
})
