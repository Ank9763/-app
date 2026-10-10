// 生成"曲奇记账"应用图标（纯 Node 实现，无需安装任何图像库）
// 设计：奶黄色圆角底 + 焦糖色曲奇饼干（带巧克力豆和咬痕）
// 输出：resources/icon.png（开发模式用）、build/icon.png 与 build/icon.ico（打包用）
// 用法：node scripts/make-icon.js
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const S = 1024 // 渲染分辨率（2 倍超采样，缩小后自动抗锯齿）

// ---------- PNG 编码（手写，只依赖 Node 内置 zlib） ----------
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // 每行前加一个 filter 字节（0 = 无过滤）
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- 绘制 ----------
// 各形状的距离函数（SDF），边缘用 smoothstep 抗锯齿
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp01 = (v) => Math.min(1, Math.max(0, v))
function edge(dist, w = 1.5) {
  return clamp01(0.5 - dist / w) // 距离 <= -w/2 完全在内，>= w/2 完全在外
}
function sdCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r
}
function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r)
  const qy = Math.abs(y - cy) - (hh - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}
function sdEllipse(x, y, cx, cy, rx, ry) {
  return (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry)
}

const CREAM_TOP = [253, 242, 217] // 底色渐变（上浅下深，暖奶油色）
const CREAM_BOTTOM = [247, 226, 189]
const COOKIE_LIGHT = [217, 143, 82] // 饼干渐变（左上受光）
const COOKIE_DARK = [192, 118, 56]
const RIM = [176, 106, 53] // 饼干边缘描边
const CHIP = [90, 58, 32] // 巧克力豆
const COOKIE_CX = 512
const COOKIE_CY = 520
const COOKIE_R = 300

// 巧克力豆（椭圆：中心、x 半径、y 半径）
const CHIPS = [
  [585, 380, 62, 52],
  [700, 520, 56, 62],
  [430, 610, 66, 50],
  [380, 440, 48, 56],
  [540, 660, 58, 48],
  [650, 650, 46, 40]
]
// 咬痕：在饼干右上边缘咬掉一口
const BITE = { cx: COOKIE_CX + COOKIE_R * 0.7071, cy: COOKIE_CY - COOKIE_R * 0.7071, r: 95 }

function render() {
  const px = Buffer.alloc(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const p = [x + 0.5, y + 0.5]

      // 1. 圆角方形底色
      const bgCov = edge(sdRoundRect(p[0], p[1], S / 2, S / 2, S / 2 - 2, S / 2 - 2, 120))
      const bgT = clamp01(p[1] / S)
      const bgCol = mix(CREAM_TOP, CREAM_BOTTOM, bgT)

      // 2. 饼干主体（渐变 + 边缘描边）
      const dCookie = sdCircle(p[0], p[1], COOKIE_CX, COOKIE_CY, COOKIE_R)
      const cookieCov = edge(dCookie)
      const cookieCol = mix(COOKIE_LIGHT, COOKIE_DARK, clamp01((p[0] + p[1]) / (2 * S) + 0.15))
      const rimCov = cookieCov * edge(Math.abs(dCookie + 12), 10)

      // 3. 巧克力豆
      let chipCov = 0
      for (const [cx, cy, rx, ry] of CHIPS) {
        chipCov = Math.max(chipCov, edge(sdEllipse(p[0], p[1], cx, cy, rx, ry)))
      }
      chipCov *= cookieCov

      // 4. 咬痕（用底色覆盖饼干右上角一块）
      const biteCov = cookieCov * edge(sdCircle(p[0], p[1], BITE.cx, BITE.cy, BITE.r), 2)

      // 合成：底色 → 饼干 → 描边 → 巧克力豆 → 咬痕
      let col = bgCol
      let alpha = bgCov
      const over = (cov, c) => {
        if (cov <= 0) return
        const a = cov * 1 // 不透明形状
        col = mix(col, c, a)
        alpha = alpha + a * (1 - alpha)
      }
      over(cookieCov, cookieCol)
      over(rimCov, RIM)
      over(chipCov, CHIP)
      // 咬痕：把饼干区域还原成底色（底色在饼干下面，直接混回底色即可）
      over(biteCov, mix(CREAM_TOP, CREAM_BOTTOM, clamp01(p[1] / S)))

      px[i] = Math.round(col[0])
      px[i + 1] = Math.round(col[1])
      px[i + 2] = Math.round(col[2])
      px[i + 3] = Math.round(alpha * 255)
    }
  }
  return px
}

// 箱式过滤缩小（把 1024 主图缩到目标尺寸，等效抗锯齿）
function downsample(src, srcSize, dstSize) {
  const out = Buffer.alloc(dstSize * dstSize * 4)
  const step = srcSize / dstSize
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0
      const x0 = Math.floor(x * step)
      const y0 = Math.floor(y * step)
      const x1 = Math.min(srcSize, Math.ceil((x + 1) * step))
      const y1 = Math.min(srcSize, Math.ceil((y + 1) * step))
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const j = (sy * srcSize + sx) * 4
          r += src[j]
          g += src[j + 1]
          b += src[j + 2]
          a += src[j + 3]
          n++
        }
      }
      const o = (y * dstSize + x) * 4
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
      out[o + 3] = Math.round(a / n)
    }
  }
  return out
}

// Windows 图标 .ico（内部直接嵌 PNG，Vista 以上系统均支持）
function encodeICO(pngs) {
  const count = pngs.length
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(count, 4)
  let offset = 6 + 16 * count
  const entries = []
  const blobs = []
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e[2] = 0
    e[3] = 0
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(e)
    blobs.push(data)
  }
  return Buffer.concat([head, ...entries, ...blobs])
}

// ---------- 生成 ----------
const master = render()
const png512 = encodePNG(512, 512, downsample(master, S, 512))
mkdirSync(join(ROOT, 'resources'), { recursive: true })
mkdirSync(join(ROOT, 'build'), { recursive: true })
writeFileSync(join(ROOT, 'resources', 'icon.png'), png512)
writeFileSync(join(ROOT, 'build', 'icon.png'), png512)

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoPngs = icoSizes.map((size) => ({
  size,
  data: encodePNG(size, size, downsample(master, S, size))
}))
writeFileSync(join(ROOT, 'build', 'icon.ico'), encodeICO(icoPngs))

console.log('图标已生成：resources/icon.png（512）、build/icon.png（512）、build/icon.ico（7 种尺寸）')
