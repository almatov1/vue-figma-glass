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

The `splay` prop is accepted for API parity but not implemented in the upstream SVG variant. This is an approximation, not pixel-perfect Figma reproduction. Test browser support for SVG backdrop filters, especially Safari.

## Publishing after licensing permission

1. Rename `name` in package.json to an available npm package name, and update author/repository/license metadata as permitted.
2. Run `npm install && npm run build && npm pack --dry-run`.
3. Push to GitHub; run `npm login`, then `npm publish --access public`.
4. For future releases increment version with `npm version patch` and publish again.

Vue is a peer dependency, not bundled. npm consumers use `import { GlassCard } from 'your-package-name'`.
