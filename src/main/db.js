// 数据库模块：使用 Electron 内置的 SQLite 引擎（node:sqlite，用户拍板选定）
// 数据保存在系统用户数据目录下的 quqi.db 文件，换电脑时可用"备份与恢复"带走
//
// 账目支持"支出/收入"两种类型：expenses 表用 type 列标记（'expense' | 'income'）。
// 金额一律以"分"存正数，正负号只在显示和导出时体现（支出负、收入正）。
import { DatabaseSync } from 'node:sqlite'
import { app, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { builtinCategories, builtinIncomeCategories } from './seedCategories'

let db = null
let dbPath = ''

// 用户新增分类的图标底色（中性暖灰，不参与统计图的色觉对比）
const CUSTOM_COLOR = '#8a8078'

// 合法的收支类型
const RECORD_TYPES = ['expense', 'income']

// 初始化数据库（建表 + 迁移 + 首次写入内置分类），返回数据库文件位置
export function initDatabase() {
  dbPath = join(app.getPath('userData'), 'quqi.db')
  db = new DatabaseSync(dbPath)
  prepareDatabase()
  return dbPath
}

// 启动和恢复备份后统一走这里：建表 → 迁移 → 播种，保证任何版本的数据都能自动升级
function prepareDatabase() {
  ensureSchema()
  migrateIfNeeded()
  seedCategoriesIfEmpty()
  seedIncomeIfMissing()
}

// 建表（兼容旧版备份文件：缺什么表补什么表）
function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount_cents INTEGER NOT NULL,   -- 金额以"分"存储，避免小数误差
      category TEXT NOT NULL,          -- 一级分类名
      subcategory TEXT NOT NULL,       -- 二级小类名
      date TEXT NOT NULL,              -- 日期 YYYY-MM-DD
      pay_method TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'expense',  -- 收支类型：expense = 支出, income = 收入
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE TABLE IF NOT EXISTS categories (
      kind TEXT NOT NULL DEFAULT 'category',  -- category = 一级大类, sub = 二级小类
      parent TEXT NOT NULL DEFAULT '',        -- 小类所属的一级分类名
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',   -- 该分类属于支出还是收入
      icon TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      slot INTEGER NOT NULL DEFAULT 99,       -- 统计图中的固定渲染顺序
      enabled INTEGER NOT NULL DEFAULT 1,     -- 停用后"记一笔"里不再显示，旧账目保留
      is_builtin INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (kind, parent, name, type)  -- type 进主键：支出/收入允许同名自定义分类
    );
  `)
}

// 老库升级（幂等：每次启动/恢复都跑，跑过即空操作）
function migrateIfNeeded() {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)

  // 1) expenses 缺 type 列：直接加列（带默认值，瞬时完成）
  if (!cols('expenses').includes('type')) {
    db.exec("ALTER TABLE expenses ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'")
  }

  // 2) categories 缺 type 列：type 要进主键，SQLite 不能改主键，只能重建表
  if (!cols('categories').includes('type')) {
    try {
      db.exec('BEGIN')
      db.exec(`
        CREATE TABLE categories_new (
          kind TEXT NOT NULL DEFAULT 'category',
          parent TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'expense',
          icon TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL DEFAULT '',
          slot INTEGER NOT NULL DEFAULT 99,
          enabled INTEGER NOT NULL DEFAULT 1,
          is_builtin INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (kind, parent, name, type)
        )
      `)
      // 老库只有支出分类，全部归入 'expense'；ORDER BY rowid 保持插入顺序（listCategories 依赖）
      db.exec(`
        INSERT INTO categories_new (kind, parent, name, type, icon, color, slot, enabled, is_builtin)
          SELECT kind, parent, name, 'expense', icon, color, slot, enabled, is_builtin
          FROM categories ORDER BY rowid
      `)
      db.exec('DROP TABLE categories')
      db.exec('ALTER TABLE categories_new RENAME TO categories')
      db.exec('COMMIT')
    } catch (err) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // 忽略回滚失败
      }
      throw err
    }
  }
}

// 第一次启动（或恢复旧备份）时写入内置支出分类
function seedCategoriesIfEmpty() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM categories').get()
  if (c > 0) return
  const ins = db.prepare(
    'INSERT INTO categories (kind, parent, name, type, icon, color, slot, enabled, is_builtin) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)'
  )
  for (const cat of builtinCategories) {
    ins.run('category', '', cat.name, 'expense', cat.icon, cat.color, cat.slot)
    for (const sub of cat.children) {
      ins.run('sub', cat.name, sub, 'expense', '', '', 99)
    }
  }
}

// 老库升级时补种内置收入分类（只在完全没有收入分类时种，不覆盖用户自定义/停用）
function seedIncomeIfMissing() {
  const { c } = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE type = 'income'").get()
  if (c > 0) return
  const ins = db.prepare(
    'INSERT INTO categories (kind, parent, name, type, icon, color, slot, enabled, is_builtin) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)'
  )
  for (const cat of builtinIncomeCategories) {
    ins.run('category', '', cat.name, 'income', cat.icon, cat.color, cat.slot)
    for (const sub of cat.children) {
      ins.run('sub', cat.name, sub, 'income', '', '', 99)
    }
  }
}

// ---------- 账目 ----------

// 金额合法性检查（必须是正整数"分"）
function checkAmount(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('金额不合法')
  }
}

// 收支类型合法性检查
function checkType(type) {
  if (!RECORD_TYPES.includes(type)) {
    throw new Error('收支类型不合法')
  }
}

// 记一笔（支出或收入）
export function addRecord({ type, amountCents, category, subcategory, date, payMethod = '', note = '' }) {
  checkType(type)
  checkAmount(amountCents)
  if (!category || !subcategory || !date) throw new Error('分类或日期缺失')
  const r = db
    .prepare(
      'INSERT INTO expenses (amount_cents, category, subcategory, date, pay_method, note, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(amountCents, category, subcategory, date, payMethod, note, type)
  return { id: Number(r.lastInsertRowid) }
}

// 某个月的账单（month 形如 2026-10）；type 可选，缺省返回全部类型
export function listRecords(month, type = '') {
  if (type) {
    return db
      .prepare('SELECT * FROM expenses WHERE date LIKE ? AND type = ? ORDER BY date DESC, id DESC')
      .all(`${month}-%`, type)
  }
  return db
    .prepare('SELECT * FROM expenses WHERE date LIKE ? ORDER BY date DESC, id DESC')
    .all(`${month}-%`)
}

// 某个日期区间的账单（含首尾两天，用于统计趋势）；type 可选
export function listRecordsRange(startDate, endDate, type = '') {
  if (type) {
    return db
      .prepare('SELECT * FROM expenses WHERE date >= ? AND date <= ? AND type = ? ORDER BY date ASC, id ASC')
      .all(startDate, endDate, type)
  }
  return db
    .prepare('SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date ASC, id ASC')
    .all(startDate, endDate)
}

// 删除一笔
export function deleteRecord(id) {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
}

// 修改一笔（收支类型不可改，编辑弹窗里只读）
export function updateRecord(id, { amountCents, category, subcategory, date, payMethod = '', note = '' }) {
  checkAmount(amountCents)
  if (!category || !subcategory || !date) throw new Error('分类或日期缺失')
  db.prepare(
    'UPDATE expenses SET amount_cents = ?, category = ?, subcategory = ?, date = ?, pay_method = ?, note = ? WHERE id = ?'
  ).run(amountCents, category, subcategory, date, payMethod, note, id)
}

// ---------- 分类管理 ----------

// 读取全部分类（含停用的），按收支类型组装成 { expense: [...], income: [...] } 两级结构
export function listCategories() {
  const rows = db.prepare('SELECT * FROM categories ORDER BY rowid').all()
  const result = { expense: [], income: [] }
  const bucketFor = (type) => (type === 'income' ? result.income : result.expense)
  for (const r of rows) {
    const list = bucketFor(r.type)
    if (r.kind === 'category') {
      list.push({
        name: r.name,
        icon: r.icon,
        color: r.color,
        slot: r.slot,
        enabled: !!r.enabled,
        isBuiltin: !!r.is_builtin,
        children: []
      })
    } else {
      const parent = list.find((c) => c.name === r.parent)
      if (parent) {
        parent.children.push({ name: r.name, enabled: !!r.enabled, isBuiltin: !!r.is_builtin })
      }
    }
  }
  return result
}

// 查重（按收支类型隔离：支出和收入允许有同名分类）
function checkDup(type, kind, parent, name) {
  const r =
    kind === 'category'
      ? db.prepare("SELECT 1 FROM categories WHERE kind = 'category' AND type = ? AND name = ?").get(type, name)
      : db
          .prepare("SELECT 1 FROM categories WHERE kind = 'sub' AND type = ? AND parent = ? AND name = ?")
          .get(type, parent, name)
  if (r) throw new Error('已存在同名分类')
}

// 改名（同步更新历史账目，避免新旧名字对不上；带 type 条件，防止跨收支类型误伤）
export function renameCategory({ type, kind, parent = '', oldName, newName }) {
  checkType(type)
  const name = (newName || '').trim()
  if (!name) throw new Error('新名称不能为空')
  if (kind === 'category') {
    if (name === oldName) return
    checkDup(type, 'category', '', name)
    db.prepare("UPDATE categories SET name = ? WHERE kind = 'category' AND type = ? AND name = ?").run(
      name,
      type,
      oldName
    )
    db.prepare("UPDATE categories SET parent = ? WHERE kind = 'sub' AND type = ? AND parent = ?").run(
      name,
      type,
      oldName
    )
    db.prepare('UPDATE expenses SET category = ? WHERE type = ? AND category = ?').run(name, type, oldName)
  } else {
    if (name === oldName) return
    checkDup(type, 'sub', parent, name)
    db.prepare("UPDATE categories SET name = ? WHERE kind = 'sub' AND type = ? AND parent = ? AND name = ?").run(
      name,
      type,
      parent,
      oldName
    )
    db.prepare('UPDATE expenses SET subcategory = ? WHERE type = ? AND category = ? AND subcategory = ?').run(
      name,
      type,
      parent,
      oldName
    )
  }
}

// 新增分类（一级分类可带小类列表；type 决定它属于支出还是收入）
export function addCategory({ type, kind, parent = '', name, icon = '', children = [] }) {
  checkType(type)
  const n = (name || '').trim()
  if (!n) throw new Error('名称不能为空')
  checkDup(type, kind, parent, n)
  if (kind === 'category') {
    const maxSlot = db
      .prepare("SELECT COALESCE(MAX(slot), 0) AS m FROM categories WHERE kind = 'category' AND type = ?")
      .get(type).m
    db.prepare(
      'INSERT INTO categories (kind, parent, name, type, icon, color, slot, enabled, is_builtin) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)'
    ).run('category', '', n, type, icon, CUSTOM_COLOR, maxSlot + 1)
    for (const sub of children) {
      const s = (sub || '').trim()
      if (s) addCategory({ type, kind: 'sub', parent: n, name: s })
    }
  } else {
    db.prepare(
      'INSERT INTO categories (kind, parent, name, type, icon, color, slot, enabled, is_builtin) VALUES (?, ?, ?, ?, ?, ?, 99, 1, 0)'
    ).run('sub', parent, n, type, '', '')
  }
}

// 停用 / 启用（旧账目始终保留；带 type 条件）
export function setCategoryEnabled({ type, kind, parent = '', name, enabled }) {
  const v = enabled ? 1 : 0
  if (kind === 'category') {
    db.prepare("UPDATE categories SET enabled = ? WHERE kind = 'category' AND type = ? AND name = ?").run(v, type, name)
  } else {
    db.prepare("UPDATE categories SET enabled = ? WHERE kind = 'sub' AND type = ? AND parent = ? AND name = ?").run(
      v,
      type,
      parent,
      name
    )
  }
}

// ---------- 导出 / 备份 / 恢复 ----------

function dateStamp() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

// 导出全部账单为 CSV（Excel 可直接打开；含收支类型列，支出金额为负、收入为正）
export async function exportCsv(win) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出账单',
    defaultPath: `曲奇记账_账单_${dateStamp()}.csv`,
    filters: [{ name: '表格文件', extensions: ['csv'] }]
  })
  if (canceled || !filePath) return { ok: false }
  const rows = db.prepare('SELECT * FROM expenses ORDER BY date ASC, id ASC').all()
  // CSV 转义：含逗号/引号/换行的内容用引号包起来，引号翻倍
  const esc = (s) => {
    s = String(s ?? '')
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = ['日期,收支类型,一级分类,二级小类,金额(元),支付方式,备注']
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.type === 'income' ? '收入' : '支出',
        esc(r.category),
        esc(r.subcategory),
        (r.type === 'income' ? '' : '-') + (r.amount_cents / 100).toFixed(2),
        esc(r.pay_method),
        esc(r.note)
      ].join(',')
    )
  }
  // 加 BOM 头，Excel 打开中文才不乱码
  writeFileSync(filePath, '﻿' + lines.join('\r\n'), 'utf8')
  return { ok: true, path: filePath, count: rows.length }
}

// 备份：把数据库文件复制到用户选择的位置
export async function backupDatabase(win) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '备份数据',
    defaultPath: `曲奇记账_备份_${dateStamp()}.db`,
    filters: [{ name: '曲奇记账数据文件', extensions: ['db'] }]
  })
  if (canceled || !filePath) return { ok: false }
  copyFileSync(dbPath, filePath)
  return { ok: true, path: filePath }
}

// 恢复：用备份文件替换当前数据库（旧备份缺表/缺列时自动补齐迁移）
export async function restoreDatabase(win) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '选择备份文件',
    properties: ['openFile'],
    filters: [{ name: '曲奇记账数据文件', extensions: ['db'] }]
  })
  if (canceled || !filePaths.length) return { ok: false }
  const src = filePaths[0]
  const head = readFileSync(src).subarray(0, 16).toString('utf8')
  if (head !== 'SQLite format 3\u0000') throw new Error('所选文件不是有效的曲奇记账备份')
  db.close()
  copyFileSync(src, dbPath)
  db = new DatabaseSync(dbPath)
  prepareDatabase()
  return { ok: true }
}
