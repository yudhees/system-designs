<script setup lang="ts">
const form = reactive({ topic: '', details: '', name: '', email: '' })
const website = ref('') // honeypot: real people never see or fill this
const startedAt = ref(0)
const state = ref<'idle' | 'sending' | 'done' | 'error'>('idle')
const message = ref('')
const id = useId()
const doneEl = ref<HTMLElement | null>(null)
onMounted(() => { startedAt.value = Date.now() })

const MAX = 2000
const left = computed(() => MAX - form.details.length)

async function submit() {
  if (state.value === 'sending') return
  if (form.topic.trim().length < 3) {
    state.value = 'error'
    message.value = 'Tell us the topic in a few words, like “Leader election”.'
    return
  }
  state.value = 'sending'
  message.value = ''
  try {
    const res = await $fetch<{ ok: boolean, message: string }>('/api/suggest', {
      method: 'POST',
      body: { ...form, website: website.value, startedAt: startedAt.value },
    })
    state.value = 'done'
    message.value = res.message
    await nextTick()
    doneEl.value?.focus({ preventScroll: true })
    doneEl.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  } catch (e: any) {
    state.value = 'error'
    message.value = e?.data?.message || 'Sending failed. Check your connection and try again.'
  }
}

function again() {
  Object.assign(form, { topic: '', details: '' })
  state.value = 'idle'
  message.value = ''
  startedAt.value = Date.now()
}
</script>

<template>
  <div v-if="state === 'done'" ref="doneEl" class="done" role="status" aria-live="polite" tabindex="-1">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
    <div>
      <p class="done-h">{{ message }}</p>
      <p v-if="form.email" class="muted">If it becomes a lab, you'll hear about it at {{ form.email }}.</p>
    </div>
    <button type="button" class="btn btn-small" @click="again">Suggest another</button>
  </div>

  <form v-else class="sg" novalidate @submit.prevent="submit">
    <div class="field">
      <label :for="`${id}-topic`">Topic <span class="req">required</span></label>
      <input :id="`${id}-topic`" v-model="form.topic" type="text" maxlength="120" required placeholder="e.g. How Discord stores trillions of messages" :aria-invalid="state === 'error' && form.topic.trim().length < 3" :aria-describedby="`${id}-msg`">
    </div>

    <div class="field">
      <label :for="`${id}-details`">What should the lab cover? <span class="opt">optional</span></label>
      <textarea :id="`${id}-details`" v-model="form.details" rows="5" :maxlength="MAX" placeholder="A question you got in an interview, an incident you read about, a trade-off you keep getting stuck on, links to sources…" />
      <span v-if="left < 300" class="count muted">{{ left }} characters left</span>
    </div>

    <div class="two">
      <div class="field">
        <label :for="`${id}-name`">Your name <span class="opt">optional</span></label>
        <input :id="`${id}-name`" v-model="form.name" type="text" maxlength="80" autocomplete="name">
      </div>
      <div class="field">
        <label :for="`${id}-email`">Email <span class="opt">optional</span></label>
        <input :id="`${id}-email`" v-model.trim="form.email" type="email" maxlength="254" autocomplete="email" inputmode="email" placeholder="you@company.com">
      </div>
    </div>

    <input v-model="website" class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">

    <div class="foot">
      <button class="btn btn-primary" type="submit" :disabled="state === 'sending'">{{ state === 'sending' ? 'Sending…' : 'Send suggestion' }}</button>
      <p :id="`${id}-msg`" :class="['msg', state]" role="status" aria-live="polite">
        <template v-if="message">{{ message }}</template>
        <template v-else>Your email is only used to tell you when the lab is live.</template>
      </p>
    </div>
  </form>
</template>

<style scoped>
.sg { display: grid; gap: 20px; }
.field { display: grid; gap: 8px; position: relative; }
label { font-weight: 600; font-size: .95rem; }
.req, .opt { font-weight: 500; font-size: 0.875rem; margin-left: 6px; color: var(--muted); }
.req { color: var(--spark); }
input[type=text], input[type=email], textarea {
  width: 100%; font: inherit; font-size: 1rem; color: var(--ink);
  background: var(--bg); border: 1.5px solid var(--line); border-radius: var(--r-md); padding: 12px 14px;
}
textarea { resize: vertical; min-height: 120px; line-height: 1.5; }
input:focus, textarea:focus { outline: none; border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-soft); }
input[aria-invalid=true] { border-color: var(--bad); }
.count { font-size: 0.875rem; justify-self: end; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.hp { position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0; }
.foot { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding-top: 4px; }
.msg { font-size: .9rem; color: var(--muted); flex: 1; min-width: 200px; }
.msg.error { color: var(--bad); }
.done:focus { outline: none; }
.done { display: grid; grid-template-columns: auto 1fr; gap: 14px 16px; align-items: start; }
.done svg { width: 32px; height: 32px; fill: none; stroke: var(--ok); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.done-h { font-weight: 600; font-size: 1.08rem; color: var(--ok); }
.done .muted { font-size: .95rem; margin-top: 4px; }
.done .btn { grid-column: 2; justify-self: start; }
@media (max-width: 560px) {
  .two { grid-template-columns: 1fr; }
  .foot .btn { width: 100%; }
}
</style>
