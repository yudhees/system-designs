<script setup lang="ts">
const open = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => { open.value = false })
const links = [
  { to: '/labs', label: 'Labs' },
  { to: '/articles', label: 'Articles' },
  { to: '/about', label: 'About' },
]
</script>

<template>
  <header class="hdr">
    <div class="wrap bar">
      <NuxtLink to="/" class="brand" aria-label="System Design Lab home">
        <BrandMark />
        <span>System Design Lab</span>
      </NuxtLink>

      <nav :class="['nav', { open }]" aria-label="Main">
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="nav-link">{{ l.label }}</NuxtLink>
        <NuxtLink to="/#subscribe" class="btn btn-small btn-primary nav-cta">Get the daily lab</NuxtLink>
      </nav>

      <div class="tools">
        <ThemeToggle />
        <button class="menu" type="button" :aria-expanded="open" aria-controls="main-nav" @click="open = !open">
          <span class="visually-hidden">Menu</span>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path v-if="!open" d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /><path v-else d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hdr { position: sticky; top: 0; z-index: 50; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: saturate(1.4) blur(10px); border-bottom: 1px solid var(--line); }
.bar { display: flex; align-items: center; gap: 24px; height: 64px; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-family: var(--f-display); font-weight: 800; font-size: 1.08rem; letter-spacing: -0.02em; }
.nav { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.nav-link { color: var(--ink); text-decoration: none; font-weight: 500; padding: 8px 12px; border-radius: 8px; }
.nav-link:hover { background: var(--sunk); }
.nav-link.router-link-active { color: var(--signal); }
.nav-cta { margin-left: 8px; }
.tools { display: flex; align-items: center; gap: 6px; }
.menu { display: none; background: none; border: 0; color: var(--ink); padding: 8px; border-radius: 8px; cursor: pointer; }

@media (max-width: 760px) {
  .bar { gap: 12px; }
  .tools { margin-left: auto; }
  .menu { display: inline-flex; }
  .nav { display: none; position: absolute; left: 0; right: 0; top: 64px; flex-direction: column; align-items: stretch; gap: 2px; padding: 12px var(--gutter) 20px; background: var(--bg); border-bottom: 1px solid var(--line); }
  .nav.open { display: flex; }
  .nav-link { padding: 12px; }
  .nav-cta { margin: 8px 0 0; }
}
</style>
