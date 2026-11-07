
const SURFACE_FN = (x: number) =>
  Math.pow(1 - Math.pow(1 - x, 4), 0.25)

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

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

type SDFResult = {
  dist: number
  nx: number
  ny: number
}

function roundedRectSDF(
  px: number,
  py: number,
  w: number,
  h: number,
  radius: number,
): SDFResult {
  const r = clamp(radius, 0, Math.min(w, h) / 2)
  const x = px - w / 2
  const y = py - h / 2

  const bx = w / 2 - r
  const by = h / 2 - r

  const dx = Math.abs(x) - bx
  const dy = Math.abs(y) - by

  if (dx <= 0 && dy <= 0) {
    if (dx > dy) {
      return {
        dist: dx - r,
        nx: x >= 0 ? 1 : -1,
        ny: 0,
      }
    }

    return {
      dist: dy - r,
      nx: 0,
      ny: y >= 0 ? 1 : -1,
    }
  }

  if (dx > 0 && dy > 0) {
    const len = Math.hypot(dx, dy) || 1

    return {
      dist: len - r,
      nx: (dx / len) * Math.sign(x),
      ny: (dy / len) * Math.sign(y),
    }
  }

  if (dx > dy) {
    return {
      dist: dx - r,
      nx: x >= 0 ? 1 : -1,
      ny: 0,
    }
  }

  return {
    dist: dy - r,
    nx: 0,
    ny: y >= 0 ? 1 : -1,
  }
}

export function calculateRefractionProfile(
  glassThickness: number,
  depth: number,
  ior: number,
  samples = 128,
): Float64Array {
  const eta = 1 / ior
  const profile = new Float64Array(samples)

  for (let i = 0; i < samples; i++) {
    const x = clamp(i / samples, 0, 0.9999)
    const y = SURFACE_FN(x)

    const dx = 0.0001
    const y2 = SURFACE_FN(Math.min(0.99999, x + dx))
    const deriv = (y2 - y) / dx

    const mag = Math.hypot(deriv, 1)
    const nx = -deriv / mag
    const ny = -1 / mag

    const dot = ny
    const k = 1 - eta * eta * (1 - dot * dot)

    if (k <= 0) continue

    const sq = Math.sqrt(k)
    const factor = eta * dot + sq

    const rx = -factor * nx
    const ry = eta - factor * ny

    if (Math.abs(ry) < 0.00001) continue

    const displacement =
      rx * ((y * depth + glassThickness) / ry)

    profile[i] = Number.isFinite(displacement)
      ? displacement
      : 0
  }

  return profile
}

export function refractionToParams(refraction: number): {
  ior: number
  glassThickness: number
} {
  const t = clamp(refraction / 100, 0, 1)

  return {
    ior: 1 + t * 4,
    glassThickness: 10 + t * 190,
  }
}

export function generateDisplacementMap(
  w: number,
  h: number,
  radius: number,
  depth: number,
  profile: Float64Array,
  maxDisp: number,
): string {
  return canvasImage(w, h, (data) => {
    const samples = profile.length
    const safeScale = Math.max(0.001, maxDisp)

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const index = (y * w + x) * 4
        const { dist, nx, ny } = roundedRectSDF(
          x + 0.5,
          y + 0.5,
          w,
          h,
          radius,
        )

        // Neutral displacement outside the glass edge.
        data[index] = 128
        data[index + 1] = 128
        data[index + 2] = 0
        data[index + 3] = 255

        if (dist > 0.5) continue

        const fromEdge = Math.max(0, -dist)
        if (fromEdge >= depth) continue

        const t = clamp(fromEdge / depth, 0, 1)
        const position = t * (samples - 1)
        const i0 = Math.floor(position)
        const i1 = Math.min(samples - 1, i0 + 1)
        const mix = position - i0

        const disp =
          profile[i0] * (1 - mix) +
          profile[i1] * mix

        const edgeAlpha = clamp(0.5 - dist, 0, 1)

        const dx = clamp(
          (-nx * disp) / safeScale,
          -1,
          1,
        )

        const dy = clamp(
          (-ny * disp) / safeScale,
          -1,
          1,
        )

        data[index] = Math.round(
          clamp(128 + dx * 127 * edgeAlpha, 0, 255),
        )

        data[index + 1] = Math.round(
          clamp(128 + dy * 127 * edgeAlpha, 0, 255),
        )
      }
    }
  })
}

export function generateSpecularMap(
  w: number,
  h: number,
  radius: number,
  depth: number,
  angle = -Math.PI / 4,
): string {
  return canvasImage(w, h, (data) => {
    const lightX = Math.cos(angle)
    const lightY = -Math.sin(angle)
    const band = Math.max(1, depth)

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const { dist, nx, ny } = roundedRectSDF(
          x + 0.5,
          y + 0.5,
          w,
          h,
          radius,
        )

        if (dist > 0.5) continue

        const fromEdge = Math.max(0, -dist)
        if (fromEdge >= band) continue

        const t = fromEdge / band

        // Bright, narrow rim + broad soft glass highlight.
        const narrow = Math.exp(
          -Math.pow(fromEdge / 1.8, 2),
        )

        const broad = Math.pow(1 - t, 3)

        const alignment = nx * lightX + ny * lightY

        // Stronger on illuminated sides, still visible elsewhere.
        const lighting =
          0.28 + 0.72 * Math.max(0, alignment)

        const brightness =
          (0.72 * narrow + 0.28 * broad) *
          lighting

        const alpha = Math.round(
          255 *
          clamp(brightness, 0, 1) *
          clamp(0.5 - dist, 0, 1),
        )

        const index = (y * w + x) * 4

        data[index] = 255
        data[index + 1] = 255
        data[index + 2] = 255
        data[index + 3] = alpha
      }
    }
  })
}

export function generateInnerLightMap(
  w: number,
  h: number,
  radius: number,
  angle = -Math.PI / 4,
): {
  shadowUrl: string
  highlightUrl: string
} {
  const shadowUrl = canvasImage(w, h, (data) => {
    const lightX = Math.cos(angle)
    const lightY = -Math.sin(angle)
    const band = 22

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const { dist, nx, ny } = roundedRectSDF(
          x + 0.5,
          y + 0.5,
          w,
          h,
          radius,
        )

        if (dist > 0) continue

        const fromEdge = -dist
        if (fromEdge >= band) continue

        const dot = nx * lightX + ny * lightY
        const fade = Math.pow(
          1 - fromEdge / band,
          2,
        )

        const alpha = Math.round(
          255 *
          Math.max(0, -dot) *
          fade *
          0.32,
        )

        const index = (y * w + x) * 4

        data[index] = 0
        data[index + 1] = 0
        data[index + 2] = 0
        data[index + 3] = alpha
      }
    }
  })

  const highlightUrl = canvasImage(w, h, (data) => {
    const lightX = Math.cos(angle)
    const lightY = -Math.sin(angle)
    const band = 22

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const { dist, nx, ny } = roundedRectSDF(
          x + 0.5,
          y + 0.5,
          w,
          h,
          radius,
        )

        if (dist > 0) continue

        const fromEdge = -dist
        if (fromEdge >= band) continue

        const dot = nx * lightX + ny * lightY
        const fade = Math.pow(
          1 - fromEdge / band,
          2,
        )

        const alpha = Math.round(
          255 *
          Math.max(0, dot) *
          fade *
          0.65,
        )

        const index = (y * w + x) * 4

        data[index] = 255
        data[index + 1] = 255
        data[index + 2] = 255
        data[index + 3] = alpha
      }
    }
  })

  return {
    shadowUrl,
    highlightUrl,
  }
}
