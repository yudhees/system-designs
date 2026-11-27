<script setup lang="ts">
// Canonical URL and absolute og:url for every page, built from the public site URL.
const route = useRoute()
const site = String(useRuntimeConfig().public.siteUrl).replace(/\/$/, '')
const url = computed(() => `${site}${route.path === '/' ? '/' : route.path.replace(/\/$/, '')}`)
useHead({ link: [{ rel: 'canonical', href: url }] })
useSeoMeta({ ogUrl: url })
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
