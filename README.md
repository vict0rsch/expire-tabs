<p align="center">
    <strong>Install from official stores 🔥</strong>
    <br/>
    <a href="https://chromewebstore.google.com/detail/expire-tabs/apcaggpljcadjgkdcdjlknklocmncdjk" target="_blank" rel="noopenner noreferrer"><strong>Chrome Web Store</strong></a>
    &nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;
    <a href="https://addons.mozilla.org/en-US/firefox/addon/expire-tabs/" target="_blank" rel="noopenner noreferrer"><strong>Firefox Add-ons</strong></a>
    <br/>
    <br/>
</p>

# Expire Tabs Browser Extension

A simple browser extension (Chrome & Firefox) that closes your tabs after they have been inactive for a specified amount of time. The timer resets whenever you use/focus a tab or when the tab is pinned.

This extension was developed in part to add the "close tabs after inactivity" feature to [Zen](https://zen-browser.app) which is missing, coming from [Arc](https://arc.net).

![Expire Tabs](./assets/demo.gif)

## Features

### ⚙️ Settings (Popup)

Clicking the extension icon opens the settings popup where you can configure:

-   **Timeout**: Set the duration of inactivity after which a tab should close.
    -   Supports **Minutes**, **Hours**, and **Days**.
-   **History Limit**: Set the maximum number of expired tabs to keep in history.
    -   Set to `-1` for infinite history.
    -   Tabs exceeding the limit are removed (oldest first).
-   **View Expired Tabs**: Quick access button to open the full history page.
-   **Protect Tab**: Toggle protection for the currently active tab. Protected tabs (indicated by a 🔒 badge) will **never** be expired.

### ⌨️ Shortcuts

-   **Toggle Protection**: `Alt+Shift+P` (default) - Toggle protection for the current tab. When toggled, a toast notification appears on the page showing "Protected 🔒" (green) or "Unprotected ⏳" (yellow).
-   **Open Popup**: `Alt+Shift+A` (default) - Open the extension popup.
-   **Open History**: `Alt+Shift+H` (default) - Open the history (options) page.
-   **Customize**: You can change these shortcuts in your browser's extension shortcuts settings (`chrome://extensions/shortcuts`).

### 📜 History (Options Page)

The options page provides a dashboard for your expired tabs:

-   **Search**: Filter history by Title or URL. Multiple terms are treated as "AND" conditions (e.g., "git issue" matches items containing both "git" and "issue").
-   **Copy URL**: One-click button to copy the expired tab's URL to your clipboard.
-   **Delete**: Remove individual items from your history.
-   **Clear History**: Wipe all recorded history.

### 🧠 Background Behavior

-   The extension uses a background service worker to monitor tab activity.
-   It uses `chrome.alarms` to check for expired tabs every minute to minimize resource usage.
-   **Pinned tabs** and tabs **playing audio** are automatically protected and will **not** be closed.

## Development

This project supports both Chrome and Firefox. It is mainly vibe-coded because I don't have enough time.

### Install from source

This project uses [Bun](https://bun.sh) as its runtime and package manager for faster performance.

First, install Bun (if you haven't already):
```bash
curl -fsSL https://bun.sh/install | bash
```

Then:
```
git clone https://github.com/vict0rsch/expire-tabs.git
cd expire-tabs
bun install
bun run build
```

Or download the latest release zip file from the [releases page](https://github.com/vict0rsch/expire-tabs/releases).

#### Chrome

Then go to `chrome://extensions/` and enable "Developer mode". Click on "Load unpacked" and select the `manifest.json` `dist/chrome` directory.

#### Firefox

Then go to `about:debugging#/runtime/this-firefox` and click on "Load temporary add-on". Select the `manifest.json` `dist/firefox` directory. Be careful, you will lose the data stored in the extension if you quit the browser (see [Install a personal firefox web extension permanently](https://stackoverflow.com/questions/47363481/install-a-personal-firefox-web-extension-permanently) or [How to make a temporary add-on permanent](https://support.mozilla.org/si/questions/1406851)).

### Build

To build the extension for both Chrome and Firefox:

```bash
bun run build
```

Using Rollup, this will:

1. Compile the JS bundles.
2. Build the full extension (`src/dist/chrome` and `src/dist/firefox`) using [Extension.js](https://extension.js.org)

### Watch

To start the development server and watch for changes (including HTML/CSS):

```bash
bun run watch # builds when src files or manifest change
```

### Testing

Run unit and E2E tests with:

```bash
# `bun run build` is run automatically before testing
bun test # all tests
bun run test:glob test/storage.test.mjs # specific test
bun run test:glob test/*_*.mjs # multiple specific tests
```

Want to see the tests in action? use the `headless` environment variable:

```bash
headless=0 bun test
```

Tests defaults to Chrome. To test Firefox, run:

```bash
bun run test:firefox
```

or set the `browser` environment variable to `firefox`:

```bash
browser=firefox bun test
browser=firefox bun run test:glob test/*_*.mjs # specific test
```

Writing tests for Firefox is a bit more challenging due to the differences in the browser APIs. See [test/firefox.md](test/firefox.md) for more details.
