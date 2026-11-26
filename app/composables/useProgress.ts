// "Done" marks live in the reader's browser only. No account needed.
const KEY = 'sdl:done'

export function useProgress() {
  const done = useState<string[]>('sdl-done', () => [])
  const loaded = useState('sdl-done-loaded', () => false)

  onMounted(() => {
    if (loaded.value) return
    try { done.value = JSON.parse(localStorage.getItem(KEY) || '[]') } catch { done.value = [] }
    loaded.value = true
  })

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(done.value)) } catch { /* private mode */ } }
  const isDone = (slug: string) => done.value.includes(slug)
  const toggle = (slug: string) => {
    done.value = isDone(slug) ? done.value.filter(s => s !== slug) : [...done.value, slug]
    save()
  }
  return { done, isDone, toggle }
}
