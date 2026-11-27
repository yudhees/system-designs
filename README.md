# System Design Lab

A free, public site for interactive system design labs: real incidents, the concept behind the fix, a live simulator, and a design problem with a model answer. Built with **Nuxt 4**, deployed on **Vercel**.

```
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (prerenders every page)
```

## How content works

| What | Where | Notes |
| --- | --- | --- |
| Labs | `content/lessons/YYYY-MM-DD-<slug>.html` | One self-contained HTML file per lab, exactly as the daily scheduled task publishes it. Title, topic, summary, reading time and sections are read from the file at build time. Served at `/labs/<slug>` (inside the site) and `/lab-files/<slug>.html` (raw). |
| Articles | `content/articles/<slug>.md` | Markdown with `title`, `date`, `summary` front matter. |
| About page, LinkedIn, contact | `app/app.config.ts` | Empty fields are hidden. |

Optional overrides inside a lab's HTML: `<meta name="sdl:topic" content="Caching">`, `<meta name="sdl:summary" content="…">`, `<meta name="sdl:title" content="…">`. Without them, the topic comes from the eyebrow line (`System Design Lab · date · Topic`) and the summary from the `.lede` paragraph.

`node scripts/check-lessons.mjs` validates lesson files (naming, size, title, h1, truncation, script origins).

## Daily auto-publish

```
scheduled task (06:30 IST) ── publishes the artifact
        └─ commits content/lessons/<date>-<slug>.html to a claude/* branch and pushes
GitHub Action "Publish lesson"
        ├─ only new lesson files on the branch? otherwise stop (leave it for a PR)
        ├─ check-lessons + full nuxt build
        ├─ fast-forward main, delete the branch
        └─ (optional) create a Kit broadcast announcing the lab
Vercel ── deploys main
```

The scheduled task's prompt needs one extra step, plus this repository attached as a source:

> After publishing the artifact, save the exact same HTML to `content/lessons/<YYYY-MM-DD>-<slug>.html` in the `yudhees/system-designs` repository (slug: lowercase topic, hyphens, e.g. `idempotency-keys`). Run `node scripts/check-lessons.mjs <that file>`, commit only that file with the message `lesson: <Topic> (<YYYY-MM-DD>)`, and push it to your working branch. Don't open a pull request; a GitHub Action publishes it.

## Auto-merge for Claude pull requests

`.github/workflows/auto-merge.yml` runs after every CI run. When CI (lesson check + `nuxt build`) passes on an open pull request from a `claude/*` branch of this repository, it squash-merges the PR into `main` and deletes the branch, so Vercel deploys it without a manual merge.

It skips a PR that is a draft, has the `no-automerge` label, or got new commits after CI started. To hold a Claude PR for review, mark it as a draft or add that label.

## Newsletter

`POST /api/subscribe` adds an email to the provider set by `NUXT_NEWSLETTER_PROVIDER`:

- **Kit** (recommended): free up to 10,000 subscribers, API included. Create a form in Kit, turn on double opt-in for it, then set `NUXT_KIT_API_KEY` (v4 key) and `NUXT_KIT_FORM_ID` in Vercel. New subscribers are created as inactive and added to the form, so Kit's confirmation email decides when they're active.
- **Buttondown**: free up to 100 subscribers. Set `NUXT_BUTTONDOWN_API_KEY`.

Until keys are set, the form shows "Subscriptions open soon".

To announce each new lab automatically, add a `KIT_API_KEY` repository secret. Broadcasts are saved as **drafts** in Kit by default; set the repository variable `KIT_BROADCAST_MODE=send` to send them automatically, and `SITE_URL` to your domain.

## Deploying on Vercel

1. vercel.com → Add New → Project → import `yudhees/system-designs`. Vercel detects Nuxt; keep the defaults.
2. Project name sets the free domain: `<name>.vercel.app`.
3. Environment variables: `NUXT_PUBLIC_SITE_URL=https://<name>.vercel.app`, plus the newsletter keys above.
4. Production branch: `main`.
