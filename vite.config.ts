import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
export default defineConfig({
  plugins: [vue()],
  build: { lib: { entry: resolve(__dirname, 'src/index.ts'), name: 'VueFigmaGlass', formats: ['es', 'umd'], fileName: (format) => format === 'es' ? 'vue-figma-glass.js' : 'vue-figma-glass.umd.cjs' }, rollupOptions: { external: ['vue'], output: { globals: { vue: 'Vue' } } } }
})
