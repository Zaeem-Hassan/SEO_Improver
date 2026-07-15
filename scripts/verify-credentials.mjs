// Read-only credential checks from SETUP.md. Free; no writes, no metered calls.
// Run from the project dir:  node --env-file=.env.local <this file>
import { pathToFileURL } from "node:url";
import path from "node:path";

const projectDir = process.cwd();
const results = [];

// --- Google Search Console -------------------------------------------------
// Reuses the agent's own token-minting code (agent/lib/search-console.ts).
if (!process.env.GSC_CREDENTIALS_JSON) {
  results.push(["GSC_CREDENTIALS_JSON", "SKIP", "not set in .env.local"]);
} else {
  try {
    JSON.parse(process.env.GSC_CREDENTIALS_JSON);
  } catch (e) {
    results.push(["GSC_CREDENTIALS_JSON", "FAIL", `not valid JSON on one line: ${e.message}`]);
  }
  try {
    const libUrl = pathToFileURL(path.join(projectDir, "agent", "lib", "search-console.ts")).href;
    const { listSites } = await import(libUrl);
    const sites = await listSites();
    const entries = sites?.siteEntry ?? [];
    if (entries.length === 0) {
      results.push([
        "GSC_CREDENTIALS_JSON",
        "FAIL",
        "token minted, but no properties returned — the service account is not yet a user on the property (or is still propagating)",
      ]);
    } else {
      const usable = entries.filter((s) => s.permissionLevel !== "siteUnverifiedUser");
      results.push([
        "GSC_CREDENTIALS_JSON",
        usable.length ? "PASS" : "FAIL",
        entries.map((s) => `${s.siteUrl} (${s.permissionLevel})`).join(", "),
      ]);
    }
  } catch (e) {
    results.push(["GSC_CREDENTIALS_JSON", "FAIL", e.message]);
  }
}

// --- DataForSEO ------------------------------------------------------------
const login = process.env.DATAFORSEO_LOGIN;
const password = process.env.DATAFORSEO_PASSWORD;
if (!login || !password) {
  results.push(["DATAFORSEO_LOGIN/PASSWORD", "SKIP", "not set in .env.local"]);
} else {
  try {
    const auth = Buffer.from(`${login}:${password}`).toString("base64");
    const res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
      headers: { authorization: `Basic ${auth}` },
    });
    const body = await res.json();
    if (body?.status_code === 20000) {
      const money = body?.tasks?.[0]?.result?.[0]?.money;
      const balance = money?.balance ?? "unknown";
      results.push(["DATAFORSEO_LOGIN/PASSWORD", "PASS", `status_code 20000, balance: ${balance}`]);
    } else {
      results.push([
        "DATAFORSEO_LOGIN/PASSWORD",
        "FAIL",
        `HTTP ${res.status}, status_code ${body?.status_code}: ${body?.status_message}`,
      ]);
    }
  } catch (e) {
    results.push(["DATAFORSEO_LOGIN/PASSWORD", "FAIL", e.message]);
  }
}

// --- GH_TOKEN (optional) ---------------------------------------------------
if (!process.env.GH_TOKEN) {
  results.push(["GH_TOKEN (optional)", "SKIP", "not set — agent stays report-only"]);
} else {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, "user-agent": "seo-improver-setup" },
    });
    const body = await res.json();
    results.push([
      "GH_TOKEN (optional)",
      res.ok ? "PASS" : "FAIL",
      res.ok ? `authenticated as ${body.login}` : `HTTP ${res.status}: ${body.message}`,
    ]);
  } catch (e) {
    results.push(["GH_TOKEN (optional)", "FAIL", e.message]);
  }
}

for (const [name, status, detail] of results) {
  console.log(`${status.padEnd(5)} ${name}\n      ${detail}\n`);
}
