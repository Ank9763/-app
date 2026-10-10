<script setup>
import { ref, computed, reactive, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { categoriesState, payMethods } from '../store/categories'
import { centsToYuan, dateToStr, currentMonth, weekdayLabel } from '../utils/format'

// 支出/收入各一套分类（含停用的；停用分类的历史账目照常显示、照常参与筛选和编辑）
const expenseCats = computed(() => categoriesState.expense)
const incomeCats = computed(() => categoriesState.income)

// 当前查看的月份（形如 2026-10）
const month = ref(currentMonth())
const filterType = ref('all') // 全部 / 支出 / 收入
const filterCategory = ref('') // 一级分类筛选，'' = 全部
const records = ref([])
const loading = ref(false)

const monthLabel = computed(() => {
  const [y, m] = month.value.split('-')
  return `${y}年${Number(m)}月`
})

// 全月合计（不受分类筛选影响）
const expenseTotal = computed(() =>
  records.value.filter((r) => r.type !== 'income').reduce((s, r) => s + r.amount_cents, 0)
)
const incomeTotal = computed(() =>
  records.value.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount_cents, 0)
)
const balance = computed(() => incomeTotal.value - expenseTotal.value)

const emptyHint = computed(() => {
  if (filterType.value === 'income') return '去"记一笔"页面记下第一笔收入吧'
  if (filterType.value === 'expense') return '去"记一笔"页面记下第一笔支出吧'
  return '去"记一笔"页面记下第一笔账吧'
})

// 按天分组：日期倒序；每组带支出/收入两个小计
const groups = computed(() => {
  const map = new Map()
  for (const r of records.value) {
    if (filterType.value !== 'all' && r.type !== filterType.value) continue
    if (filterCategory.value && r.category !== filterCategory.value) continue
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date).push(r)
  }
  return [...map.entries()].map(([date, items]) => ({
    date,
    weekday: weekdayLabel(date),
    expense: items.filter((r) => r.type !== 'income').reduce((s, r) => s + r.amount_cents, 0),
    income: items.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount_cents, 0),
    items
  }))
})

async function load() {
  loading.value = true
  try {
    records.value = await window.api.listRecords(month.value)
  } catch (err) {
    ElMessage.error('读取账单失败：' + (err.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

function shiftMonth(delta) {
  const [y, m] = month.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  month.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

watch(month, load)
onMounted(load)

// 分类信息（图标、颜色），按收支类型查，找不到时给兜底
function catOf(name, type) {
  const list = type === 'income' ? incomeCats.value : expenseCats.value
  return list.find((c) => c.name === name) || { icon: '📦', color: '#a8a29e' }
}

// ---------- 删除 ----------
async function remove(r) {
  try {
    await ElMessageBox.confirm(`确定删除这笔「${r.subcategory} ¥${centsToYuan(r.amount_cents)}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return // 用户取消
  }
  try {
    await window.api.deleteRecord(r.id)
    ElMessage.success('已删除')
    load()
  } catch (err) {
    ElMessage.error('删除失败：' + (err.message || '未知错误'))
  }
}

// ---------- 修改 ----------
const editVisible = ref(false)
const editSaving = ref(false)
const editForm = reactive({
  id: 0,
  type: 'expense',
  amount: '',
  category: '',
  subcategory: '',
  date: new Date(),
  payMethod: '',
  note: ''
})

// 编辑弹窗里按记录的类型取对应分类
const editCats = computed(() => (editForm.type === 'income' ? incomeCats.value : expenseCats.value))
const editSubs = computed(() => {
  const c = editCats.value.find((c) => c.name === editForm.category)
  return c ? c.children.map((s) => s.name) : []
})

function openEdit(r) {
  editForm.id = r.id
  editForm.type = r.type || 'expense'
  editForm.amount = centsToYuan(r.amount_cents)
  editForm.category = r.category
  editForm.subcategory = r.subcategory
  editForm.date = new Date(r.date + 'T00:00:00')
  editForm.payMethod = r.pay_method
  editForm.note = r.note
  editVisible.value = true
}

async function saveEdit() {
  const amount = Number(editForm.amount)
  if (!editForm.amount || !Number.isFinite(amount) || amount <= 0) {
    ElMessage.warning('请输入正确的金额')
    return
  }
  if (!editForm.category || !editForm.subcategory) {
    ElMessage.warning('请选择分类')
    return
  }
  editSaving.value = true
  try {
    await window.api.updateRecord(editForm.id, {
      amountCents: Math.round(amount * 100),
      category: editForm.category,
      subcategory: editForm.subcategory,
      date: dateToStr(editForm.date),
      payMethod: editForm.payMethod,
      note: editForm.note
    })
    ElMessage.success('已保存修改')
    editVisible.value = false
    load()
  } catch (err) {
    ElMessage.error('保存失败：' + (err.message || '未知错误'))
  } finally {
    editSaving.value = false
  }
}
</script>

<template>
  <div v-loading="loading">
    <h2 class="qq-page-title">账单明细</h2>

    <!-- 月份切换 + 收支筛选 + 分类筛选 -->
    <div class="toolbar">
      <div class="month-nav">
        <button class="month-btn" @click="shiftMonth(-1)">‹</button>
        <span class="month-label">{{ monthLabel }}</span>
        <button class="month-btn" @click="shiftMonth(1)">›</button>
      </div>
      <div class="month-total">
        <span class="sum-item">支出 <b class="sum-expense">¥{{ centsToYuan(expenseTotal) }}</b></span>
        <span class="sum-item">收入 <b class="sum-income">¥{{ centsToYuan(incomeTotal) }}</b></span>
        <span class="sum-item">
          结余
          <b :class="balance >= 0 ? 'sum-income' : 'sum-danger'"
            >{{ balance < 0 ? '-¥' : '¥' }}{{ centsToYuan(Math.abs(balance)) }}</b
          >
        </span>
      </div>
      <el-segmented
        v-model="filterType"
        :options="[
          { label: '全部', value: 'all' },
          { label: '支出', value: 'expense' },
          { label: '收入', value: 'income' }
        ]"
      />
      <el-select v-model="filterCategory" placeholder="全部分类" clearable class="filter">
        <el-option label="全部分类" value="" />
        <el-option-group label="支出分类">
          <el-option v-for="c in expenseCats" :key="c.name" :label="c.icon + ' ' + c.name" :value="c.name" />
        </el-option-group>
        <el-option-group label="收入分类">
          <el-option v-for="c in incomeCats" :key="c.name" :label="c.icon + ' ' + c.name" :value="c.name" />
        </el-option-group>
      </el-select>
    </div>

    <!-- 空状态 -->
    <div v-if="groups.length === 0" class="qq-card empty">
      <div class="empty-icon">🍪</div>
      <p>这个月还没有记账</p>
      <p class="sub">{{ emptyHint }}</p>
    </div>

    <!-- 按天分组的账单 -->
    <div v-for="g in groups" :key="g.date" class="day-group">
      <div class="day-header">
        <div class="day-date">
          <span class="day-main">{{ g.date.slice(5).replace('-', '月') }}日</span>
          <span class="day-week">周{{ g.weekday }}</span>
        </div>
        <div class="day-total">
          <span v-if="g.expense > 0" class="sum-item">支出 ¥{{ centsToYuan(g.expense) }}</span>
          <span v-if="g.income > 0" class="sum-item">收入 ¥{{ centsToYuan(g.income) }}</span>
        </div>
      </div>
      <div class="qq-card day-card">
        <div v-for="r in g.items" :key="r.id" class="bill-item">
          <div class="bill-icon" :style="{ background: catOf(r.category, r.type).color }">
            {{ catOf(r.category, r.type).icon }}
          </div>
          <div class="bill-info">
            <div class="bill-name">
              {{ r.subcategory }}
              <span class="bill-cat">{{ r.category }}</span>
              <span v-if="r.pay_method" class="bill-pay">{{ r.pay_method }}</span>
            </div>
            <div v-if="r.note" class="bill-note">{{ r.note }}</div>
          </div>
          <div class="bill-right">
            <div class="bill-amount" :class="{ income: r.type === 'income' }">
              {{ r.type === 'income' ? '+' : '-' }}¥{{ centsToYuan(r.amount_cents) }}
            </div>
            <div class="bill-ops">
              <button class="op-btn" title="修改" @click="openEdit(r)">✏️</button>
              <button class="op-btn" title="删除" @click="remove(r)">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 修改弹窗 -->
    <el-dialog v-model="editVisible" :title="`修改这笔${editForm.type === 'income' ? '收入' : '支出'}`" width="420px">
      <div class="edit-row">
        <span class="field-label">类型</span>
        <el-tag :type="editForm.type === 'income' ? 'success' : 'warning'" effect="plain">
          {{ editForm.type === 'income' ? '收入' : '支出' }}
        </el-tag>
        <span class="type-tip">（类型不可修改）</span>
      </div>
      <div class="edit-row">
        <div class="field-label">金额（元）</div>
        <el-input v-model="editForm.amount" type="number" min="0" step="0.01" placeholder="0.00" />
      </div>
      <div class="edit-row two">
        <div>
          <div class="field-label">一级分类</div>
          <el-select v-model="editForm.category" placeholder="选择分类" @change="editForm.subcategory = ''">
            <el-option v-for="c in editCats" :key="c.name" :label="c.icon + ' ' + c.name" :value="c.name" />
          </el-select>
        </div>
        <div>
          <div class="field-label">二级小类</div>
          <el-select v-model="editForm.subcategory" placeholder="选择小类">
            <el-option v-for="s in editSubs" :key="s" :label="s" :value="s" />
          </el-select>
        </div>
      </div>
      <div class="edit-row two">
        <div>
          <div class="field-label">日期</div>
          <el-date-picker v-model="editForm.date" type="date" :clearable="false" />
        </div>
        <div>
          <div class="field-label">{{ editForm.type === 'income' ? '收款方式' : '支付方式' }}</div>
          <el-select v-model="editForm.payMethod" placeholder="选填" clearable>
            <el-option v-for="p in payMethods" :key="p" :label="p" :value="p" />
          </el-select>
        </div>
      </div>
      <div class="edit-row">
        <div class="field-label">备注</div>
        <el-input v-model="editForm.note" placeholder="选填" maxlength="50" />
      </div>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
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

.month-total {
  flex: 1;
  color: var(--qq-text-sub);
  display: flex;
  align-items: center;
  gap: 14px;
}

.sum-item {
  font-size: 13px;
  color: var(--qq-text-sub);
  white-space: nowrap;
}

.sum-item b {
  font-size: 15px;
  font-weight: 800;
  margin-left: 2px;
}

.sum-expense {
  color: var(--qq-text);
}

.sum-income {
  color: #1baf7a;
}

.sum-danger {
  color: var(--qq-danger);
}

.filter {
  width: 170px;
}

.empty {
  text-align: center;
  padding: 80px 24px;
}

.empty-icon {
  font-size: 56px;
  margin-bottom: 16px;
}

.empty p {
  font-size: 16px;
  font-weight: 600;
}

.empty .sub {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 400;
  color: var(--qq-text-sub);
}

.day-group {
  margin-bottom: 16px;
}

.day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 8px;
}

.day-date {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.day-main {
  font-size: 16px;
  font-weight: 800;
}

.day-week {
  font-size: 12px;
  color: var(--qq-text-sub);
}

.day-total {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--qq-text-sub);
}

.day-card {
  padding: 8px 16px;
}

.bill-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 4px;
  border-bottom: 1px solid #faf3e6;
}

.bill-item:last-child {
  border-bottom: none;
}

.bill-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.bill-info {
  flex: 1;
  min-width: 0;
}

.bill-name {
  font-size: 14px;
  font-weight: 600;
}

.bill-cat {
  font-size: 12px;
  color: var(--qq-text-sub);
  margin-left: 6px;
}

.bill-pay {
  font-size: 11px;
  color: var(--qq-primary);
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
  padding: 1px 6px;
  margin-left: 6px;
}

.bill-note {
  font-size: 12px;
  color: var(--qq-text-sub);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bill-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bill-amount {
  font-size: 16px;
  font-weight: 700;
}

.bill-amount.income {
  color: #1baf7a;
}

.bill-ops {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.bill-item:hover .bill-ops {
  opacity: 1;
}

.op-btn {
  border: none;
  background: transparent;
  font-size: 15px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 8px;
}

.op-btn:hover {
  background: rgba(201, 127, 69, 0.1);
}

.edit-row {
  margin-bottom: 14px;
}

.edit-row.two {
  display: flex;
  gap: 12px;
}

.edit-row.two > div {
  flex: 1;
  min-width: 0;
}

.edit-row .el-select,
.edit-row .el-date-editor {
  width: 100%;
}

.type-tip {
  font-size: 12px;
  color: var(--qq-text-sub);
  margin-left: 6px;
}
</style>
