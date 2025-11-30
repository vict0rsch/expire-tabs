# expire-tabs

A simple browser extension (Chrome & Firefox) that closes your tabs after they have been inactive for a specified amount of time. The timer resets whenever you focus a tab.

## Features

### ⚙️ Settings (Popup)

Clicking the extension icon opens the settings popup where you can configure:

-   **Timeout**: Set the duration of inactivity after which a tab should close.
    -   Supports **Minutes**, **Hours**, and **Days**.
-   **History Limit**: Set the maximum number of closed tabs to keep in history.
    -   Set to `-1` for infinite history.
    -   Tabs exceeding the limit are removed (oldest first).
-   **View Closed Tabs**: Quick access button to open the full history page.
-   **Protect Tab**: Toggle protection for the currently active tab. Protected tabs (indicated by a 🔒 badge) will **never** be auto-closed.

### 📜 History (Options Page)

The options page provides a dashboard for your closed tabs:

-   **Search**: Filter history by Title or URL. Multiple terms are treated as "AND" conditions (e.g., "git issue" matches items containing both "git" and "issue").
-   **Copy URL**: One-click button to copy the closed tab's URL to your clipboard.
-   **Delete**: Remove individual items from your history.
-   **Clear History**: Wipe all recorded history.

### 🧠 Background Behavior

-   The extension uses a background service worker to monitor tab activity.
-   It uses `chrome.alarms` to check for expired tabs every minute to minimize resource usage.
-   **Pinned tabs** and tabs **playing audio** are automatically protected and will **not** be closed.

## Development

This project supports both Chrome and Firefox. It is mainly vibe-coded because I don't have enough time.

### Development (Watch Mode)

To start the development server and watch for changes (including HTML/CSS):

```bash
npm run watch
```

This runs Rollup in watch mode, which:

1. Recompiles the JS bundles.
2. Rebuilds the full extension (`dist/chrome` and `dist/firefox`) whenever JS, HTML, CSS, or Manifest files change.

### Build

To build the extension for both Chrome and Firefox:

```bash
npm run build
```

This will generate:

-   `dist/chrome`
-   `dist/firefox`

### Testing

Run unit and E2E tests with:

```bash
npm test
```
