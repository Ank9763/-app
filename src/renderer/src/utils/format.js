// 金额与日期的小工具

// 分 → 元字符串（金额在数据库里以"分"存储，避免小数误差）
export function centsToYuan(cents) {
  return (cents / 100).toFixed(2)
}

// Date 对象 → 'YYYY-MM-DD'
export function dateToStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 当前月份 'YYYY-MM'
export function currentMonth() {
  return dateToStr(new Date()).slice(0, 7)
}

// 'YYYY-MM-DD' → 周几（日一二三四五六）
export function weekdayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return '日一二三四五六'[d.getDay()]
}
