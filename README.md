# expire-tabs

A simple browser (Chrome & Firefox) that closes your tabs after some time. The time taken into account is the time since the tab was last opened / focused.

## Features

### Popup

A popup that allows you to set the time after which the tabs will be closed.

### Options

A page that displays the history of the tabs that have been closed.

### Background

A background script that closes the tabs after the time has elapsed.

## Development

This project supports both Chrome and Firefox.

### Development (Watch Mode)

To start the development server (defaults to Chrome) and watch for changes:

```bash
npm run watch
# OR
npm run dev
```

This runs:

1. Rollup in watch mode for bundling scripts.
2. Extension.js dev server for loading the extension in Chrome.

### Build

To build the extension for both Chrome and Firefox:

```bash
npm run build
```

This will generate:

-   `dist/chrome`
-   `dist/firefox`
