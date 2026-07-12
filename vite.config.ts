import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // React 迁移并行入口（react.html -> src-react/**），只处理 src-react 下的 tsx/ts
    react({
      include: /[\\/]src-react[\\/].*\.[tj]sx?$/,
    }),
    // 自动导入 Vue 相关函数（仅限旧 src 目录）
    // 注意：自定义 exclude 会覆盖插件默认排除项，必须把 node_modules/.git 加回来，
    // 否则 auto-import 会向压缩过的第三方包注入 Vue 导入（如 vue-types 的单字母变量 h）
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/auto-imports.d.ts',
      exclude: [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]src-react[\\/]/],
    }),
    // 自动导入 Ant Design Vue 组件
    Components({
      resolvers: [
        AntDesignVueResolver({
          importStyle: false, // css in js
        }),
      ],
      dts: 'src/components.d.ts',
    }),
  ],

  // 路径别名
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@react': resolve(__dirname, 'src-react'),
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
      // 迁移期双入口：index.html = Vue 主线，react.html = React 并行版
      input: {
        index: resolve(__dirname, 'index.html'),
        react: resolve(__dirname, 'react.html'),
      },
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
          if (id.includes('ant-design-vue') || id.includes('@ant-design/icons-vue')) return 'ant-design'
          if (id.includes('vxe-table') || id.includes('vxe-pc-ui') || id.includes('xe-utils')) return 'vxe'
          if (id.includes('@tauri-apps')) return 'tauri'
          if (id.includes('@iconify')) return 'iconify'
          if (id.includes('vue-virtual-scroller')) return 'virtual-scroller'
          if (id.includes('vue-i18n')) return 'vue-i18n'
          if (id.includes('vue-router')) return 'vue-router'
          if (id.includes('pinia')) return 'pinia'
          if (id.includes('/node_modules/vue/')) return 'vue-core'
        },
      },
    },
  },

  // Monaco Editor worker 配置
  define: {
    global: 'globalThis',
  },
  
  optimizeDeps: {
    include: ['monaco-editor/esm/vs/language/typescript/ts.worker'],
  },
})

