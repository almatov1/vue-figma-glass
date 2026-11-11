
# vue-figma-glass

A Vue 3 / Nuxt glass-card component inspired by Figma's Glass effect.

Features:
- Glass refraction using SVG displacement filters
- Adjustable background blur
- Directional edge lighting
- Customizable shadows and highlights
- Responsive sizing and border radius
- Optimized rendering with CSS lighting layers
- Lazy initialization using IntersectionObserver

This component is a visual approximation of Figma's Glass effect, not Figma's rendering engine.

## Installation

```bash
npm install vue-figma-glass
```

Vue 3 is a peer dependency.

Import the stylesheet once:

```ts
import 'vue-figma-glass/style.css'
```

For Nuxt 3, you can register it globally:

```ts
export default defineNuxtConfig({
  css: ['vue-figma-glass/style.css'],
})
```

## Usage

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
      :frost="4"
      :splay="0"
      class="rounded-3xl p-6"
    >
      <h2>Welcome</h2>
      <p>Your content goes here.</p>
    </GlassCard>
  </ClientOnly>
</template>
```

The example uses the calibrated reference settings.

If the stylesheet is not registered globally, import it in your application entry point.

## Properties

| Prop | Default | Description |
| --- | --- | --- |
| `refraction` | `80` | Refraction strength, 0–100 |
| `depth` | `20` | Glass edge depth in CSS pixels |
| `frost` | `4` | Background blur amount |
| `splay` | `0` | Approximate radial refraction spread, 0–100 |
| `light-angle` | `-45` | Light direction in degrees |
| `light-intensity` | `80` | Lighting strength, 0–100 |
| `over-light` | `false` | Alternate lighting behavior |
| `tune` | Optional | Fine-tuning of edge lighting |

All properties are optional.

### Minimal usage

The default values are already configured:

```vue
<GlassCard class="rounded-3xl p-6">
  Your content
</GlassCard>
```

## Fine-tuning edge lighting

The component uses the following calibrated values:

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

Override individual values using the `tune` prop:

```vue
<GlassCard
  :tune="{
    glowStrength: 0.7,
    rimLit: 0.85,
  }"
  class="rounded-3xl p-6"
>
  Your content
</GlassCard>
```

Only the specified values are overridden.

### Tuning options

- `rimWidth`: Thin white edge width
- `rimLit`: Edge brightness on the light-facing side
- `rimDark`: Edge brightness on the opposite side
- `glowWidthK`: White glow width multiplier
- `glowStrength`: White glow intensity
- `shadeWidthK`: Inner shadow width multiplier
- `shadeStrength`: Inner shadow intensity
- `hairWidth`: Thin dark edge width
- `hairStrength`: Dark edge intensity; `0` disables it

These settings are visual approximations, not Figma's official formulas.

## Rendering architecture

The component separates refraction and lighting to improve scrolling performance.

### SVG backdrop filter

The SVG filter handles:

1. Background blur with `feGaussianBlur`
2. Displacement map loading with `feImage`
3. Refraction with `feDisplacementMap`

### CSS lighting layers

Shadows and highlights are generated as Canvas maps and rendered using CSS background images.

This avoids additional image and blending operations inside the SVG backdrop filter.

### Performance

- Displacement and lighting maps are generated separately.
- Map generation is scheduled using requestAnimationFrame.
- ResizeObserver tracks element dimensions.
- IntersectionObserver controls lazy initialization.
- Canvas generation focuses calculations on edge regions.

Performance depends on the browser, device, card dimensions, and number of instances.

## Browser compatibility

The component uses SVG filters, CSS backdrop-filter, and the Canvas API.

Rendering and performance can vary between Chromium, Firefox, and Safari.

Test the effect in your target browsers.

For Nuxt SSR applications, use `ClientOnly` when appropriate because Canvas map generation requires browser APIs.

## Credits

Based on [Holybasil/figma-glass-effect](https://github.com/Holybasil/figma-glass-effect), adapted for Vue 3 / Nuxt.

Original copyright and license notices are preserved.

## License

MIT License.
