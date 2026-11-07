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
      // быстрый отсев: расстояние до рамки <= расстояния до скруглённого края
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
 * Профиль рефракции по закону Снеллса.
 * Возвращает НОРМИРОВАННОЕ смещение 0..1 (1 — на самом краю).
 * Реальная сила в пикселях задаётся снаружи.
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

    const theta1 = Math.atan(slope) // угол падения
    const theta2 = Math.asin(Math.sin(theta1) / ior) // угол преломления
    const v = Math.tan(theta1 - theta2)

    profile[i] = v
    max = Math.max(max, v)
  }

  for (let i = 0; i < samples; i++) profile[i] /= max || 1
  return profile
}

/**
 * Карта смещения. R/G = направление внутрь (нормаль * профиль).
 * Сэмплируем ВНУТРЬ, чтобы не читать за пределами элемента (нет артефактов у краёв).
 */
export function generateDisplacementMap(
  w: number,
  h: number,
  radius: number,
  depth: number,
  profile: Float32Array,
): string {
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

      data[idx] = Math.round(127.5 + 127.5 * -nx * p * aa)
      data[idx + 1] = Math.round(127.5 + 127.5 * -ny * p * aa)
    })
  })
}

/**
 * 0: свет сверху-слева при -45° (блик на верх-лево и низ-право)
 * 2: зеркально (блик на верх-право и низ-лево)
 * Варианты 1 и 3 для specular даны только для тени.
 */
const LIGHT_VARIANT: 0 | 1 | 2 | 3 = 0

function lightDir(angleRad: number) {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  switch (LIGHT_VARIANT) {
    case 0: return { x: -c, y: s }
    case 1: return { x: c, y: -s }
    case 2: return { x: c, y: s }
    case 3: return { x: -c, y: -s }
  }
}

/** Тонкая яркая кромка + мягкое свечение; противоположная сторона слабее */
export function generateSpecularMap(
  w: number,
  h: number,
  radius: number,
  _depth: number,
  angleRad: number,
  pxRatio = 1,
): string {
  const L = lightDir(angleRad)
  const rim = 0.8 * pxRatio // тонкая линия
  const glowBand = 10 * pxRatio // белая полоса на противоположной стороне
  const band = glowBand

  return canvasImage(w, h, (data) => {
    forEachEdgePixel(w, h, radius, band, (idx, d, nx, ny, aa) => {
      const a = nx * L.x + ny * L.y // >0 сторона света, <0 противоположная

      // тонкая белая линия: ярко на стороне света, слабее на остальных
      const line = Math.exp(-Math.pow(d / rim, 2)) * (a > 0 ? 0.4 + 0.6 * a : 0.15)

      // мягкая белая полоса на стороне, противоположной свету
      const glow = Math.pow(Math.max(0, 1 - d / glowBand), 2) * Math.max(0, -a) * 0.9

      const brightness = line + glow

      data[idx] = 255
      data[idx + 1] = 255
      data[idx + 2] = 255
      data[idx + 3] = Math.round(255 * clamp(brightness, 0, 1) * aa)
    })
  })
}

export function generateShadeMap(
  w: number,
  h: number,
  radius: number,
  _depth: number,
  angleRad: number,
  pxRatio = 1,
): string {
  const L = lightDir(angleRad)
  const band = 12 * pxRatio
  const hair = 0.9 * pxRatio

  return canvasImage(w, h, (data) => {
    forEachEdgePixel(w, h, radius, band, (idx, d, nx, ny, aa) => {
      const a = nx * L.x + ny * L.y

      // серое затемнение внутрь на стороне света
      const inner = Math.pow(1 - d / band, 2) * Math.max(0, a) * 0.07

      // тонкая серая линия по краю на противоположной стороне
      const outer = Math.exp(-Math.pow(d / hair, 2)) * Math.max(0, -a) * 0.09

      const alpha = inner + outer

      data[idx] = 0
      data[idx + 1] = 0
      data[idx + 2] = 0
      data[idx + 3] = Math.round(255 * clamp(alpha, 0, 1) * aa)
    })
  })
}
