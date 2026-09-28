# Ladder Buddy

Ladder Buddy opens a page through a local [Ladder](https://github.com/everywall/ladder) proxy or in a script-free reader view. It can try several upstream user-agent profiles automatically. Use it only for sites and content you own, administer, or are authorized to access and transform.

## Install on a Mac

Requires macOS, Google Chrome, and an Apple Silicon or Intel Mac. No Docker, Node.js, Git, or administrator access is needed on the Mac being set up.

1. Paste this command into Terminal:

   ```sh
   bash -o pipefail -c 'curl -fsSL https://github.com/Emlembow/ladder-buddy/releases/latest/download/install-macos.sh | bash'
   ```

2. In the Chrome extensions page opened by the installer, turn on **Developer mode**, click **Load unpacked**, and select `~/Library/Application Support/Ladder Buddy/extension`. This Chrome step is required once for a private unpacked extension.

3. Pin Ladder Buddy from Chrome's extensions menu. Open a page and click **Open reader** or **Open proxy**. The extension gets its local connection automatically; there is no URL or password to enter.

Run the same Terminal command again to update or repair the installation. It preserves your extension settings and local credentials. After an update, click **Reload** for Ladder Buddy on `chrome://extensions`.

The installer downloads the archive for your Mac, verifies its SHA-256 checksum, installs the Ladder binary and helper under `~/Library/Application Support/Ladder Buddy`, and starts a per-user login agent. It registers a Chrome native messaging host so the extension can discover the live local address and credentials. Ladder listens only on `127.0.0.1` and chooses another free port when 8080 is busy. A private unsigned build may prompt a macOS security warning.

For inspection before running it, download [`install-macos.sh`](https://github.com/Emlembow/ladder-buddy/releases/latest/download/install-macos.sh) from the release page and read it first. Release archives include the corresponding patched Ladder source and license notices.

## Using Ladder Buddy

- **Open reader** fetches the page through Ladder's `/api` endpoint, removes scripts and common page furniture, then displays it in an extension page. Images are loaded through Ladder.
- **Open proxy** navigates the tab through Ladder's proxy, including its HTML and asset rewriting.
- **Advanced settings** contains upstream user-agent choices and the reader blocklist. **Auto try profiles** probes the bundled profiles and uses the first usable response. A user-agent string alone does not provide verified crawler identity.

Reader mode is blocklist-based and empty by default. Add one hostname per line, or separate entries with commas or spaces:

```text
example.com
*.internal.example
```

An exact entry matches only that host. A wildcard entry matches the base host and subdomains.

### If the extension says the helper is missing

Run the install command again, then reload Ladder Buddy on `chrome://extensions`. If Chrome reports an incompatible version, install the latest release and reload the extension. The installer can be rerun without clearing settings.

## Alternate Docker setup

The [Docker instructions](docs/ladder.md) remain available for development, Linux, Windows, or a separately hosted Ladder instance. That path requires manual connection settings in the extension. The Mac installer is the recommended route for friends using Chrome.

## Development

This repository contains the Chrome extension, Mac helper, release scripts, and a patch to a pinned upstream Ladder commit. To build locally, install Node.js 24+, pnpm 10+, Go, and Git:

```sh
pnpm install --frozen-lockfile
pnpm preflight
```

`pnpm preflight` runs TypeScript, ESLint, Vitest, and the extension build. Release automation builds both `darwin/arm64` and `darwin/amd64` binaries and packages the patched upstream source.

## Credits and licenses

[everywall/ladder](https://github.com/everywall/ladder) is GPL-3.0-licensed software. Ladder Buddy applies a small compatibility and loopback-listener patch and includes the corresponding source and notices in binary releases. The extension and helper are MIT-licensed; see [LICENSE](LICENSE). This project started from [Emlembow/chrome-ext-boilerplate](https://github.com/Emlembow/chrome-ext-boilerplate).
