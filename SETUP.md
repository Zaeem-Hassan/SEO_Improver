---
env:
  - name: GSC_CREDENTIALS_JSON
    description: JSON key of a Google service account added as a user on your Search Console property
    url: https://console.cloud.google.com/iam-admin/serviceaccounts
  - name: DATAFORSEO_LOGIN
    description: DataForSEO API login, for the competitive SERP picture
    url: https://app.dataforseo.com/api-access
  - name: DATAFORSEO_PASSWORD
    description: DataForSEO API password, shown next to the login
    url: https://app.dataforseo.com/api-access
  - name: GH_TOKEN
    description: GitHub token with write access to the blog repo; only for the optional pull-request flow
    url: https://github.com/settings/personal-access-tokens
    optional: true
config:
  - name: Search Console property
    description: The property the agent reads rankings from
    example: sc-domain:example.com
  - name: Project domain
    description: The site being improved
    example: example.com
  - name: Tracked keywords
    description: Keywords to track week over week; omit to derive them from the domain's own ranked keywords
    optional: true
  - name: Blog repo and content path
    description: GitHub repo and content directory for the pull-request flow; unset stays report-only
    example: acme/blog, content/posts/
    optional: true
---

# Setup

## Google Search Console

The agent reads rankings through a Google service account that your Search Console
property trusts. Any Google Cloud project on any of your Google accounts works; the
only thing that ties it to your site is adding its email as a user in Search Console.

With the gcloud CLI signed in:

```bash
gcloud services enable searchconsole.googleapis.com
gcloud iam service-accounts create seo-improver
gcloud iam service-accounts keys create /tmp/seo-improver-key.json \
  --iam-account=seo-improver@PROJECT_ID.iam.gserviceaccount.com
```

Without gcloud: in the [Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts),
enable the Search Console API, create a service account (no roles needed), and add a
JSON key under Keys, then Add key. Keep the key file outside the project and delete it
once the env var is set.

Then the one step that is always manual: in [Search Console](https://search.google.com/search-console),
select the property, open Settings, then Users and permissions, click Add user, and add
the service account's email. Restricted permission is enough; the agent only reads.

Set `GSC_CREDENTIALS_JSON` to the entire key-file JSON as a single line.

To verify: mint an access token from the key (JWT bearer grant against
`https://oauth2.googleapis.com/token`, scope `https://www.googleapis.com/auth/webmasters.readonly`)
and `GET https://www.googleapis.com/webmasters/v3/sites`. The token-minting code ships in
`agent/lib/search-console.ts`, ready to reuse. Free and read-only. The property
must appear with a `permissionLevel` other than `siteUnverifiedUser`; an empty list means
the user-add step is missing or still propagating (it can take a minute).

## DataForSEO

DataForSEO provides the competitive layer: who ranks above you, search volume, keyword
gaps. Sign up at [dataforseo.com](https://dataforseo.com) (trial credit available), then
copy the API login and password from the [API Access page](https://app.dataforseo.com/api-access).
The API credentials are separate from your dashboard sign-in.

To verify: `GET https://api.dataforseo.com/v3/appendix/user_data` with HTTP Basic auth
(login:password). Free and read-only; expect `status_code: 20000` in the response body.

## Store the values

Local runs read `.env.local` (gitignored). Deployed and scheduled runs read Vercel
project env: `vercel env add NAME production` takes the value from stdin, so pipe it in.
Keep `GSC_CREDENTIALS_JSON` on a single line, quoted so the embedded quotes and
backslashes survive dotenv parsing.

## Point it at your project

Fill in the `<!-- project-config -->` block at the top of `agent/instructions.md` with
your property, domain, and optional keywords and blog repo. Leaving the blog repo unset
keeps the agent report-only. Setting it lets the agent open pull requests against your
blog: it runs the `gh` CLI in its sandbox and never pushes to your default branch. `gh`
authenticates from `GH_TOKEN`; if the GitHub CLI is signed in locally, `gh auth token`
prints one, or create a fine-grained token with write access to just that repo.
