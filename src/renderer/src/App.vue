<script setup>
import { ref, onMounted } from 'vue'
import HomeView from './components/HomeView.vue'
import BillsView from './components/BillsView.vue'
import StatsView from './components/StatsView.vue'
import SettingsView from './components/SettingsView.vue'
import { refreshCategories } from './store/categories'

// 启动时从数据库加载分类（所有页面共用这一份数据）
onMounted(() => {
  refreshCategories().catch(() => {})
})

// 四个主页面：记一笔 / 账单明细 / 统计分析 / 设置
const views = [
  { key: 'home', label: '记一笔', icon: '✏️', comp: HomeView },
  { key: 'bills', label: '账单明细', icon: '📒', comp: BillsView },
  { key: 'stats', label: '统计分析', icon: '📊', comp: StatsView },
  { key: 'settings', label: '设置', icon: '⚙️', comp: SettingsView }
]

const current = ref('home')
const currentView = () => views.find((v) => v.key === current.value).comp
</script>

<template>
  <div class="layout">
    <!-- 左侧导航栏 -->
    <aside class="sidebar">
      <div class="logo">
        <span class="logo-icon">🍪</span>
        <span class="logo-text">曲奇记账</span>
      </div>
      <nav class="nav">
        <button
          v-for="v in views"
          :key="v.key"
          class="nav-item"
          :class="{ active: current === v.key }"
          @click="current = v.key"
        >
          <span class="nav-icon">{{ v.icon }}</span>
          <span>{{ v.label }}</span>
        </button>
      </nav>
      <div class="sidebar-footer">数据保存在本机 · 安全放心</div>
    </aside>

    <!-- 主内容区 -->
    <main class="content">
      <component :is="currentView()" />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
}

.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #fff7e8;
  border-right: 1px solid var(--qq-border);
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 20px;
}

.logo-icon {
  font-size: 28px;
}

.logo-text {
  font-size: 20px;
  font-weight: 800;
  color: var(--qq-text);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: none;
  background: transparent;
  border-radius: 12px;
  font-size: 15px;
  color: var(--qq-text-sub);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.nav-item:hover {
  background: rgba(201, 127, 69, 0.08);
  color: var(--qq-text);
}

.nav-item.active {
  background: var(--qq-primary);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(201, 127, 69, 0.35);
}

.sidebar-footer {
  font-size: 11px;
  color: var(--qq-text-sub);
  text-align: center;
  padding-top: 12px;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
</style>
