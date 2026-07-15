# SEO Improver

An AI agent that reads your real Google Search Console data, tells you exactly what to change to rank higher, and — the important part — comes back next cycle to check whether last cycle's changes actually worked.

Not an SEO audit tool. An audit tells you what's wrong once. This runs on a loop: it writes down what it recommended, and grades itself against Google's numbers the next time it wakes up.

> **This is a ready-to-run packaging of the [Atom Eve](https://github.com/elie222/atom-eve) `seo-improver` agent.** The agent itself is by the Atom Eve maintainers (MIT). This repo exists because the published `atom-eve` CLI currently can't install it — see [Why this repo exists](#why-this-repo-exists). Clone this and skip that problem entirely.

---

## How it works

An agent is really just five things. This one is no different:

| Piece | File | What it is |
|---|---|---|
| **The brain** | `agent/agent.ts` | Which model does the thinking (Claude Sonnet 5) |
| **The job description** | `agent/instructions.md` | The whole SEO strategy — in plain English, not code |
| **The keys** | `agent/tools/`, `agent/connections/` | Search Console + DataForSEO access |
| **The alarm clock** | `agent/schedules/weekly.ts` | When it wakes up |
| **The notebook** | `reports/seo-improver/<date>/` | What it did, so next run can grade it |

The interesting file is `agent/instructions.md`. Open it — there's no `if position < 20` anywhere. The strategy is written in English and the model executes it. If you want to change how this agent thinks, you edit prose, not TypeScript.

### The loop

1. Pull your real performance from Search Console (clicks, impressions, CTR, average position).
2. Pull the competitive picture from DataForSEO (who ranks above you, and what their pages do).
3. **Read the previous run** from `reports/` and compute what moved: gained, lost, new, dropped, flat.
4. Find the highest-leverage opportunities:
   - **Striking distance** — you're at position ~4–20 and a focused fix could win page one.
   - **High impressions, low CTR** — people see you and don't click. Rewrite the title/meta; no new ranking needed.
   - **Cannibalization** — two of your own pages fighting over one keyword.
   - **Decay** — a page that slipped since last run. *This one only exists because there was a last run.*
5. Write a specific, ready-to-apply change for each — the exact title, the section to add, the links to add.
6. **Grade last cycle**: for every recommendation it made, did it get applied, and did the ranking respond? Keep what worked.

Each recommendation gets a stable ID (`SEO-STRIKE-001`, `SEO-CTR-002`, `SEO-DECAY-003`) so the next run can report on the same one.

### What you get

Two files per run, under `reports/seo-improver/<YYYY-MM-DD>/`:

- **`rankings.csv`** — the snapshot for week-over-week diffing:
  ```csv
  keyword,location,device,position,previous_position,delta,ranking_url,search_volume,serp_features,status
  ```
  `status` is `gained` / `lost` / `new` / `dropped` / `flat`. On the first run `previous_position` is blank — it says outright that it's a baseline with nothing to compare against.

- **`report.md`** — executive summary, movement since last run, whether last run's changes worked, this cycle's ordered action list, and any data caveats.

---

## What it doesn't do

- **It doesn't touch your site.** Report-only by default.
- **It doesn't publish.** If you configure a blog repo it can open a pull request — it never pushes to your default branch and never merges. You review the diff.
- **It doesn't invent data.** If Search Console or DataForSEO is unauthorized, it stops and reports the blocker instead of guessing. If you skip DataForSEO, expect it to halt there — that's the design, not a bug.
- **It doesn't claim credit it can't prove.** Rankings move for lots of reasons — Google updates, competitors, seasonality. It makes one change per term so movement is readable, and reports what it can't attribute.

---

## Requirements

| What | Cost | Why |
|---|---|---|
| **Google Search Console** property + service account | Free | Where you actually rank |
| **DataForSEO** account | Metered, pay-as-you-go | Who's beating you (check their current pricing) |
| **Vercel** account | Free tier works | Eve routes model calls through the Vercel AI Gateway |
| **Node.js 24+** | Free | Runtime |
| **GitHub token** | Free | *Optional* — only for the pull-request flow |

Model tokens are a few dollars per run. DataForSEO is a real line item on top of that, so budget for both.

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Zaeem-Hassan/SEO_Improver.git
cd SEO_Improver
npm install
```

### 2. Get a Google service account

Any Google Cloud project works. The only thing tying it to your site is step 3.

```bash
gcloud services enable searchconsole.googleapis.com
gcloud iam service-accounts create seo-improver
gcloud iam service-accounts keys create ~/seo-improver-key.json \
  --iam-account=seo-improver@PROJECT_ID.iam.gserviceaccount.com
```

No `gcloud`? In the [Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts): enable the Search Console API, create a service account (no roles needed), then **Keys → Add key → JSON**.

Keep the key file **outside** this repo and delete it once step 4 is done.

### 3. Give it access to your property

The one step that's always manual. In [Search Console](https://search.google.com/search-console): pick your property → **Settings → Users and permissions → Add user** → paste the service account's email. **Restricted** is enough — it only reads.

### 4. Add your credentials

Create `.env.local` (gitignored — never commit it):

```bash
# The entire key file JSON, on ONE line, single-quoted.
GSC_CREDENTIALS_JSON='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n..."}'

# From https://app.dataforseo.com/api-access (separate from your dashboard login)
DATAFORSEO_LOGIN=your-login
DATAFORSEO_PASSWORD=your-password

# Optional — only for the pull-request flow. Leave unset to stay report-only.
# GH_TOKEN=
```

### 5. Verify your credentials

```bash
node --env-file=.env.local scripts/verify-credentials.mjs
```

Read-only and free — it lists your properties and checks your DataForSEO balance. It reuses the agent's own auth code, so a failure here is a real API error, not a script bug.

If Search Console returns **no properties**, step 3 is missing or still propagating (give it a minute).

### 6. Point it at your site

Edit the config block at the top of `agent/instructions.md`:

```markdown
<!-- project-config -->
Search Console property: sc-domain:example.com
Project domain: example.com
Tracked keywords: not set (derive from the domain's own ranked keywords)
Blog repo and content path: not set (report-only)
<!-- /project-config -->
```

Leave the blog repo unset to stay report-only. Set it (e.g. `acme/blog, content/posts/`) to enable pull requests.

### 7. Link Vercel and run

```bash
npx vercel link      # required — this is how model calls get billed
npm exec -- eve dev
```

Then send it:

```
run your weekly SEO review for example.com
```

The first run is your baseline — there's nothing to compare against yet. The loop starts closing on run two.

### 8. Schedule it

`agent/schedules/weekly.ts` is set to 9am every Monday (`0 9 * * 1`). Deploy with `vercel deploy` (or push to the linked project) and it runs on Vercel Cron.

**Consider monthly instead** (`0 9 1 * *`): Google has to recrawl and rankings have to settle. Grade a title change after a week and you're mostly grading noise.

---

## Security

Worth reading if you're wiring this to a client's property:

- **The model never sees your Google key.** `agent/lib/search-console.ts` signs a JWT and exchanges it for a short-lived token *inside the tool*. The key never enters model context.
- **The token is read-only by construction.** Scope is `webmasters.readonly` — not a promise, a limit.
- **DataForSEO credentials never reach the model either** — the Basic auth header is built at the connection layer.
- **Least privilege.** DataForSEO's hosted MCP exposes their whole catalog; this agent allowlists exactly four read tools (`agent/connections/dataforseo.ts`).
- **`agent/channels/eve.ts` ships with `placeholderAuth()`**, which blocks browser requests in production. Fine locally — replace it with a real auth provider before deploying anything client-facing.
- The sandbox runs with an open network policy, because the agent has to reach whatever site it's auditing.

---

## Why this repo exists

The documented install path from [atomeve.dev](https://www.atomeve.dev/start.md) is `npx atom-eve create my-agent --agent seo-improver`. As of July 2026, **that fails for every agent in the registry**, including the docs' own example: the CLI fetches `registry/<agent>/atom.json`, which doesn't exist — the registry moved to README-frontmatter manifests and the published CLI (0.1.4) predates that change.

This repo is that agent, already installed, so you can skip it.

If you're installing from the upstream registry yourself on Windows, three more things will bite you:

1. `atom-eve create` spawns `npx` without a shell → `spawnSync npx ENOENT`. Scaffold with `npx eve init <name>` directly instead.
2. Local-path installs are detected via `startsWith(".") || startsWith("/")`, so `C:\...` paths are treated as registry names. Use a relative `./` path.
3. If you have `core.autocrlf=true`, the CRLF checkout defeats the frontmatter parser's `/^---\n/`. Clone with `git -c core.autocrlf=false`.

---

## Credits

The `seo-improver` agent — its instructions, tools, and design — is by the **[Atom Eve](https://github.com/elie222/atom-eve)** maintainers, MIT licensed. Built on the [Eve](https://github.com/vercel/eve) framework by Vercel.

This repo adds a working pre-installed checkout, a credential verification script, and the Windows notes above.

## License

MIT — see [LICENSE](./LICENSE). Original copyright © 2026 Atom Eve maintainers.
