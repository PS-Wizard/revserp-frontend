---
name: revserp
description: Use when the user asks about Revserp projects, crawl results, website issues, SEO, AEO, PageSpeed, scores, page health, links, site graphs, trends, or recommended fixes. Retrieves read-only data from the Revserp platform.
---

# Revserp skill

Read-only access to Revserp SEO data through curl. This skill supports GET requests only. It cannot change Revserp data.

- Default API base: `https://api.revserp.ai`
- If the connection message supplies a different API base, use it instead for setup and all API requests.
- Integrations page: `https://revserp.ai/app/settings/integrations`

## Install this skill

Before setup, check whether the Revserp skill is already installed in this AI assistant's normal skills location.

- If it is installed, use the installed copy and continue.
- If it is not installed, ask: **"Would you like me to install the Revserp skill for future use? This lets me fetch your Revserp data whenever you ask, without making you repeat this setup."**
- Keep this explanation nontechnical. Do not mention API bases, localhost, URLs, file paths, commands, setup codes, or credentials unless setup fails and the detail is necessary to resolve the problem.
- If the user agrees, install this exact `SKILL.md` with the AI assistant's normal skill installation method, then continue from the installed copy.
- If the user declines, continue for this session without installing it.
- Do not store the setup code, authorization header, or other credentials in the installed skill.
- After successful setup, say that Revserp is connected and give a few examples of what the user can ask. Do not report internal setup details.

## Credential file

The credential lives in one file:

```text
POSIX:      $REVSERP_CONFIG_HOME/auth-header  (or $HOME/.revserp/auth-header)
PowerShell: $env:REVSERP_CONFIG_HOME\auth-header  (or $HOME\.revserp\auth-header)
```

The file holds one line: `Authorization: Bearer rvs_live_...`.

Rules:

- Never print, read, summarize, or copy this file.
- Check it only with a file-exists test (see below).
- If the file already exists, ask the user before you replace it.
- If a request returns `401`, tell the user to open the Integrations page and connect again. The key may be revoked.

The file rules stop accidental disclosure. They cannot protect against a malicious local agent, which can read any user file.

## Detect the credential file

POSIX (bash, zsh):

```bash
config_dir="${REVSERP_CONFIG_HOME:-$HOME/.revserp}"
auth_file="$config_dir/auth-header"
test -s "$auth_file" && echo "configured"
```

PowerShell:

```powershell
$configDir = if ($env:REVSERP_CONFIG_HOME) { $env:REVSERP_CONFIG_HOME } else { Join-Path $HOME ".revserp" }
$authFile = Join-Path $configDir "auth-header"
(Test-Path $authFile) -and ((Get-Item $authFile).Length -gt 0)
```

If not configured, do setup below.

## Setup redemption

Ask the user to open the Integrations page, click **Connect an AI agent**, and paste the setup code to you. The code starts with `rvs_setup_`. It expires after 10 minutes and works once.

Warn the user: the setup code is sensitive. Do not put it in a URL, shell history, or a log. Send it only in the POST body below.

### POSIX

```bash
set -euo pipefail
umask 077
config_dir="${REVSERP_CONFIG_HOME:-$HOME/.revserp}"
auth_file="$config_dir/auth-header"
if [ -e "$auth_file" ]; then
	printf '%s\n' "Revserp is already configured. Ask before replacing it." >&2
	exit 1
fi
mkdir -m 0700 -p "$config_dir"
chmod 0700 "$config_dir"
tmp="$(mktemp "$config_dir/auth-header.tmp.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
if [ -n "${ZSH_VERSION:-}" ]; then
	read -r -s "code?Setup code: "
else
	read -r -s -p "Setup code: " code
fi
printf '\n'
printf '{"code":"%s"}' "$code" | curl -fsS -X POST https://api.revserp.ai/agent/setup \
  -H "Content-Type: application/json" \
  --data-binary @- -o "$tmp"
unset code
mv "$tmp" "$auth_file"
chmod 0600 "$auth_file"
trap - EXIT
```

The rename happens only after curl succeeds. The response body is the full auth header line. Do not print it.

### PowerShell

```powershell
$ErrorActionPreference = "Stop"
$configDir = if ($env:REVSERP_CONFIG_HOME) { $env:REVSERP_CONFIG_HOME } else { Join-Path $HOME ".revserp" }
$authFile = Join-Path $configDir "auth-header"
if (Test-Path $authFile) { throw "Revserp is already configured. Ask before replacing it." }
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$secureCode = Read-Host "Setup code" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCode)
try { $code = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
$body = @{ code = $code } | ConvertTo-Json -Compress
$tmp = Join-Path $configDir ("auth-header.tmp." + [guid]::NewGuid().ToString("N"))
$body | curl.exe -fsS -X POST https://api.revserp.ai/agent/setup `
  -H "Content-Type: application/json" `
  --data-binary "@-" -o $tmp
$code = $null
$body = $null
if ($LASTEXITCODE -ne 0) { Remove-Item $tmp; throw "setup failed" }
Move-Item $tmp $authFile
```

Use `curl.exe`, not the PowerShell `curl` alias. Use `Test-Path` for detection. Move the temp file into place only after success.

## Verify

```bash
curl -fsS --header @"$auth_file" https://api.revserp.ai/v1/me
```

PowerShell:

```powershell
curl.exe -fsS --header "@$authFile" https://api.revserp.ai/v1/me
```

This returns the user and organization memberships. Use it first to find an organization ID.

## Operations

All endpoints are GET and read-only. All IDs are UUIDs.

```text
GET /v1/me
GET /v1/organizations/{organizationID}/projects
GET /v1/projects/{projectID}
GET /v1/projects/{projectID}/crawls
GET /v1/projects/{projectID}/bucket-trends
GET /v1/projects/{projectID}/score-potential
GET /v1/crawls/{crawlID}
GET /v1/crawls/{crawlID}/score-breakdown
GET /v1/crawls/{crawlID}/page-health
GET /v1/crawls/{crawlID}/pages
GET /v1/crawls/{crawlID}/issues
GET /v1/crawls/{crawlID}/links
GET /v1/crawls/{crawlID}/site-graph
GET /v1/crawl-pages/{pageID}
GET /v1/crawl-issues/{issueID}
GET /v1/crawl-links/{linkID}
```

## Examples

List projects for one organization:

```bash
curl -fsS --header @"$auth_file" \
  "https://api.revserp.ai/v1/organizations/$org_id/projects"
```

Get one project:

```bash
curl -fsS --header @"$auth_file" \
  "https://api.revserp.ai/v1/projects/$project_id"
```

List issues for a crawl:

```bash
curl -fsS --header @"$auth_file" \
  "https://api.revserp.ai/v1/crawls/$crawl_id/issues"
```

## Pagination

Four list endpoints support `limit` and `offset` query parameters. The response contains a `pagination` object with `limit`, `offset`, `count`, and `total`. Default `limit` is 50, maximum is 200.

- `/v1/projects/{projectID}/crawls`
- `/v1/crawls/{crawlID}/pages`
- `/v1/crawls/{crawlID}/issues`
- `/v1/crawls/{crawlID}/links`

Example:

```bash
curl -fsS --header @"$auth_file" \
  "https://api.revserp.ai/v1/crawls/$crawl_id/pages?limit=50&offset=50"
```

Use pagination instead of dumping large responses. Other endpoints have no pagination parameters; call them as single requests.

## Errors

- `401`: unknown, malformed, or revoked key. Tell the user to go to `https://revserp.ai/app/settings/integrations` and connect again.
- `403 account suspended`: the account is suspended. Contact Revserp support.
