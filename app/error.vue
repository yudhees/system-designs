<script setup lang="ts">
import type { NuxtError } from '#app'
const props = defineProps<{ error: NuxtError }>()
const is404 = computed(() => props.error.statusCode === 404)
useSeoMeta({ title: is404.value ? 'Page not found' : 'Something went wrong' })
</script>

<template>
  <NuxtLayout>
    <div class="wrap err">
      <h1>{{ is404 ? 'This page is not on the ring.' : 'Something went wrong.' }}</h1>
      <p class="muted">{{ is404 ? 'The link may be old, or the lab may have moved.' : 'Reload the page, or head back to the labs.' }}</p>
      <NuxtLink to="/labs" class="btn btn-primary" @click="clearError()">See all labs</NuxtLink>
    </div>
  </NuxtLayout>
</template>

<style scoped>
.err { padding-block: 96px; display: grid; gap: 18px; justify-items: start; }
.err h1 { font-size: clamp(2rem, 5vw, 3.2rem); max-width: 20ch; }
</style>
