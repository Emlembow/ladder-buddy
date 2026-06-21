# Ladder Buddy

Ladder Buddy is a Chrome extension that pairs with your own [everywall/ladder](https://github.com/everywall/ladder) proxy. Click the extension on a page, then open that page through Ladder or open a script-stripped reader view.

Use Ladder Buddy only for sites and content you own, administer, or are otherwise authorized to access and transform.

## What Is Bundled

- A Manifest V3 Chrome extension.
- A Docker Compose setup for a Ladder Buddy image.
- A tiny patch applied on top of upstream `everywall/ladder` at Docker build time.
- Copy/paste setup commands plus a slower manual path if you want to inspect every step.

This repo does not vendor or replace Ladder. The Docker image clones `everywall/ladder`, applies the patch in `docker/ladder-buddy/user-agent-profiles.patch`, and builds the binary locally.

## Quick Start

Prerequisites:

- Docker Desktop or Docker Engine with Compose.
- Chrome or another Chromium browser that supports unpacked extensions.
- Node.js 24+ and Corepack.
- Git.

### macOS, Linux, or Git Bash

```bash
git clone https://github.com/Emlembow/ladder-buddy.git
cd ladder-buddy
corepack enable
pnpm install
pnpm preflight
cp .env.example .env
docker compose up -d ladder
```

### Windows PowerShell

```powershell
git clone https://github.com/Emlembow/ladder-buddy.git
cd ladder-buddy
corepack enable
pnpm install
pnpm preflight
Copy-Item .env.example .env
docker compose up -d ladder
```

Then load the extension:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist` folder inside this repo.
5. Pin **Ladder Buddy** from Chrome's extensions menu.

Configure Ladder Buddy:

- Ladder URL: `http://127.0.0.1:8080`
- Auth: `Basic`
- Username: `admin`
- Password: `change-me`
- Upstream UA: `Auto try profiles`

After that, the settings panel stays collapsed and the popup opens directly to **Open reader** and **Open proxy**.

## Manual Setup

Use this path if you do not want to run the quick commands blindly.

1. Clone the repo.

   ```bash
   git clone https://github.com/Emlembow/ladder-buddy.git
   cd ladder-buddy
   ```

2. Inspect what Docker will build.

   ```bash
   sed -n '1,220p' docker-compose.yml
   sed -n '1,220p' docker/ladder-buddy/Dockerfile
   sed -n '1,260p' docker/ladder-buddy/user-agent-profiles.patch
   ```

   On PowerShell, use:

   ```powershell
   Get-Content docker-compose.yml
   Get-Content docker\ladder-buddy\Dockerfile
   Get-Content docker\ladder-buddy\user-agent-profiles.patch
   ```

3. Create your local environment file and change anything you dislike.

   ```bash
   cp .env.example .env
   ```

   PowerShell:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   Useful values:

   ```dotenv
   LADDER_PORT=8080
   LADDER_USERPASS=admin:change-me
   LADDER_ALLOW_REQUEST_USER_AGENT=true
   LADDER_ALLOW_CUSTOM_USER_AGENT=false
   ```

4. Build and start Ladder.

   ```bash
   docker compose build ladder
   docker compose up -d ladder
   docker compose ps ladder
   ```

   To watch logs, run `docker compose logs -f ladder` in a separate terminal.

5. Build the extension.

   ```bash
   corepack enable
   pnpm install
   pnpm preflight
   ```

6. Load `dist` from `chrome://extensions` using **Load unpacked**.

## Using Ladder Buddy

- **Open reader** fetches the current page through Ladder's `/api` endpoint, strips executable scripts and common page furniture, then renders the article content in an extension page. Images are still loaded through Ladder.
- **Open proxy** opens the current page as `LADDER_BASE_URL/https://current-page.example/path`.
- **Settings** stores the Ladder URL, auth mode, upstream user-agent mode, and reader blocklist in `chrome.storage.local`.

Reader mode is blocklist-based and empty by default. Add one hostname per line, or separate entries with commas/spaces:

```text
example.com
*.internal.example
```

Exact entries match only that host. Wildcard entries match the base host and its subdomains.

## Why This Includes Docker

Vanilla Ladder works for the basic proxy path if you set **Upstream UA** to `Server default` and configure Ladder's container-wide `USER_AGENT`.

The bundled Docker image is recommended because Ladder Buddy can also send per-request user-agent profile choices. The patch adds:

- `X-Ladder-User-Agent-Profile`
- optional `X-Ladder-User-Agent`
- `/api` support for `userAgentProfile` and `userAgent`
- upstream status reporting for profile probing

That lets **Auto try profiles** test bundled profiles and use the first usable response.

## Cloudflare Access

If you expose Ladder outside your machine, protect it. The common setup is:

1. Run Ladder behind a Cloudflare Tunnel.
2. Put the public hostname behind Cloudflare Access.
3. Create a Cloudflare Access service token.
4. In Ladder Buddy, set Auth to `Cloudflare Access`.
5. Paste the Client ID and Client secret.

Keeping `LADDER_USERPASS` enabled as a second gate is recommended.

More details are in [docs/ladder.md](docs/ladder.md).

## Credits

- [everywall/ladder](https://github.com/everywall/ladder) is the proxy Ladder Buddy pairs with. The Docker image in this repo builds from upstream Ladder and applies a small compatibility patch.
- This project started from [Emlembow/chrome-ext-boilerplate](https://github.com/Emlembow/chrome-ext-boilerplate).

## Development

```bash
corepack enable
pnpm install
pnpm dev
```

Load `dist/` from `chrome://extensions` with Developer mode enabled.

## Validation

```bash
pnpm preflight
```

`pnpm preflight` runs TypeScript, ESLint, Vitest, and the production build.
