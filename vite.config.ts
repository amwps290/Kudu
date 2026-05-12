import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 自动导入 Vue 相关函数
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/auto-imports.d.ts',
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

