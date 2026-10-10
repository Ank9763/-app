// 内置分类（与 CLAUDE.md 第 3 章保持一致）
// 首次启动时由数据库模块写入数据库作为初始分类；此后以数据库为准，本文件不再参与运行。
//
// color 说明：前 8 个分类使用经过色觉安全校验的标准色板（2026-10-09 校验通过，勿随意改动）；
// slot 是图表中的固定渲染顺序——饼图按 slot 排序渲染，保证相邻色块对比清晰（顺序本身是色弱安全机制）。
// 第 9、10 个分类在饼图中并入"其他"灰色切片（图表规范：9 个及以上系列折叠为"其他"）。
export const builtinCategories = [
  {
    name: '餐饮食品',
    icon: '🍜',
    color: '#eb6834',
    slot: 2,
    children: ['早餐', '午餐', '晚餐', '夜宵', '外卖', '零食饮料', '咖啡奶茶', '食材采购', '聚餐请客']
  },
  {
    name: '交通出行',
    icon: '🚗',
    color: '#2a78d6',
    slot: 1,
    children: ['公交地铁', '打车', '火车高铁', '飞机', '加油充电', '停车费', '共享单车']
  },
  {
    name: '购物消费',
    icon: '🛍️',
    color: '#e87ba4',
    slot: 5,
    children: ['服饰鞋包', '日用品', '数码电子', '美妆个护', '家居用品', '其他购物']
  },
  {
    name: '居住生活',
    icon: '🏠',
    color: '#008300',
    slot: 6,
    children: ['房租', '水电燃气', '物业费', '宽带网络', '维修', '家具家电']
  },
  {
    name: '娱乐休闲',
    icon: '🎮',
    color: '#4a3aa7',
    slot: 7,
    children: ['电影演出', '游戏', '旅游度假', '健身运动', '宠物', '会员订阅']
  },
  {
    name: '医疗健康',
    icon: '💊',
    color: '#e34948',
    slot: 8,
    children: ['门诊买药', '住院治疗', '体检', '保健品']
  },
  {
    name: '学习教育',
    icon: '📚',
    color: '#eda100',
    slot: 4,
    children: ['书籍资料', '课程培训', '考试报名', '文具']
  },
  {
    name: '人情往来',
    icon: '🎁',
    color: '#1baf7a',
    slot: 3,
    children: ['请客送礼', '红包', '孝敬长辈', '捐赠']
  },
  {
    name: '通讯网络',
    icon: '📱',
    color: '#7b8794',
    slot: 9,
    children: ['话费充值', '流量套餐']
  },
  {
    name: '其他支出',
    icon: '📦',
    color: '#9a918a',
    slot: 10,
    children: ['其他']
  }
]

// 内置收入分类（与 CLAUDE.md 第 3 章保持一致）
// 颜色复用支出色板前 5 色（同一套色觉安全色板），slot 1-5；
// 收入饼图单独渲染，与支出饼图互不干扰。
export const builtinIncomeCategories = [
  {
    name: '工资收入',
    icon: '💼',
    color: '#2a78d6',
    slot: 1,
    children: ['工资', '奖金', '加班补贴']
  },
  {
    name: '兼职外快',
    icon: '💻',
    color: '#eb6834',
    slot: 2,
    children: ['兼职收入', '副业收入']
  },
  {
    name: '投资理财',
    icon: '📈',
    color: '#1baf7a',
    slot: 3,
    children: ['理财收益', '利息收入', '基金股票']
  },
  {
    name: '红包礼金',
    icon: '🧧',
    color: '#eda100',
    slot: 4,
    children: ['收红包', '收礼金', '报销款']
  },
  {
    name: '其他收入',
    icon: '🎁',
    color: '#e87ba4',
    slot: 5,
    children: ['退款', '其他']
  }
]
