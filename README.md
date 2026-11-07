# vue-figma-glass

A Vue 3 / Nuxt glass-card component inspired by Figma's Glass effect. Uses SVG backdrop filters and generated Canvas maps for edge lighting and refraction. This is a visual approximation, not Figma's rendering engine.

> **Licensing:** The originally supplied project archive identifies an adaptation of Holybasil/figma-glass-effect and states that upstream redistribution permission has not been established. Verify the provenance and redistribution rights of the actual published implementation before distributing it.

## Installation

```bash
npm install vue-figma-glass
```

Vue 3 is a peer dependency.

## Usage in Vue 3 / Nuxt

```vue
<script setup lang="ts">
import { GlassCard } from 'vue-figma-glass'
</script>

<template>
  <ClientOnly>
    <GlassCard
      :light-angle="-45"
      :light-intensity="80"
      :refraction="80"
      :depth="20"
      :dispersion="50"
      :frost="4"
      :splay="0"
      class="rounded-3xl w-full sm:w-[520px] px-4 sm:px-6 sm:py-[50px] flex flex-col gap-[30px] items-center"
    >
      <h2>Welcome</h2>
      <p>Your content goes here.</p>
    </GlassCard>
  </ClientOnly>
</template>
```

The example uses a **-45° light angle** and **80% light intensity**, matching the calibrated reference settings.

## Glass properties

| Prop | Example | Description |
| --- | --- | --- |
| `light-angle` | `-45` | Light direction, degrees |
| `light-intensity` | `80` | Lighting strength, 0–100 |
| `refraction` | `80` | Refraction strength, 0–100 |
| `depth` | `20` | Glass edge depth, CSS pixels |
| `dispersion` | `50` | Chromatic dispersion, 0–100 |
| `frost` | `4` | Frost/blur amount |
| `splay` | `0` | Approximate radial spread, 0–100 |
| `over-light` | `false` | Alternate lighting behavior |
| `tune` | See below | Optional edge-lighting overrides |

## Fine-tuning the edge lighting (`tune`)

The calibrated edge-lighting values are built into `DEFAULT_GLASS_TUNE` in `glassMath.ts`. You **do not need to pass `tune`** to reproduce the reference appearance.

```ts
export const DEFAULT_GLASS_TUNE = {
  rimWidth: 0.67,
  rimLit: 0.9,
  rimDark: 0.22,
  glowWidthK: 0.85,
  glowStrength: 0.85,
  shadeWidthK: 0.95,
  shadeStrength: 0.046,
  hairWidth: 0.9,
  hairStrength: 0,
}
```

The optional `tune` object overrides **only the keys you specify**. Other values retain their defaults:

```vue
<GlassCard
  :light-angle="-45"
  :light-intensity="80"
  :tune="{ glowStrength: 0.7, rimLit: 0.85 }"
>
  Content
</GlassCard>
```

- `rimWidth`: width of the thin white edge in pixels.
- `rimLit`: edge brightness on the light-facing side.
- `rimDark`: edge brightness on the opposite side.
- `glowWidthK`: width multiplier for the white glow (`depth × multiplier`).
- `glowStrength`: glow intensity.
- `shadeWidthK`: width multiplier for the inner shadow (`depth × multiplier`).
- `shadeStrength`: inner-shadow intensity.
- `hairWidth`: width of the thin dark hairline in pixels.
- `hairStrength`: intensity of the dark hairline; default `0` disables it.

These values were visually tuned for a specific example and may look different depending on the background, element size, browser, and device pixel ratio. They are **not** Figma's official formulas.

## Browser notes

The effect depends on SVG filters used with CSS `backdrop-filter`. Test Chromium, Firefox, and Safari separately; rendering support and appearance can differ. Use `<ClientOnly>` in Nuxt when appropriate because map generation uses the browser Canvas API.
