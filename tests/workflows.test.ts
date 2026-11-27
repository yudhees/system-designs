import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The auto-merge guard lives in YAML and shell and can't run without GitHub, so these
// tests pin the conditions that keep it safe. Loosening one should be a deliberate edit.
const autoMerge = readFileSync('.github/workflows/auto-merge.yml', 'utf8')
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')

describe('auto-merge workflow guard', () => {
  it('only runs for successful pull_request CI runs on claude/ branches from this repo', () => {
    expect(autoMerge).toContain("github.event.workflow_run.event == 'pull_request'")
    expect(autoMerge).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(autoMerge).toContain("startsWith(github.event.workflow_run.head_branch, 'claude/')")
    expect(autoMerge).toContain('github.event.workflow_run.head_repository.full_name == github.repository')
  })

  it('skips drafts, opted-out PRs and PRs with newer commits than CI tested', () => {
    expect(autoMerge).toContain('"$head" != "$TESTED_SHA"')
    expect(autoMerge).toContain('"$draft" = "true"')
    expect(autoMerge).toContain('no-automerge')
  })

  it('merges only the commit CI tested', () => {
    expect(autoMerge).toContain('--match-head-commit "$TESTED_SHA"')
  })

  it('is triggered by the CI workflow', () => {
    expect(autoMerge).toMatch(/workflows:\s*\[CI\]/)
    expect(ci).toMatch(/^name: CI$/m)
  })
})

describe('CI workflow', () => {
  it('runs the tests, the lesson check and the build', () => {
    expect(ci).toContain('npm test')
    expect(ci).toContain('check-lessons.mjs')
    expect(ci).toContain('nuxt build')
  })
})
