# Vue Figma Glass

Vue 3 / Nuxt-compatible port of the SVG inner-shadow variant of Holybasil/figma-glass-effect.

## Local usage

```bash
npm install
npm run build
```

In Nuxt (local source):

```vue
<script setup lang="ts">
import { GlassCard } from './path-to-library/src'
</script>
<template>
  <ClientOnly>
    <GlassCard :light-angle="-45" :light-intensity="80" :refraction="80" :depth="20" :dispersion="50" :frost="4" :splay="0" style="border-radius: 40px">
      <div style="padding: 32px">Hello</div>
    </GlassCard>
  </ClientOnly>
</template>
```
