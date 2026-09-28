# Ladder Buddy for Mac

Install with one Terminal command:

```sh
bash -o pipefail -c 'curl -fsSL https://github.com/Emlembow/ladder-buddy/releases/latest/download/install-macos.sh | bash'
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `~/Library/Application Support/Ladder Buddy/extension`. This Chrome step is needed once. Rerun the same Terminal command to update, then click **Reload** on the extension in Chrome.

The installer chooses the Apple Silicon or Intel archive, verifies its SHA-256 checksum, and starts a local Ladder service for your user account. No Docker, Node.js, Git, or administrator access is needed on the Mac. Release archives include the patched Ladder source and license notices.
