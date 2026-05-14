import { createI18n } from 'vue-i18n'
import en from './en'
import zhCN from './zhCN'

const i18n = createI18n({
  legacy: false,
  locale: 'zhCN',
  fallbackLocale: 'en',
  messages: { en, zhCN },
})

export default i18n
