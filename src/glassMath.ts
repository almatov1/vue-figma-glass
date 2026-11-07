// Adapted from Holybasil/figma-glass-effect; redistribution requires upstream permission/license clarification.
const SURFACE_FN = (x: number) => Math.pow(1 - Math.pow(1 - x, 4), 0.25);

export function calculateRefractionProfile(
  glassThickness: number,
  depth: number,
  ior: number,
  samples = 128,
): Float64Array {
  const eta = 1 / ior;
  function refract(nx: number, ny: number): [number, number] | null {
    const dot = ny;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    const sq = Math.sqrt(k);
    return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
  }
  const profile = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const y = SURFACE_FN(x);
    const dx = x < 1 ? 0.0001 : -0.0001;
    const y2 = SURFACE_FN(x + dx);
    const deriv = (y2 - y) / dx;
    const mag = Math.sqrt(deriv * deriv + 1);
    const ref = refract(-deriv / mag, -1 / mag);
    if (!ref) {
      profile[i] = 0;
      continue;
    }
    profile[i] = ref[0] * ((y * depth + glassThickness) / ref[1]);
  }
  return profile;
}

// Refractive — full-perimeter displacement using roundedRectSDF
export function generateDisplacementMap(
  w: number,
  h: number,
  radius: number,
  depth: number,
  profile: Float64Array,
  maxDisp: number,
): string {
  if (typeof window === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 128;
    d[i + 1] = 128;
    d[i + 2] = 0;
    d[i + 3] = 255;
  }
  const S = profile.length;
  for (let y1 = 0; y1 < h; y1++) {
    for (let x1 = 0; x1 < w; x1++) {
      const { dist, nx, ny } = roundedRectSDF(x1, y1, w, h, radius);

      // Outside the shape
      if (dist > 1) continue;

      const fromEdge = -dist;
      if (fromEdge >= depth) continue;

      // Anti-aliasing at outer edge (1px feather)
      const op = dist > 0 ? 1 - dist : 1;

      if (fromEdge <= 0 && op <= 0) continue;

      const bi = Math.min(((Math.max(0, fromEdge) / depth) * S) | 0, S - 1);
      const disp = profile[bi] || 0;
      const dX = (-nx * disp) / maxDisp;
      const dY = (-ny * disp) / maxDisp;
      const idx = (y1 * w + x1) * 4;
      d[idx] = (128 + dX * 127 * op + 0.5) | 0;
      d[idx + 1] = (128 + dY * 127 * op + 0.5) | 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

// highlight — full-perimeter specular using roundedRectSDF
export function generateSpecularMap(
  w: number,
  h: number,
  radius: number,
  depth: number,
  angle = -Math.PI / 4,
): string {
  if (typeof window === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  d.fill(0);
  const sv = [Math.cos(angle), Math.sin(angle)];
  for (let y1 = 0; y1 < h; y1++) {
    for (let x1 = 0; x1 < w; x1++) {
      const { dist, nx, ny } = roundedRectSDF(x1, y1, w, h, radius);

      if (dist > 1) continue;

      const fromEdge = -dist;
      if (fromEdge >= depth) continue;

      const op = dist > 0 ? 1 - dist : 1;
      if (op <= 0) continue;

      // Flip ny for screen-to-math Y convention
      const dot = Math.abs(nx * sv[0] + -ny * sv[1]);
      const edge = Math.sqrt(Math.max(0, 1 - (1 - Math.max(0, fromEdge)) ** 2));
      const coeff = dot * edge;
      const alpha = (255 * Math.pow(coeff, 1.5) * op) | 0;
      const idx = (y1 * w + x1) * 4;
      d[idx] = 255;
      d[idx + 1] = 255;
      d[idx + 2] = 255;
      d[idx + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

// Rounded rect SDF: returns distance to boundary (negative = inside)
// and outward-pointing normal at the closest boundary point
function roundedRectSDF(
  px: number,
  py: number,
  w: number,
  h: number,
  r: number,
): { dist: number; nx: number; ny: number } {
  const x = px - w / 2;
  const y = py - h / 2;
  const bx = w / 2 - r;
  const by = h / 2 - r;
  const dx = Math.abs(x) - bx;
  const dy = Math.abs(y) - by;

  if (dx <= 0 && dy <= 0) {
    // Inside inner rect — closest point is on a straight side
    if (-dx < -dy) {
      return { dist: dx - r, nx: x > 0 ? 1 : -1, ny: 0 };
    }
    return { dist: dy - r, nx: 0, ny: y > 0 ? 1 : -1 };
  }
  if (dx > 0 && dy > 0) {
    // Corner region
    const cd = Math.sqrt(dx * dx + dy * dy);
    const inv = cd > 0 ? 1 / cd : 0;
    return {
      dist: cd - r,
      nx: dx * inv * Math.sign(x),
      ny: dy * inv * Math.sign(y),
    };
  }
  // Along a straight side outside inner rect in one axis
  if (dx > dy) {
    return { dist: dx - r, nx: x > 0 ? 1 : -1, ny: 0 };
  }
  return { dist: dy - r, nx: 0, ny: y > 0 ? 1 : -1 };
}

// refraction 0–100 → IOR [1,5] + glassThickness [10,200]
export function refractionToParams(refraction: number): {
  ior: number;
  glassThickness: number;
} {
  const t = refraction / 100;
  return { ior: 1 + t * 4, glassThickness: 10 + t * 190 };
}

// Inner shadow (top-left dark) + inner highlight (bottom-right bright)
export function generateInnerLightMap(
  w: number,
  h: number,
  radius: number,
  angle = (-3 * Math.PI) / 4,
): { shadowUrl: string; highlightUrl: string } {
  if (typeof window === "undefined") return { shadowUrl: "", highlightUrl: "" };

  const sCvs = document.createElement("canvas");
  sCvs.width = w;
  sCvs.height = h;
  const sCtx = sCvs.getContext("2d")!;
  const sImg = sCtx.createImageData(w, h);
  const sd = sImg.data;
  sd.fill(0);

  const hCvs = document.createElement("canvas");
  hCvs.width = w;
  hCvs.height = h;
  const hCtx = hCvs.getContext("2d")!;
  const hImg = hCtx.createImageData(w, h);
  const hd = hImg.data;
  hd.fill(0);

  // Convert angle from math y-up convention (same as generateSpecularMap) to
  // screen y-down convention used by roundedRectSDF normals: negate sin component
  const lightDir = [Math.cos(angle), -Math.sin(angle)];
  const band = 20;

  for (let y1 = 0; y1 < h; y1++) {
    for (let x1 = 0; x1 < w; x1++) {
      const { dist, nx, ny } = roundedRectSDF(x1, y1, w, h, radius);

      // Outside the shape
      if (dist > 0) continue;

      // Distance from boundary inward
      const fromEdge = -dist;
      if (fromEdge >= band) continue;

      const fade = 1 - fromEdge / band;

      // dot < 0: normal opposes light travel → edge faces the light source → shadow
      // dot > 0: normal aligns with light travel → edge faces away → highlight
      const dot = nx * lightDir[0] + ny * lightDir[1];

      const idx = (y1 * w + x1) * 4;

      if (dot < 0) {
        // Faces light (top-left edges) → dark inner shadow
        const alpha = Math.min(255, (255 * -dot * fade * fade * 0.1) | 0);
        sd[idx + 3] = alpha; // black pixel
      } else if (dot > 0) {
        // Faces away (bottom-right edges) → bright highlight
        const alpha = Math.min(255, (255 * dot * fade * fade * 0.2) | 0);
        hd[idx] = 255;
        hd[idx + 1] = 255;
        hd[idx + 2] = 255;
        hd[idx + 3] = alpha; // white pixel
      }
    }
  }

  sCtx.putImageData(sImg, 0, 0);
  hCtx.putImageData(hImg, 0, 0);
  return { shadowUrl: sCvs.toDataURL(), highlightUrl: hCvs.toDataURL() };
}

