import { reactive } from 'vue'

// 分类数据的集中存放处：启动时从数据库加载，设置页修改分类后统一刷新
// 各页面从这里读取，保证"记一笔 / 账单 / 统计 / 设置"看到的分类始终一致
// 收支各一套分类：expense = 支出分类，income = 收入分类
export const categoriesState = reactive({ expense: [], income: [] })

// 从数据库重新加载全部分类（含停用的）
export async function refreshCategories() {
  const data = await window.api.listCategories()
  categoriesState.expense = data.expense || []
  categoriesState.income = data.income || []
}

// 支付方式（选填字段，固定列表；支出称"支付方式"，收入称"收款方式"，选项共用）
export const payMethods = ['微信', '支付宝', '现金', '银行卡', '其他']

// 收入金额的绿色（复用色觉安全色板的 slot3 绿）
export const incomeColor = '#1baf7a'

// 饼图中"其他"切片的颜色（折叠第 9 个及以后的分类，中性灰，不参与色觉对比）
export const pieOtherColor = '#b3afa8'
