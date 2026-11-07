const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

/** Выпуклая "squircle" поверхность. x: 0 = край, 1 = плоский центр */
const surface = (x: number) => Math.pow(1 - Math.pow(1 - x, 4), 0.25)

function canvasImage(
  w: number,
  h: number,
  draw: (data: Uint8ClampedArray) => void,
): string {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(w, h)
  draw(image.data)
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

function roundedRectSDF(
  px: number,
  py: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = clamp(radius, 0, Math.min(w, h) / 2)
  const x = px - w / 2
  const y = py - h / 2
  const dx = Math.abs(x) - (w / 2 - r)
  const dy = Math.abs(y) - (h / 2 - r)

  if (dx > 0 && dy > 0) {
    const len = Math.hypot(dx, dy) || 1
    return {
      dist: len - r,
      nx: (dx / len) * Math.sign(x),
      ny: (dy / len) * Math.sign(y),
    }
  }
  if (dx > dy) return { dist: dx - r, nx: x >= 0 ? 1 : -1, ny: 0 }
  return { dist: dy - r, nx: 0, ny: y >= 0 ? 1 : -1 }
}

/** Обход только пикселей в полосе `band` от края */
function forEachEdgePixel(
  w: number,
  h: number,
  radius: number,
  band: number,
  cb: (index: number, fromEdge: number, nx: number, ny: number, aa: number) => void,
) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const box = Math.min(x + 0.5, w - x - 0.5, y + 0.5, h - y - 0.5)
      if (box > band) continue

      const { dist, nx, ny } = roundedRectSDF(x + 0.5, y + 0.5, w, h, radius)
      if (dist > 0.5) continue
      const fromEdge = Math.max(0, -dist)
      if (fromEdge >= band) continue

      cb((y * w + x) * 4, fromEdge, nx, ny, clamp(0.5 - dist, 0, 1))
    }
  }
}

/**
 * Профиль рефракции по закону Снеллиуса.
 * Возвращает НОРМИРОВАННОЕ смещение 0..1 (1 — на самом краю).
 */
export function calculateRefractionProfile(
  ior = 1.5,
  samples = 128,
): Float32Array {
  const profile = new Float32Array(samples)
  let max = 0

  for (let i = 0; i < samples; i++) {
    const x = i / (samples - 1)
    const e = 1e-3
    const x0 = Math.max(0, x - e)
    const x1 = Math.min(1, x + e)
    const slope = (surface(x1) - surface(x0)) / (x1 - x0)

    const theta1 = Math.atan(slope)
    const theta2 = Math.asin(Math.sin(theta1) / ior)
    const v = Math.tan(theta1 - theta2)

    profile[i] = v
    max = Math.max(max, v)
  }

  for (let i = 0; i < samples; i++) profile[i] /= max || 1
  return profile
}

/** Карта смещения. R/G = направление внутрь (нормаль * профиль). */
export function generateDisplacementMap(
  w: number,
  h: number,
  radius: number,
  depth: number,
  profile: Float32Array,
  splay = 0, // 0..1, приближение Figma Splay (см. комментарий ниже)
): string {
  const k = clamp(splay, 0, 1)

  return canvasImage(w, h, (data) => {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128
      data[i + 1] = 128
      data[i + 2] = 128
      data[i + 3] = 255
    }

    const last = profile.length - 1

    forEachEdgePixel(w, h, radius, depth, (idx, fromEdge, nx, ny, aa) => {
      const pos = (fromEdge / depth) * last
      const i0 = Math.floor(pos)
      const i1 = Math.min(last, i0 + 1)
      const p = profile[i0] * (1 - (pos - i0)) + profile[i1] * (pos - i0)

      // Splay (приближение): направление сдвига смешивается с радиальным
      // направлением от центра. При splay = 0 это обычная нормаль к краю.
      let dx = nx
      let dy = ny
      if (k > 0) {
        const pi = idx / 4
        const cx = (pi % w) + 0.5 - w / 2
        const cy = Math.floor(pi / w) + 0.5 - h / 2
        const cl = Math.hypot(cx, cy) || 1
        dx = nx * (1 - k) + (cx / cl) * k
        dy = ny * (1 - k) + (cy / cl) * k
        const dl = Math.hypot(dx, dy) || 1
        dx /= dl
        dy /= dl
      }

      data[idx] = Math.round(127.5 + 127.5 * -dx * p * aa)
      data[idx + 1] = Math.round(127.5 + 127.5 * -dy * p * aa)
    })
  })
}

/**
 * Направление НА источник света (экранные координаты, y вниз).
 * При -45° => свет сверху-слева, как в Figma.
 */
function lightDir(angleRad: number) {
  return { x: -Math.cos(angleRad), y: Math.sin(angleRad) }
}

/** Все числа для подгонки под Figma. Эталон: Light intensity 80%, Depth 20. */
export const DEFAULT_GLASS_TUNE = {
  rimWidth: 0.8,        // толщина тонкой белой линии, px
  rimLit: 0.4,          // яркость линии на стороне света (минимум, растёт до 1)
  rimDark: 0.15,        // яркость линии на противоположной стороне
  glowWidthK: 0.7,      // ширина белой полосы = depth * K
  glowStrength: 0.9,    // яркость белой полосы снизу-справа
  shadeWidthK: 0.6,     // ширина серого затемнения = depth * K
  shadeStrength: 0.08,  // сила серого затемнения сверху-слева
  hairWidth: 0.9,       // толщина тонкой серой линии, px
  hairStrength: 0.09,   // сила тонкой серой линии снизу-справа
}

export type GlassTune = typeof DEFAULT_GLASS_TUNE

export interface EdgeLightOptions {
  angleRad: number
  depth: number      // в CSS px
  intensity: number  // 1 = эталон (Figma 80%)
  pxRatio?: number
  tune?: Partial<GlassTune> // переопределение значений по умолчанию
}

/** Белая кромка + белая полоса на стороне, противоположной свету */
export function generateSpecularMap(
  w: number,
  h: number,
  radius: number,
  { angleRad, depth, intensity, pxRatio = 1, tune }: EdgeLightOptions,
): string {
  const T = { ...DEFAULT_GLASS_TUNE, ...tune }
  const L = lightDir(angleRad)
  const rim = T.rimWidth * pxRatio
  const glowBand = Math.max(4, depth * T.glowWidthK) * pxRatio
  const band = Math.max(glowBand, rim * 4)

  return canvasImage(w, h, (data) => {
    forEachEdgePixel(w, h, radius, band, (idx, d, nx, ny, aa) => {
      const a = nx * L.x + ny * L.y // >0 сторона света, <0 противоположная

      const side = a > 0 ? T.rimLit + (1 - T.rimLit) * a : T.rimDark
      const line = Math.exp(-Math.pow(d / rim, 2)) * side

      const glow =
        Math.pow(Math.max(0, 1 - d / glowBand), 2) *
        Math.max(0, -a) *
        T.glowStrength

      const brightness = (line + glow) * intensity

      data[idx] = 255
      data[idx + 1] = 255
      data[idx + 2] = 255
      data[idx + 3] = Math.round(255 * clamp(brightness, 0, 1) * aa)
    })
  })
}

/** Серое затемнение внутрь на стороне света + тонкая серая линия напротив */
export function generateShadeMap(
  w: number,
  h: number,
  radius: number,
  { angleRad, depth, intensity, pxRatio = 1, tune }: EdgeLightOptions,
): string {
  const T = { ...DEFAULT_GLASS_TUNE, ...tune }
  const L = lightDir(angleRad)
  const shadeBand = Math.max(4, depth * T.shadeWidthK) * pxRatio
  const hair = T.hairWidth * pxRatio
  const band = Math.max(shadeBand, hair * 4)

  return canvasImage(w, h, (data) => {
    forEachEdgePixel(w, h, radius, band, (idx, d, nx, ny, aa) => {
      const a = nx * L.x + ny * L.y

      const inner =
        Math.pow(Math.max(0, 1 - d / shadeBand), 2) *
        Math.max(0, a) *
        T.shadeStrength

      const outer =
        Math.exp(-Math.pow(d / hair, 2)) *
        Math.max(0, -a) *
        T.hairStrength

      const alpha = (inner + outer) * intensity

      data[idx] = 0
      data[idx + 1] = 0
      data[idx + 2] = 0
      data[idx + 3] = Math.round(255 * clamp(alpha, 0, 1) * aa)
    })
  })
}
