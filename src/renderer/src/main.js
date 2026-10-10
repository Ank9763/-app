// 注意顺序：Element Plus 样式在前，曲奇主题覆盖在后（后面的覆盖前面的）
import 'element-plus/dist/index.css'
import './assets/main.css'

import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'

const app = createApp(App)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
