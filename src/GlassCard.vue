<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import type { GlassTune } from './glassMath'
import {
  calculateRefractionProfile,
  generateDisplacementMap,
  generateSpecularMap,
  generateShadeMap,
} from './glassMath'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    refraction?: number
    depth?: number
    dispersion?: number
    frost?: number
    splay?: number
    lightAngle?: number
    lightIntensity?: number
    overLight?: boolean
    /** Тонкая подгонка рамки: shadeStrength, glowStrength, glowWidthK, rimWidth и др. */
    tune?: Partial<GlassTune>
  }>(),
  {
    refraction: 80,
    depth: 20,
    dispersion: 50,
    frost: 4,
    splay: 0,
    lightAngle: -45,
    lightIntensity: 80,
    overLight: false,
  },
)

/** Подстроечный коэффициент: макс. сдвиг (px) = depth * refraction% * K */
const STRENGTH = 1.5
const IOR = 1.5

const element = ref<HTMLElement | null>(null)

const isVisible = ref(false)
const hasInitialized = ref(false)

let visibilityObserver: IntersectionObserver | undefined

const filterId = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

const width = ref(0)
const height = ref(0)
const radius = ref(0)

const dispUrl = ref('')
const specUrl = ref('')
const shadeUrl = ref('')

let observer: ResizeObserver | undefined

let displacementRaf = 0
let lightingRaf = 0

let displacementDirty = true
let lightingDirty = true

const effectiveDepth = computed(() =>
  Math.min(
    Math.max(1, props.depth),
    Math.max(1, Math.min(width.value, height.value) / 2 - 1),
  ),
)

// максимальный сдвиг в px
const maxPx = computed(
  () => (props.refraction / 100) * effectiveDepth.value * STRENGTH,
)
// feDisplacementMap: сдвиг = scale * (канал - 0.5) => scale = 2 * max
const scale = computed(() => Math.max(0.01, maxPx.value * 2))

// Яркость блика/тени: 80% (дефолт Figma) = 1
const intensity = computed(() =>
  props.overLight ? 0.8 : props.lightIntensity / 100,
)

function measure() {
  if (!element.value) return
  const rect = element.value.getBoundingClientRect()
  const style = getComputedStyle(element.value)
  width.value = Math.max(1, Math.round(rect.width))
  height.value = Math.max(1, Math.round(rect.height))
  radius.value = Math.max(0, parseFloat(style.borderTopLeftRadius) || 0)
}

function rebuildDisplacement() {
  const w = width.value
  const h = height.value

  if (!w || !h) return

  const profile = calculateRefractionProfile(IOR)

  dispUrl.value = generateDisplacementMap(
    w,
    h,
    radius.value,
    effectiveDepth.value,
    profile,
    props.splay / 100,
  )
}

function rebuildLighting() {
  const w = width.value
  const h = height.value

  if (!w || !h) return

  const depth = effectiveDepth.value
  const dpr = Math.min(2, window.devicePixelRatio || 1)

  const edge = {
    angleRad: (props.lightAngle * Math.PI) / 180,
    depth,
    intensity: intensity.value / 0.8,
    pxRatio: dpr,
    tune: props.tune,
  }

  const mapWidth = Math.round(w * dpr)
  const mapHeight = Math.round(h * dpr)
  const mapRadius = radius.value * dpr

  specUrl.value = generateSpecularMap(
    mapWidth,
    mapHeight,
    mapRadius,
    edge,
  )

  shadeUrl.value = generateShadeMap(
    mapWidth,
    mapHeight,
    mapRadius,
    edge,
  )
}

function scheduleDisplacementRebuild() {
  displacementDirty = true

  if (!isVisible.value) return

  cancelAnimationFrame(displacementRaf)

  displacementRaf = requestAnimationFrame(() => {
    rebuildDisplacement()
    displacementDirty = false
  })
}

function scheduleLightingRebuild() {
  lightingDirty = true

  if (!isVisible.value) return

  cancelAnimationFrame(lightingRaf)

  lightingRaf = requestAnimationFrame(() => {
    rebuildLighting()
    lightingDirty = false
  })
}

watch(
  [
    width,
    height,
    radius,
    () => props.depth,
    () => props.splay,
  ],
  scheduleDisplacementRebuild,
)

watch(
  [
    width,
    height,
    radius,
    () => props.depth,
    () => props.lightAngle,
    () => props.lightIntensity,
    () => props.overLight,
    () => JSON.stringify(props.tune ?? {}),
  ],
  scheduleLightingRebuild,
)

onMounted(() => {
  measure()

  if (
    typeof ResizeObserver !== 'undefined' &&
    element.value
  ) {
    observer = new ResizeObserver(measure)
    observer.observe(element.value)
  }

  if (
    typeof IntersectionObserver !== 'undefined' &&
    element.value
  ) {
    visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return

        const visible = entry.isIntersecting

        if (visible === isVisible.value) return

        isVisible.value = visible

        if (visible) {
          hasInitialized.value = true

          if (displacementDirty) {
            scheduleDisplacementRebuild()
          }

          if (lightingDirty) {
            scheduleLightingRebuild()
          }
        }

        if (!visible) {
          cancelAnimationFrame(displacementRaf)
          cancelAnimationFrame(lightingRaf)
        }
      },
      {
        rootMargin: '300px 0px',
        threshold: 0,
      },
    )

    visibilityObserver.observe(element.value)
  } else {
    // Fallback для браузеров без IntersectionObserver
    isVisible.value = true
    hasInitialized.value = true

    scheduleDisplacementRebuild()
    scheduleLightingRebuild()
  }
})

onUnmounted(() => {
  observer?.disconnect()
  visibilityObserver?.disconnect()

  cancelAnimationFrame(displacementRaf)
  cancelAnimationFrame(lightingRaf)
})

// Figma frost = blur radius, SVG stdDeviation ≈ radius / 2
const blurStd = computed(() => (props.overLight ? 1 : props.frost) / 2)
const dispersionK = computed(
  () => Math.min(1, Math.max(0, props.dispersion / 100)) * 0.12,
)
const redScale = computed(() => scale.value * (1 + dispersionK.value))
const blueScale = computed(() => scale.value * (1 - dispersionK.value))

const svgReady = computed(
  () => width.value > 0 && !!dispUrl.value && !!specUrl.value && !!shadeUrl.value,
)
</script>

<template>
  <div ref="element" v-bind="$attrs" class="vue-figma-glass" :style="{ '--glass-filter': `url(#${filterId})` }">
    <slot />
  </div>

  <svg v-if="svgReady" xmlns="http://www.w3.org/2000/svg" width="0" height="0" class="vue-figma-glass-defs"
    aria-hidden="true">
    <defs>
      <filter :id="filterId" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
        color-interpolation-filters="sRGB" x="0" y="0" :width="width" :height="height">
        <!-- Frost -->
        <feGaussianBlur in="SourceGraphic" :stdDeviation="blurStd" result="blurred" />

        <!-- Карта смещения -->
        <feImage :href="dispUrl" x="0" y="0" :width="width" :height="height" preserveAspectRatio="none"
          result="disp_map" />

        <!-- Дисперсия: каналы отдельно, альфа = 1, склейка через screen -->
        <template v-if="dispersion > 0">
          <feColorMatrix in="blurred" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1" result="r0" />
          <feColorMatrix in="blurred" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 0 1" result="g0" />
          <feColorMatrix in="blurred" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0 1" result="b0" />

          <feDisplacementMap in="r0" in2="disp_map" :scale="redScale" xChannelSelector="R" yChannelSelector="G"
            result="r1" />
          <feDisplacementMap in="g0" in2="disp_map" :scale="scale" xChannelSelector="R" yChannelSelector="G"
            result="g1" />
          <feDisplacementMap in="b0" in2="disp_map" :scale="blueScale" xChannelSelector="R" yChannelSelector="G"
            result="b1" />

          <feBlend in="r1" in2="g1" mode="screen" result="rg" />
          <feBlend in="rg" in2="b1" mode="screen" result="rgb" />
          <feBlend in="rgb" in2="blurred" mode="normal" result="displaced" />
        </template>
        <feDisplacementMap v-else in="blurred" in2="disp_map" :scale="scale" xChannelSelector="R" yChannelSelector="G"
          result="displaced" />

        <!-- Серое затемнение -->
        <feImage :href="shadeUrl" x="0" y="0" :width="width" :height="height" preserveAspectRatio="none"
          result="shade" />
        <feBlend in="shade" in2="displaced" mode="normal" result="with_shade" />

        <!-- Белая кромка и полоса -->
        <feImage :href="specUrl" x="0" y="0" :width="width" :height="height" preserveAspectRatio="none" result="spec" />
        <feBlend in="spec" in2="with_shade" mode="screen" />
      </filter>
    </defs>
  </svg>
</template>

<style>
.vue-figma-glass {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.vue-figma-glass::before,
.vue-figma-glass::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.vue-figma-glass::before {
  z-index: -1;
  background: rgba(255, 255, 255, 0.06);
}

.vue-figma-glass::after {
  z-index: -2;
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
}

.vue-figma-glass-defs {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
}
</style>
