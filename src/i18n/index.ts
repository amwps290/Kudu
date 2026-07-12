import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from '@/locales/zh-CN.json'
import enUS from '@/locales/en-US.json'
import type { Language } from '@/types/settings'

/**
 * 与 Vue 版 src/i18n.ts 保持同一初始语言回退链：
 * localStorage.language → navigator.language → en-US。
 * 注意：language 在 localStorage 中以裸字符串存储（无 JSON 引号），
 * 与 utils/storage.ts 的 TypedStorage 序列化行为一致。
 */
export function resolveInitialLanguage(): Language {
  const stored = localStorage.getItem('language')
  if (stored === 'zh-CN' || stored === 'en-US') return stored
  return navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US'
}

void i18next.use(initReactI18next).init({
  lng: resolveInitialLanguage(),
  fallbackLng: 'en-US',
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  // 现有翻译 JSON 沿用 vue-i18n 的单花括号插值（{name}），
  // 配置定界符即可零改动复用（已验证 i18next v26 支持）
  interpolation: {
    prefix: '{',
    suffix: '}',
    escapeValue: false, // React 自带 XSS 转义
  },
  // 项目不使用 i18next 命名空间；关闭 ':' 解析，防止翻译 key/文案中的冒号被误解析
  nsSeparator: false,
})

/**
 * 切换语言并持久化（裸字符串写入，与 Vue 版共享同一 key）。
 * Slice 4 后由 appStore 的 setLanguage 调用本函数。
 */
export function setLocale(locale: Language) {
  localStorage.setItem('language', locale)
  void i18next.changeLanguage(locale)
}

export default i18next
