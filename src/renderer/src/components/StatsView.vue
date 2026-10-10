<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { categoriesState, pieOtherColor, incomeColor } from '../store/categories'
import { centsToYuan, dateToStr, currentMonth } from '../utils/format'

// 当前查看的月份（形如 2026-10）
const month = ref(currentMonth())
const chartType = ref('expense') // 图表视角：expense = 支出, income = 收入
const records = ref([]) // 当月账目（含收支）
const recent = ref([]) // 近 30 天账目（含收支）

// 当前图表视角下的分类
const cats = computed(() => categoriesState[chartType.value])

// 当前视角的中文名（支出/收入）
const typeLabel = computed(() => (chartType.value === 'income' ? '收入' : '支出'))

const monthLabel = computed(() => {
  const [y, m] = month.value.split('-')
  return `${y}年${Number(m)}月`
})

async function load() {
  const end = dateToStr(new Date())
  const startD = new Date()
  startD.setDate(startD.getDate() - 29)
  const start = dateToStr(startD)
  try {
    const [monthRecords, rangeRecords] = await Promise.all([
      window.api.listRecords(month.value),
      window.api.listRecordsRange(start, end)
    ])
    records.value = monthRecords
    recent.value = rangeRecords
  } catch (err) {
    ElMessage.error('读取统计数据失败：' + (err.message || '未知错误'))
  }
}

function shiftMonth(delta) {
  const [y, m] = month.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  month.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ---------- 汇总（全月，含收支） ----------
const expenseTotal = computed(() =>
  records.value.filter((r) => r.type !== 'income').reduce((s, r) => s + r.amount_cents, 0)
)
const incomeTotal = computed(() =>
  records.value.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount_cents, 0)
)
const balance = computed(() => incomeTotal.value - expenseTotal.value)
const expenseCount = computed(() => records.value.filter((r) => r.type !== 'income').length)
const incomeCount = computed(() => records.value.filter((r) => r.type === 'income').length)
const monthCount = computed(() => records.value.length)
const dayAvg = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  return Math.round(expenseTotal.value / daysInMonth)
})

// ---------- 当前视角（支出/收入）下的账目与分类 ----------
const typedRecords = computed(() =>
  records.value.filter((r) => (chartType.value === 'income' ? r.type === 'income' : r.type !== 'income'))
)
const typedRecent = computed(() =>
  recent.value.filter((r) => (chartType.value === 'income' ? r.type === 'income' : r.type !== 'income'))
)
const typedTotal = computed(() => typedRecords.value.reduce((s, r) => s + r.amount_cents, 0))

// 各分类当月合计（分）
const catTotals = computed(() => {
  const map = new Map()
  for (const r of typedRecords.value) map.set(r.category, (map.get(r.category) || 0) + r.amount_cents)
  return map
})

// 分类排行：当前视角下有支出的分类，金额从高到低
const ranking = computed(() =>
  cats.value
    .map((c) => ({ ...c, amount: catTotals.value.get(c.name) || 0 }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
)
const rankMax = computed(() => (ranking.value.length ? ranking.value[0].amount : 0))

// 饼图数据：前 8 个色槽分类单独成片（按 slot 排序，保证相邻色块对比清晰），
// 第 9 个及以后分类并入"其他"灰色切片（收入内置分类 slot 1-5，自定义从 6 起，规则天然兼容）
const pieData = computed(() => {
  const slices = []
  let other = 0
  for (const c of cats.value) {
    const amt = catTotals.value.get(c.name) || 0
    if (amt <= 0) continue
    if (c.slot <= 8) {
      slices.push({ slot: c.slot, name: c.name, icon: c.icon, value: amt, itemStyle: { color: c.color } })
    } else {
      other += amt
    }
  }
  slices.sort((a, b) => a.slot - b.slot)
  if (other > 0) {
    slices.push({ slot: 9, name: '其他', icon: '📦', value: other, itemStyle: { color: pieOtherColor } })
  }
  return slices
})

// ---------- 图表 ----------
const pieEl = ref(null)
const trendEl = ref(null)
let pieChart = null
let trendChart = null

function renderPie() {
  if (!pieChart) return
  pieChart.setOption(
    {
      title: {
        text: `¥${centsToYuan(typedTotal.value)}\n本月总${typeLabel.value}`,
        left: 'center',
        top: '36%',
        textAlign: 'center',
        textStyle: { fontSize: 18, fontWeight: 800, color: '#5a4632', lineHeight: 24 }
      },
      tooltip: {
        trigger: 'item',
        formatter: (p) => `${p.data.icon} ${p.name}<br/>¥${centsToYuan(p.value)}（${p.percent}%）`
      },
      series: [
        {
          type: 'pie',
          radius: ['46%', '70%'],
          center: ['50%', '50%'],
          itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 4 },
          data: pieData.value
        }
      ]
    },
    true
  )
}

function renderTrend() {
  if (!trendChart) return
  // 近 30 天每日合计（没有记录的日子补 0）
  const dailyMap = new Map()
  for (const r of typedRecent.value) dailyMap.set(r.date, (dailyMap.get(r.date) || 0) + r.amount_cents)
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = dateToStr(d)
    days.push({ label: ds.slice(5).replace('-', '/'), value: dailyMap.get(ds) || 0 })
  }
  const isIncome = chartType.value === 'income'
  const lineColor = isIncome ? incomeColor : '#2a78d6'
  const rgb = isIncome ? '27,175,122' : '42,120,214'
  trendChart.setOption(
    {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: '#c3c2b7', type: 'dashed' } },
        formatter: (params) => `${params[0].axisValue}<br/>${typeLabel.value} ¥${centsToYuan(params[0].value)}`
      },
      grid: { left: 8, right: 8, top: 24, bottom: 4, containLabel: true },
      xAxis: {
        type: 'category',
        data: days.map((d) => d.label),
        axisLine: { lineStyle: { color: '#c3c2b7' } },
        axisTick: { show: false },
        axisLabel: { color: '#898781', interval: 4, fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#e1e0d9' } },
        axisLabel: { color: '#898781', fontSize: 11, formatter: (v) => (v === 0 ? '0' : v / 100) }
      },
      series: [
        {
          type: 'line',
          data: days.map((d) => d.value),
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: lineColor },
          itemStyle: { color: lineColor },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: `rgba(${rgb},0.18)` },
              { offset: 1, color: `rgba(${rgb},0)` }
            ])
          }
        }
      ]
    },
    true
  )
}

function onResize() {
  pieChart?.resize()
  trendChart?.resize()
}

watch(month, load)
watch([records, recent, chartType], () => {
  renderPie()
  renderTrend()
})

onMounted(() => {
  nextTick(() => {
    pieChart = echarts.init(pieEl.value)
    trendChart = echarts.init(trendEl.value)
    window.addEventListener('resize', onResize)
    load()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  pieChart?.dispose()
  trendChart?.dispose()
})
</script>

<template>
  <div>
    <h2 class="qq-page-title">统计分析</h2>

    <!-- 月份切换 + 收支视角切换 -->
    <div class="toolbar">
      <div class="month-nav">
        <button class="month-btn" @click="shiftMonth(-1)">‹</button>
        <span class="month-label">{{ monthLabel }}</span>
        <button class="month-btn" @click="shiftMonth(1)">›</button>
      </div>
      <button class="today-btn" @click="month = currentMonth()">回到本月</button>
      <el-segmented
        v-model="chartType"
        class="chart-type"
        :options="[
          { label: '支出', value: 'expense' },
          { label: '收入', value: 'income' }
        ]"
      />
    </div>

    <!-- 汇总卡片 -->
    <div class="stat-tiles">
      <div class="qq-card tile">
        <div class="tile-label">本月支出</div>
        <div class="tile-value">¥{{ centsToYuan(expenseTotal) }}</div>
        <div class="tile-sub">日均 ¥{{ centsToYuan(dayAvg) }}</div>
      </div>
      <div class="qq-card tile">
        <div class="tile-label">本月收入</div>
        <div class="tile-value income">¥{{ centsToYuan(incomeTotal) }}</div>
      </div>
      <div class="qq-card tile">
        <div class="tile-label">本月结余</div>
        <div class="tile-value" :class="balance >= 0 ? 'income' : 'danger'">
          {{ balance < 0 ? '-¥' : '¥' }}{{ centsToYuan(Math.abs(balance)) }}
        </div>
      </div>
      <div class="qq-card tile">
        <div class="tile-label">记账笔数</div>
        <div class="tile-value">{{ monthCount }}<span class="tile-unit">笔</span></div>
        <div class="tile-sub">支出 {{ expenseCount }} · 收入 {{ incomeCount }}</div>
      </div>
    </div>

    <!-- 饼图 + 排行 -->
    <div class="charts-row">
      <div class="qq-card half">
        <div class="chart-title">分类占比</div>
        <div class="pie-wrap">
          <div ref="pieEl" class="pie-chart"></div>
          <div v-if="pieData.length === 0" class="chart-empty">本月还没有{{ typeLabel }}记录</div>
        </div>
      </div>
      <div class="qq-card half">
        <div class="chart-title">分类排行</div>
        <div v-if="ranking.length === 0" class="chart-empty">本月还没有{{ typeLabel }}记录</div>
        <div v-else class="rank-list">
          <div v-for="c in ranking" :key="c.name" class="rank-item">
            <span class="rank-icon" :style="{ background: c.color }">{{ c.icon }}</span>
            <span class="rank-name">{{ c.name }}</span>
            <div class="rank-bar-wrap">
              <div
                class="rank-bar"
                :style="{ width: (c.amount / rankMax) * 100 + '%', background: c.color }"
              ></div>
            </div>
            <span class="rank-percent">{{ ((c.amount / typedTotal) * 100).toFixed(1) }}%</span>
            <span class="rank-amount">¥{{ centsToYuan(c.amount) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 30 天趋势 -->
    <div class="qq-card trend-card">
      <div class="chart-title">近 30 天{{ typeLabel }}趋势</div>
      <div ref="trendEl" class="trend-chart"></div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--qq-card);
  border-radius: 12px;
  padding: 6px 10px;
  box-shadow: 0 4px 20px rgba(184, 138, 84, 0.08);
}

.month-btn {
  border: none;
  background: transparent;
  font-size: 18px;
  color: var(--qq-primary);
  cursor: pointer;
  padding: 0 8px;
  border-radius: 8px;
}

.month-btn:hover {
  background: rgba(201, 127, 69, 0.1);
}

.month-label {
  font-weight: 700;
  min-width: 90px;
  text-align: center;
}

.today-btn {
  border: 1.5px solid var(--qq-border);
  background: var(--qq-card);
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--qq-text-sub);
  cursor: pointer;
}

.today-btn:hover {
  border-color: var(--qq-primary);
  color: var(--qq-primary);
}

.chart-type {
  margin-left: auto;
}

.stat-tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.tile {
  padding: 18px 20px;
}

.tile-label {
  font-size: 13px;
  color: var(--qq-text-sub);
  margin-bottom: 6px;
}

.tile-value {
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.tile-value.income {
  color: #1baf7a;
}

.tile-value.danger {
  color: var(--qq-danger);
}

.tile-sub {
  font-size: 12px;
  color: var(--qq-text-sub);
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}

.tile-unit {
  font-size: 13px;
  font-weight: 600;
  color: var(--qq-text-sub);
  margin-left: 4px;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.chart-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 8px;
}

.pie-wrap {
  position: relative;
}

.pie-chart {
  height: 300px;
}

.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--qq-text-sub);
  font-size: 14px;
  height: 300px;
}

.rank-list {
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
}

.rank-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.rank-name {
  width: 64px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
}

.rank-bar-wrap {
  flex: 1;
  height: 6px;
  background: #f2ecdf;
  border-radius: 3px;
  overflow: hidden;
}

.rank-bar {
  height: 100%;
  border-radius: 3px;
  min-width: 4px;
}

.rank-percent {
  width: 44px;
  text-align: right;
  font-size: 12px;
  color: var(--qq-text-sub);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.rank-amount {
  width: 76px;
  text-align: right;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.trend-card {
  margin-bottom: 16px;
}

.trend-chart {
  height: 240px;
}
</style>
