<script setup>
import { reactive, computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { categoriesState, payMethods, incomeColor } from '../store/categories'
import { dateToStr } from '../utils/format'

// 收支类型：expense = 支出，income = 收入
const recType = ref('expense')

// 记一笔表单
const form = reactive({
  amount: '',
  categoryName: '', // 一级分类名
  subcategory: '', // 二级小类
  date: new Date(), // 默认今天
  payMethod: '', // 选填
  note: '' // 选填
})

// 只显示启用的分类（停用的不出现在这里），按当前收支类型取对应一套
const cats = computed(() => categoriesState[recType.value].filter((c) => c.enabled))
const selectedCategory = computed(() => cats.value.find((c) => c.name === form.categoryName) || null)
const subs = computed(() =>
  selectedCategory.value ? selectedCategory.value.children.filter((s) => s.enabled) : []
)

// 分类被改名/停用后，清掉已选中的分类，避免对不上
watch(selectedCategory, (c) => {
  if (!c && form.categoryName) {
    form.categoryName = ''
    form.subcategory = ''
  }
})

// 切换收支类型时清空已选分类和小类（防止同名分类"穿透"残留）
watch(recType, () => {
  form.categoryName = ''
  form.subcategory = ''
})

const saving = ref(false)

function selectCategory(c) {
  form.categoryName = c.name
  form.subcategory = ''
}

async function submit() {
  const amount = Number(form.amount)
  if (!form.amount || !Number.isFinite(amount) || amount <= 0) {
    ElMessage.warning('请输入正确的金额')
    return
  }
  if (!form.categoryName || !form.subcategory) {
    ElMessage.warning(`请选择${recType.value === 'expense' ? '支出' : '收入'}分类`)
    return
  }
  saving.value = true
  try {
    await window.api.addRecord({
      type: recType.value,
      amountCents: Math.round(amount * 100), // 元 → 分
      category: selectedCategory.value.name,
      subcategory: form.subcategory,
      date: dateToStr(form.date),
      payMethod: form.payMethod,
      note: form.note
    })
    ElMessage.success(recType.value === 'expense' ? '已记下这笔支出 🍪' : '已记下这笔收入 🍪')
    // 清空金额和备注，保留分类和日期（方便连续记同类账）
    form.amount = ''
    form.note = ''
  } catch (err) {
    ElMessage.error('保存失败：' + (err.message || '未知错误'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="home">
    <h2 class="qq-page-title">记一笔</h2>

    <div class="qq-card">
      <!-- 支出 / 收入切换 -->
      <div class="type-switch">
        <el-segmented
          v-model="recType"
          :options="[
            { label: '支出', value: 'expense' },
            { label: '收入', value: 'income' }
          ]"
        />
      </div>

      <!-- 金额输入 -->
      <div class="amount-row">
        <span class="amount-symbol" :style="recType === 'income' ? { color: incomeColor } : {}">¥</span>
        <input
          v-model="form.amount"
          class="amount-input"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
        />
      </div>

      <!-- 一级分类 -->
      <div class="field-label">{{ recType === 'expense' ? '支出分类' : '收入分类' }}</div>
      <div class="category-grid">
        <button
          v-for="c in cats"
          :key="c.name"
          class="cat-chip"
          :class="{ active: form.categoryName === c.name }"
          :style="
            form.categoryName === c.name ? { background: c.color, borderColor: c.color } : {}
          "
          @click="selectCategory(c)"
        >
          <span class="cat-icon">{{ c.icon }}</span>
          <span>{{ c.name }}</span>
        </button>
      </div>

      <!-- 二级小类（选中一级分类后出现） -->
      <div v-if="selectedCategory" class="sub-row">
        <div class="field-label">{{ selectedCategory.name }} · 小类</div>
        <div class="sub-grid">
          <button
            v-for="s in subs"
            :key="s.name"
            class="sub-chip"
            :class="{ active: form.subcategory === s.name }"
            @click="form.subcategory = s.name"
          >
            {{ s.name }}
          </button>
        </div>
      </div>

      <!-- 日期 / 支付方式 -->
      <div class="meta-row">
        <div class="meta-item">
          <div class="field-label">日期</div>
          <el-date-picker
            v-model="form.date"
            type="date"
            placeholder="选择日期"
            :clearable="false"
          />
        </div>
        <div class="meta-item">
          <div class="field-label">{{ recType === 'expense' ? '支付方式' : '收款方式' }}（选填）</div>
          <el-select v-model="form.payMethod" placeholder="选择方式" clearable>
            <el-option v-for="p in payMethods" :key="p" :label="p" :value="p" />
          </el-select>
        </div>
      </div>

      <!-- 备注 -->
      <div class="meta-row">
        <div class="meta-item grow">
          <div class="field-label">备注（选填）</div>
          <el-input
            v-model="form.note"
            placeholder="例如：和朋友聚餐"
            maxlength="50"
            show-word-limit
          />
        </div>
      </div>

      <button class="submit-btn" :disabled="saving" @click="submit">
        {{ saving ? '保存中…' : '记一笔 🍪' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.type-switch {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.amount-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
}

.amount-symbol {
  font-size: 32px;
  font-weight: 700;
  color: var(--qq-primary);
}

.amount-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 44px;
  font-weight: 700;
  color: var(--qq-text);
  width: 220px;
  text-align: center;
  border-bottom: 3px dashed var(--qq-border);
  padding: 4px 8px;
  transition: border-color 0.2s;
}

.amount-input:focus {
  border-bottom-color: var(--qq-primary);
}

.amount-input::placeholder {
  color: var(--qq-border);
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.cat-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  border: 1.5px solid var(--qq-border);
  background: #fffdf7;
  border-radius: 12px;
  font-size: 13px;
  color: var(--qq-text);
  cursor: pointer;
  transition: all 0.15s;
}

.cat-chip:hover {
  border-color: var(--qq-primary);
  transform: translateY(-1px);
}

.cat-chip.active {
  color: #fff;
  font-weight: 600;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
}

.cat-icon {
  font-size: 22px;
}

.sub-row {
  margin-bottom: 16px;
}

.sub-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sub-chip {
  padding: 7px 14px;
  border: 1.5px solid var(--qq-border);
  background: #fffdf7;
  border-radius: 999px;
  font-size: 13px;
  color: var(--qq-text);
  cursor: pointer;
  transition: all 0.15s;
}

.sub-chip:hover {
  border-color: var(--qq-primary);
}

.sub-chip.active {
  background: var(--qq-primary);
  border-color: var(--qq-primary);
  color: #fff;
  font-weight: 600;
}

.meta-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.meta-item {
  width: 200px;
}

.meta-item.grow {
  flex: 1;
  width: auto;
}

.meta-item :deep(.el-date-editor),
.meta-item :deep(.el-select) {
  width: 100%;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: var(--qq-primary);
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 4px 12px rgba(201, 127, 69, 0.35);
}

.submit-btn:hover {
  background: var(--qq-primary-dark);
}

.submit-btn:active {
  transform: scale(0.98);
}
</style>
