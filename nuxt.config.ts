// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  modules: ['~~/modules/content'],
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    newsletterProvider: 'kit', // NUXT_NEWSLETTER_PROVIDER: kit | buttondown
    kitApiKey: '', // NUXT_KIT_API_KEY
    kitFormId: '', // NUXT_KIT_FORM_ID
    buttondownApiKey: '', // NUXT_BUTTONDOWN_API_KEY
    resendApiKey: '', // NUXT_RESEND_API_KEY: emails topic suggestions
    suggestTo: '', // NUXT_SUGGEST_TO: address that receives suggestions
    suggestFrom: '', // NUXT_SUGGEST_FROM: optional verified sender, e.g. "System Design Lab <lab@yourdomain.com>"
    public: {
      siteUrl: 'https://sdl-daily.vercel.app', // NUXT_PUBLIC_SITE_URL
    },
  },

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      htmlAttrs: { lang: 'en' },
      titleTemplate: (t?: string) => (t ? `${t} | System Design Lab` : 'System Design Lab: free, interactive system design'),
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Free, interactive system design labs built from real engineering incidents. Play with live simulators, then solve a design problem. A new lab every morning.' },
        { name: 'theme-color', content: '#f7f6f3' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'System Design Lab' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'alternate', type: 'application/rss+xml', title: 'System Design Lab', href: '/rss.xml' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@500;600;700;800&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap' },
      ],
      script: [
        // Apply the saved theme before paint so there's no flash.
        { innerHTML: "try{var t=localStorage.getItem('sdl:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}", tagPosition: 'head' },
      ],
    },
  },

  nitro: {
    // vue-router 5 ships an unreplaced __VUE_OPTIONS_API__ flag; bundle it so the flag is defined on the server.
    externals: { inline: ['vue-router'] },
    replace: { __VUE_OPTIONS_API__: 'true' },
    prerender: {
      crawlLinks: true,
      routes: ['/', '/labs', '/articles', '/about', '/suggest', '/rss.xml', '/sitemap.xml', '/robots.txt'],
    },
  },

  routeRules: {
    '/api/**': { prerender: false },
  },
})
