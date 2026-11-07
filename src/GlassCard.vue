<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  useId,
  watch,
} from 'vue'

import {
  calculateRefractionProfile,
  generateDisplacementMap,
  generateSpecularMap,
  generateInnerLightMap,
  refractionToParams,
} from './glassMath'

defineOptions({
  inheritAttrs: false,
})

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

const element = ref<HTMLElement | null>(null)
const filterId = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

const width = ref(0)
const height = ref(0)
const radius = ref(0)

const dispUrl = ref('')
const specUrl = ref('')
const shadowUrl = ref('')
const highlightUrl = ref('')
const scale = ref(1)

let observer: ResizeObserver | undefined
let raf = 0

function measure() {
  if (!element.value) return

  const rect = element.value.getBoundingClientRect()
  const style = getComputedStyle(element.value)

  const nextWidth = Math.max(1, Math.round(rect.width))
  const nextHeight = Math.max(1, Math.round(rect.height))

  const nextRadius = Math.max(
    0,
    parseFloat(style.borderTopLeftRadius) || 0,
  )

  width.value = nextWidth
  height.value = nextHeight
  radius.value = nextRadius
}

function rebuild() {
  if (
    !width.value ||
    !height.value ||
    typeof document === 'undefined'
  ) {
    return
  }

  const w = width.value
  const h = height.value

  const depth = Math.min(
    Math.max(0.1, props.depth),
    Math.max(0.1, Math.min(w, h) / 2 - 1),
  )

  const { ior, glassThickness } = refractionToParams(
    props.refraction,
  )

  const profile = calculateRefractionProfile(
    glassThickness,
    depth,
    ior,
  )

  const maxDisp = Math.max(
    1,
    ...Array.from(profile, (v) => Math.abs(v)),
  )

  scale.value = maxDisp

  dispUrl.value = generateDisplacementMap(
    w,
    h,
    radius.value,
    depth,
    profile,
    maxDisp,
  )

  specUrl.value = generateSpecularMap(
    w,
    h,
    radius.value,
    depth * 2.5,
    (props.lightAngle * Math.PI) / 180,
  )

  const inner = generateInnerLightMap(
    w,
    h,
    radius.value,
    (props.lightAngle * Math.PI) / 180,
  )

  shadowUrl.value = inner.shadowUrl
  highlightUrl.value = inner.highlightUrl
}

function scheduleRebuild() {
  if (typeof window === 'undefined') return

  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(rebuild)
}

watch(
  [
    width,
    height,
    radius,
    () => props.refraction,
    () => props.depth,
    () => props.lightAngle,
  ],
  scheduleRebuild,
)

onMounted(() => {
  measure()

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)

    if (element.value) {
      observer.observe(element.value)
    }
  }

  scheduleRebuild()
})

onUnmounted(() => {
  observer?.disconnect()
  cancelAnimationFrame(raf)
})

const frostValue = computed(() =>
  props.overLight ? 1 : props.frost,
)

const intensity = computed(() =>
  props.overLight ? 0.8 : props.lightIntensity / 100,
)

const dispersionAmount = computed(() =>
  Math.min(1, Math.max(0, props.dispersion / 100)),
)

const redScale = computed(
  () => scale.value * (1 + dispersionAmount.value * 0.08),
)

const blueScale = computed(
  () => scale.value * (1 - dispersionAmount.value * 0.08),
)

const svgReady = computed(
  () =>
    width.value > 0 &&
    height.value > 0 &&
    !!dispUrl.value &&
    !!specUrl.value &&
    !!shadowUrl.value &&
    !!highlightUrl.value,
)
</script>

<template>
  <div ref="element" v-bind="$attrs" class="vue-figma-glass" :style="{
    '--glass-filter': `url(#${filterId})`,
  }">
    <slot />
  </div>

  <svg v-if="svgReady" xmlns="http://www.w3.org/2000/svg" width="0" height="0" class="vue-figma-glass-defs"
    color-interpolation-filters="sRGB" aria-hidden="true">
    <defs>
      <filter :id="filterId" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" :x="0" :y="0" :width="width"
        :height="height">
        <feGaussianBlur in="SourceGraphic" :stdDeviation="frostValue" result="blurred_source" />

        <feImage :href="dispUrl" x="0" y="0" :width="width" :height="height" result="disp_map" />

        <template v-if="dispersion > 0">
          <feColorMatrix in="blurred_source" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="src_r" />

          <feColorMatrix in="blurred_source" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="src_g" />

          <feColorMatrix in="blurred_source" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="src_b" />

          <feDisplacementMap in="src_r" in2="disp_map" :scale="redScale" xChannelSelector="R" yChannelSelector="G"
            result="disp_r" />

          <feDisplacementMap in="src_g" in2="disp_map" :scale="scale" xChannelSelector="R" yChannelSelector="G"
            result="disp_g" />

          <feDisplacementMap in="src_b" in2="disp_map" :scale="blueScale" xChannelSelector="R" yChannelSelector="G"
            result="disp_b" />

          <feComposite in="disp_r" in2="disp_g" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="disp_rg" />

          <feComposite in="disp_rg" in2="disp_b" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="displaced" />
        </template>

        <feDisplacementMap v-else in="blurred_source" in2="disp_map" :scale="scale" xChannelSelector="R"
          yChannelSelector="G" result="displaced" />

        <feColorMatrix in="displaced" type="saturate" values="2" result="displaced_sat" />

        <feImage :href="specUrl" x="0" y="0" :width="width" :height="height" result="spec_layer" />

        <feComponentTransfer in="spec_layer" result="spec_faded">
          <feFuncA type="linear" :slope="intensity" />
        </feComponentTransfer>

        <feBlend in="spec_faded" in2="displaced_sat" mode="screen" result="glass_base" />

        <feImage :href="shadowUrl" x="0" y="0" :width="width" :height="height" result="inner_shadow" />

        <feComponentTransfer in="inner_shadow" result="inner_shadow_faded">
          <feFuncA type="linear" :slope="overLight ? 0.8 : 0.65" />
        </feComponentTransfer>

        <feBlend in="inner_shadow_faded" in2="glass_base" mode="normal" result="with_shadow" />

        <feImage :href="highlightUrl" x="0" y="0" :width="width" :height="height" result="inner_highlight" />

        <feComponentTransfer in="inner_highlight" result="inner_highlight_faded">
          <feFuncA type="linear" :slope="overLight ? 0.8 : 0.7" />
        </feComponentTransfer>

        <feBlend in="inner_highlight_faded" in2="with_shadow" mode="screen" />
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
