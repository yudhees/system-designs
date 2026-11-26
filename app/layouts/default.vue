<template>
  <div class="shell">
    <a class="skip" href="#main">Skip to content</a>
    <SiteHeader />
    <main id="main"><slot /></main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.shell { min-height: 100dvh; display: flex; flex-direction: column; }
main { flex: 1; }
.skip { position: absolute; left: -999px; top: 8px; background: var(--ink); color: var(--bg); padding: 8px 12px; border-radius: 6px; z-index: 100; }
.skip:focus { left: 8px; }
</style>
