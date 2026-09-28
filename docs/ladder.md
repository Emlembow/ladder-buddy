# Alternate Ladder Buddy Docker Setup

The [Mac installer](../README.md#install-on-a-mac) is the shortest path. Docker remains available for development and other platforms. It builds [everywall/ladder](https://github.com/everywall/ladder) from a pinned commit with a patch that lets the extension choose an upstream user-agent profile per request.

## Local Docker

Copy the environment example and start the service:

```bash
cp .env.example .env
docker compose up -d ladder
```

PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up -d ladder
```

Build the extension with Node.js 24+ and pnpm 10+:

```sh
pnpm install --frozen-lockfile
pnpm preflight
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose this repository's `dist` folder.

Open **Advanced settings** in the extension and select **Custom Ladder**. Use these connection settings:

- Ladder URL: `http://127.0.0.1:8080`
- Auth: `Basic`
- Username: `admin`
- Password: `change-me`
- Upstream UA: `Auto try profiles`

If port `8080` is unavailable, edit `.env`:

```dotenv
LADDER_PORT=18080
```

Then use `http://127.0.0.1:18080` in Ladder Buddy.

## What The Patch Adds

Stock Ladder supports a container-wide `USER_AGENT` and ruleset user agents. Ladder Buddy's image also accepts request-level overrides:

- `X-Ladder-User-Agent-Profile`
- optional `X-Ladder-User-Agent`
- `userAgentProfile` and `userAgent` in `/api` JSON requests
- upstream response status in `/api`
- `X-Ladder-Upstream-Status` on proxied responses

Useful `.env` knobs:

```dotenv
LADDER_PORT=8080
LADDER_REF=76143f7473a86e750787cf6f44756964363f9bbc
LADDER_USERPASS=admin:change-me
LADDER_RULESET=https://raw.githubusercontent.com/everywall/ladder-rules/main/ruleset.yaml
LADDER_LOG_URLS=false
LADDER_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36
LADDER_ALLOW_REQUEST_USER_AGENT=true
LADDER_ALLOW_CUSTOM_USER_AGENT=false
```

The default is the tested upstream commit. Change `LADDER_REF` only when also updating and validating the patch against that commit.

## User-Agent Modes

- `Auto try profiles`: calls Ladder's `/api` endpoint with each auto profile, then opens the page with the first response that is 2xx/3xx and does not look like a block page.
- `Server default`: uses Ladder's normal container-wide `USER_AGENT` and ruleset behavior.
- Named profiles: sends one bundled profile ID, such as `browser-chrome`, `googlebot-desktop`, `bingbot-desktop`, `facebookexternalhit`, `oai-searchbot`, or `perplexitybot`.
- `Custom string`: sends a raw `X-Ladder-User-Agent` value. This is ignored unless `LADDER_ALLOW_CUSTOM_USER_AGENT=true`.

A user-agent string is only a claim. Real crawler identity is normally verified by IP/DNS or signed request mechanisms where a provider offers them.

## Reader Mode

Use **Open reader** when you want Ladder Buddy to fetch the page through Ladder's `/api` endpoint, strip executable scripts, remove common overlays/promos/navigation, and render the remaining article content in an extension page. Images are rewritten back through Ladder so the same auth and user-agent headers apply.

Reader mode uses a blocklist, not an allowlist. Leave **Reader blocked hosts** empty to let users decide where they use it, or add exact/wildcard hosts to disable reader mode for those sites:

```text
example.com
*.example.org
```

Only use reader mode for sites and content you own or are authorized to transform.

## Cloudflare

1. Create a Cloudflare Tunnel public hostname, for example `ladder.example.com`, that points to the Ladder container on port `8080`.
2. Put that hostname behind Cloudflare Access.
3. Create a Service Auth policy and service token.
4. Configure the tunnel token wherever you run `cloudflared`.
5. Start Ladder:

   ```bash
   docker compose up -d ladder
   ```

Use `https://ladder.example.com` in Ladder Buddy and set Auth to Cloudflare Access:

- Client ID -> `CF-Access-Client-Id`
- Client secret -> `CF-Access-Client-Secret`

The extension's custom connection supports one auth mode at a time. If using Cloudflare Access, set `LADDER_USERPASS=` in `.env` so Ladder does not also require Basic auth; keep the tunnel behind a Cloudflare Access policy. For a direct connection, use Basic auth with a unique password instead of the example value.

## User-Agent Sources

The bundled profile list is intentionally explicit instead of downloaded at runtime. Sources checked while adding it:

- [Google common crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)
- [Bingbot user-agent change](https://blogs.bing.com/webmaster/april-2022/Announcing-user-agent-change-for-Bing-crawler-bingbot)
- [OpenAI crawlers](https://developers.openai.com/api/docs/bots)
- [Anthropic crawler controls](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Slack robots](https://api.slack.com/robots)
- [Pinterestbot](https://help.pinterest.com/en/business/article/pinterestbot)
- [Perplexity crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)
