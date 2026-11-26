<script setup lang="ts">
// Cycles system -> light -> dark. Lessons inside iframes follow along.
type Mode = 'system' | 'light' | 'dark'
const mode = useState<Mode>('sdl-theme', () => 'system')
onMounted(() => {
  try { const t = localStorage.getItem('sdl:theme'); if (t === 'light' || t === 'dark') mode.value = t } catch { /* ignore */ }
})
watch(mode, (m) => {
  const el = document.documentElement
  if (m === 'system') delete el.dataset.theme
  else el.dataset.theme = m
  try { m === 'system' ? localStorage.removeItem('sdl:theme') : localStorage.setItem('sdl:theme', m) } catch { /* ignore */ }
})
const next = () => { mode.value = mode.value === 'system' ? 'light' : mode.value === 'light' ? 'dark' : 'system' }
const label = computed(() => `Theme: ${mode.value}. Switch theme`)
</script>

<template>
  <button class="tt" type="button" :aria-label="label" :title="label" @click="next">
    <svg v-if="mode === 'light'" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
    <svg v-else-if="mode === 'dark'" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
    <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
  </button>
</template>

<style scoped>
.tt { background: none; border: 0; color: var(--ink); padding: 8px; border-radius: 8px; cursor: pointer; display: inline-flex; }
.tt:hover { background: var(--sunk); }
svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
