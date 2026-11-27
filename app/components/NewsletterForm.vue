<script setup lang="ts">
const props = withDefaults(defineProps<{ compact?: boolean, source?: string }>(), { compact: false, source: 'site' })
const email = ref('')
const company = ref('') // honeypot: real people never see or fill this
const state = ref<'idle' | 'sending' | 'done' | 'error'>('idle')
const message = ref('')
const id = useId()

async function submit() {
  if (state.value === 'sending') return
  state.value = 'sending'
  message.value = ''
  try {
    const res = await $fetch<{ ok: boolean, message: string }>('/api/subscribe', {
      method: 'POST',
      body: { email: email.value, company: company.value, source: props.source },
    })
    state.value = 'done'
    message.value = res.message
  } catch (e: any) {
    state.value = 'error'
    message.value = e?.data?.message || 'Subscribing failed. Check your connection and try again.'
  }
}
</script>

<template>
  <form :class="['nl', { compact }]" novalidate @submit.prevent="submit">
    <div v-if="state !== 'done'" class="row">
      <label :for="id" class="visually-hidden">Email address</label>
      <input :id="id" v-model.trim="email" type="email" name="email" autocomplete="email" inputmode="email" required placeholder="you@company.com" :aria-invalid="state === 'error'" :aria-describedby="`${id}-msg`">
      <input v-model="company" class="hp" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn btn-primary" type="submit" :disabled="state === 'sending'">{{ state === 'sending' ? 'Subscribing…' : 'Subscribe' }}</button>
    </div>
    <p :id="`${id}-msg`" :class="['msg', state]" role="status" aria-live="polite">
      <template v-if="message">{{ message }}</template>
      <template v-else-if="!compact">A new lab in your inbox most mornings. Unsubscribe from any email.</template>
    </p>
  </form>
</template>

<style scoped>
.nl { display: grid; gap: 10px; width: 100%; max-width: 520px; }
.row { display: flex; gap: 8px; }
input[type=email] {
  flex: 1; min-width: 0; font: inherit; font-size: 1rem; color: var(--ink);
  background: var(--surface); border: 1.5px solid var(--line); border-radius: 999px; padding: 12px 18px;
}
input[type=email]:focus { outline: none; border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-soft); }
input[aria-invalid=true] { border-color: var(--bad); }
.hp { position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0; }
.msg { font-size: .9rem; color: var(--muted); min-height: 1.4em; }
.msg.done { color: var(--ok); font-weight: 600; font-size: 1rem; }
.msg.error { color: var(--bad); }
@media (max-width: 480px) { .row { flex-direction: column; } .row .btn { width: 100%; } }
.compact .row { flex-direction: column; }
.compact .row .btn { width: 100%; }
</style>
