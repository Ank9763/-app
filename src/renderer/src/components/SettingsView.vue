<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { categoriesState, refreshCategories } from '../store/categories'

// ---------- 分类管理 ----------
const activeType = ref('expense') // 当前页签：expense = 支出分类, income = 收入分类
const expanded = ref([]) // 展开显示小类的分类名列表

// 切换收支页签时清空展开状态（分类名可能跨类型同名）
watch(activeType, () => {
  expanded.value = []
})

function toggleExpand(name) {
  expanded.value = expanded.value.includes(name)
    ? expanded.value.filter((n) => n !== name)
    : [...expanded.value, name]
}

// 停用 / 启用（旧账目始终保留）
async function toggleCat(cat, enabled) {
  try {
    await window.api.setCategoryEnabled({ type: activeType.value, kind: 'category', name: cat.name, enabled })
    ElMessage.success(enabled ? `已启用「${cat.name}」` : `已停用「${cat.name}」（旧账目保留）`)
    await refreshCategories()
  } catch (err) {
    ElMessage.error('操作失败：' + (err.message || '未知错误'))
  }
}

async function toggleSub(cat, sub, enabled) {
  try {
    await window.api.setCategoryEnabled({
      type: activeType.value,
      kind: 'sub',
      parent: cat.name,
      name: sub.name,
      enabled
    })
    ElMessage.success(enabled ? `已启用「${sub.name}」` : `已停用「${sub.name}」（旧账目保留）`)
    await refreshCategories()
  } catch (err) {
    ElMessage.error('操作失败：' + (err.message || '未知错误'))
  }
}

// ---------- 新增分类 ----------
const iconChoices = ['🍽️', '☕', '🥤', '🛒', '👕', '💄', '🐶', '🌳', '🎵', '🎬', '🏋️', '✈️', '💼', '📌', '🎨', '🍼']

const addVisible = ref(false)
const addSaving = ref(false)
const addForm = reactive({ type: 'expense', name: '', icon: '🍽️', subs: '' })

// 打开新增弹窗时锁定当前收支类型（避免弹窗开着时误切页签导致类型错乱）
function openAdd() {
  addForm.type = activeType.value
  addForm.name = ''
  addForm.subs = ''
  addVisible.value = true
}

async function saveAdd() {
  const name = addForm.name.trim()
  if (!name) {
    ElMessage.warning('请输入分类名称')
    return
  }
  addSaving.value = true
  try {
    await window.api.addCategory({
      type: addForm.type,
      kind: 'category',
      name,
      icon: addForm.icon,
      children: addForm.subs
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    })
    ElMessage.success('已新增分类 🍪')
    addVisible.value = false
    addForm.name = ''
    addForm.subs = ''
    await refreshCategories()
  } catch (err) {
    ElMessage.error('新增失败：' + (err.message || '未知错误'))
  } finally {
    addSaving.value = false
  }
}

// ---------- 改名（分类 / 小类共用） ----------
const renameVisible = ref(false)
const renameSaving = ref(false)
const renameForm = reactive({ type: 'expense', kind: 'category', parent: '', oldName: '', newName: '' })

function openRename(cat) {
  renameForm.type = activeType.value
  renameForm.kind = 'category'
  renameForm.parent = ''
  renameForm.oldName = cat.name
  renameForm.newName = cat.name
  renameVisible.value = true
}

function openRenameSub(cat, sub) {
  renameForm.type = activeType.value
  renameForm.kind = 'sub'
  renameForm.parent = cat.name
  renameForm.oldName = sub.name
  renameForm.newName = sub.name
  renameVisible.value = true
}

async function saveRename() {
  const name = renameForm.newName.trim()
  if (!name) {
    ElMessage.warning('名称不能为空')
    return
  }
  renameSaving.value = true
  try {
    await window.api.renameCategory({
      type: renameForm.type,
      kind: renameForm.kind,
      parent: renameForm.parent,
      oldName: renameForm.oldName,
      newName: name
    })
    ElMessage.success('改名成功，历史账目已同步更新')
    renameVisible.value = false
    await refreshCategories()
  } catch (err) {
    ElMessage.error('改名失败：' + (err.message || '未知错误'))
  } finally {
    renameSaving.value = false
  }
}

// ---------- 添加小类 ----------
const addSubVisible = ref(false)
const addSubSaving = ref(false)
const addSubForm = reactive({ type: 'expense', parent: '', name: '' })

function openAddSub(cat) {
  addSubForm.type = activeType.value
  addSubForm.parent = cat.name
  addSubForm.name = ''
  addSubVisible.value = true
}

async function saveAddSub() {
  const name = addSubForm.name.trim()
  if (!name) {
    ElMessage.warning('请输入小类名称')
    return
  }
  addSubSaving.value = true
  try {
    await window.api.addCategory({ type: addSubForm.type, kind: 'sub', parent: addSubForm.parent, name })
    ElMessage.success('已添加小类')
    addSubVisible.value = false
    await refreshCategories()
  } catch (err) {
    ElMessage.error('添加失败：' + (err.message || '未知错误'))
  } finally {
    addSubSaving.value = false
  }
}

// ---------- 导出 ----------
const exporting = ref(false)

async function doExport() {
  exporting.value = true
  try {
    const res = await window.api.exportCsv()
    if (res.ok) {
      ElMessage.success(`已导出 ${res.count} 笔账单到：${res.path}`)
    }
  } catch (err) {
    ElMessage.error('导出失败：' + (err.message || '未知错误'))
  } finally {
    exporting.value = false
  }
}

// ---------- 备份 / 恢复 ----------
const backingUp = ref(false)
const restoring = ref(false)

async function doBackup() {
  backingUp.value = true
  try {
    const res = await window.api.backupDatabase()
    if (res.ok) {
      ElMessage.success(`备份完成，文件已保存到：${res.path}`)
    }
  } catch (err) {
    ElMessage.error('备份失败：' + (err.message || '未知错误'))
  } finally {
    backingUp.value = false
  }
}

async function doRestore() {
  try {
    await ElMessageBox.confirm(
      '恢复备份会覆盖当前的全部账目和分类设置，且无法撤销。确定继续吗？',
      '恢复数据',
      { type: 'warning', confirmButtonText: '确定恢复', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户取消
  }
  restoring.value = true
  try {
    const res = await window.api.restoreDatabase()
    if (res.ok) {
      await refreshCategories()
      ElMessage.success('恢复成功，界面即将刷新')
      setTimeout(() => window.location.reload(), 800)
    }
  } catch (err) {
    ElMessage.error('恢复失败：' + (err.message || '未知错误'))
  } finally {
    restoring.value = false
  }
}
</script>

<template>
  <div>
    <h2 class="qq-page-title">设置</h2>

    <!-- 分类管理 -->
    <div class="qq-card section">
      <div class="section-head">
        <div>
          <div class="section-title">分类管理</div>
          <div class="section-desc">改名、新增、停用分类。停用后"记一笔"里不再显示，以前的账目不受影响</div>
        </div>
        <el-button type="primary" @click="openAdd">＋ 新增分类</el-button>
      </div>

      <div class="cat-type-switch">
        <el-segmented
          v-model="activeType"
          :options="[
            { label: '支出分类', value: 'expense' },
            { label: '收入分类', value: 'income' }
          ]"
        />
      </div>

      <div class="cat-list">
        <div v-for="c in categoriesState[activeType]" :key="c.name" class="cat-item">
          <div class="cat-main">
            <span class="cat-chip" :style="{ background: c.color }">{{ c.icon }}</span>
            <span class="cat-name">{{ c.name }}</span>
            <span class="cat-count">{{ c.children.length }} 个小类</span>
            <span v-if="!c.enabled" class="cat-off">已停用</span>
            <div class="cat-ops">
              <el-button size="small" text @click="toggleExpand(c.name)">
                {{ expanded.includes(c.name) ? '收起小类' : '管理小类' }}
              </el-button>
              <el-button size="small" text @click="openRename(c)">改名</el-button>
              <el-switch :model-value="c.enabled" @change="(v) => toggleCat(c, v)" />
            </div>
          </div>

          <!-- 展开的小类列表 -->
          <div v-if="expanded.includes(c.name)" class="sub-list">
            <div v-for="s in c.children" :key="s.name" class="sub-item">
              <span class="sub-name" :class="{ off: !s.enabled }">{{ s.name }}</span>
              <el-button size="small" text @click="openRenameSub(c, s)">改名</el-button>
              <el-switch
                size="small"
                :model-value="s.enabled"
                @change="(v) => toggleSub(c, s, v)"
              />
            </div>
            <el-button size="small" text type="primary" class="add-sub" @click="openAddSub(c)">
              ＋ 添加小类
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 数据导出 -->
    <div class="qq-card section">
      <div class="section-head">
        <div>
          <div class="section-title">导出账单</div>
          <div class="section-desc">
            把全部账目导出成表格文件（CSV），Excel、WPS 直接双击就能打开，方便自己算账或打印
          </div>
        </div>
        <el-button :loading="exporting" @click="doExport">导出全部账单</el-button>
      </div>
    </div>

    <!-- 备份与恢复 -->
    <div class="qq-card section">
      <div class="section-head">
        <div>
          <div class="section-title">备份与恢复</div>
          <div class="section-desc">
            备份 = 把全部数据（账目+分类设置）打包成一个文件，建议定期备份存到 U 盘或网盘；换电脑时用"恢复"导入备份文件即可
          </div>
        </div>
        <div class="btn-group">
          <el-button :loading="backingUp" @click="doBackup">备份数据</el-button>
          <el-button type="danger" plain :loading="restoring" @click="doRestore">恢复数据</el-button>
        </div>
      </div>
    </div>

    <!-- 新增分类弹窗 -->
    <el-dialog v-model="addVisible" title="新增一级分类" width="440px">
      <div class="field-label">图标</div>
      <div class="icon-grid">
        <button
          v-for="i in iconChoices"
          :key="i"
          class="icon-btn"
          :class="{ active: addForm.icon === i }"
          @click="addForm.icon = i"
        >
          {{ i }}
        </button>
      </div>
      <div class="field-label dialog-gap">分类名称</div>
      <el-input v-model="addForm.name" placeholder="例如：宠物用品" maxlength="10" show-word-limit />
      <div class="field-label dialog-gap">二级小类（一行一个，可留空）</div>
      <el-input
        v-model="addForm.subs"
        type="textarea"
        :rows="4"
        placeholder="猫粮&#10;猫砂&#10;宠物玩具"
      />
      <p class="dialog-tip">新增分类会出现在"记一笔"对应的收支页；统计饼图最多显示 8 种颜色，新增分类会归入"其他"。</p>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" :loading="addSaving" @click="saveAdd">保存</el-button>
      </template>
    </el-dialog>

    <!-- 改名弹窗（分类/小类共用） -->
    <el-dialog
      v-model="renameVisible"
      :title="renameForm.kind === 'category' ? '修改分类名称' : '修改小类名称'"
      width="380px"
    >
      <div class="field-label">原名：{{ renameForm.oldName }}</div>
      <el-input v-model="renameForm.newName" maxlength="10" show-word-limit class="dialog-gap" />
      <p class="dialog-tip">改名后，以前记过的相关账目会一起变成新名字，不会出现新旧对不上。</p>
      <template #footer>
        <el-button @click="renameVisible = false">取消</el-button>
        <el-button type="primary" :loading="renameSaving" @click="saveRename">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加小类弹窗 -->
    <el-dialog v-model="addSubVisible" :title="`给「${addSubForm.parent}」添加小类`" width="380px">
      <el-input v-model="addSubForm.name" placeholder="例如：猫粮" maxlength="10" show-word-limit />
      <template #footer>
        <el-button @click="addSubVisible = false">取消</el-button>
        <el-button type="primary" :loading="addSubSaving" @click="saveAddSub">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.section {
  margin-bottom: 16px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
}

.section-desc {
  font-size: 13px;
  color: var(--qq-text-sub);
  margin-top: 4px;
  max-width: 560px;
}

.btn-group {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.cat-type-switch {
  margin-top: 16px;
}

.cat-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
}

.cat-item {
  border-top: 1px solid #faf3e6;
  padding: 10px 0;
}

.cat-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cat-chip {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}

.cat-name {
  font-size: 14px;
  font-weight: 600;
}

.cat-count {
  font-size: 12px;
  color: var(--qq-text-sub);
}

.cat-off {
  font-size: 11px;
  color: var(--qq-danger);
  background: rgba(224, 122, 95, 0.12);
  border-radius: 6px;
  padding: 1px 8px;
}

.cat-ops {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
}

.sub-list {
  margin: 8px 0 4px 42px;
  padding: 10px 14px;
  background: #fffdf7;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sub-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-name {
  font-size: 13px;
  flex: 1;
}

.sub-name.off {
  color: var(--qq-text-sub);
  text-decoration: line-through;
}

.add-sub {
  align-self: flex-start;
}

.icon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: 1.5px solid var(--qq-border);
  background: #fffdf7;
  border-radius: 10px;
  font-size: 19px;
  cursor: pointer;
  transition: all 0.15s;
}

.icon-btn:hover {
  border-color: var(--qq-primary);
}

.icon-btn.active {
  border-color: var(--qq-primary);
  background: rgba(201, 127, 69, 0.12);
}

.dialog-gap {
  margin-top: 12px;
}

.dialog-tip {
  font-size: 12px;
  color: var(--qq-text-sub);
  margin-top: 10px;
  line-height: 1.6;
}
</style>
