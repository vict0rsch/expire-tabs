# Running Tests on Firefox

Running Puppeteer tests for a Manifest V3 extension on Firefox presents several unique challenges compared to Chrome. This document summarizes the issues encountered and the solutions implemented to make the test suite robust.

## 1. CSP (Content Security Policy) Issues

**The Problem:**
Firefox enforces a strict Content Security Policy for Manifest V3 extensions by default. It often blocks `eval()` and `new Function()`, which Puppeteer relies on heavily for methods like `page.waitForFunction()` and complex `page.$eval()` calls. Tests would fail with:
`EvalError: call to Function() blocked by CSP`

**The Solution:**

-   **Avoid `waitForFunction`**: We replaced `page.waitForFunction` with a custom helper `waitForFunction` in `test/testUtils.mjs`. This helper uses a manual `while` loop with `page.evaluate()`.
    -   _Why it works_: `page.evaluate()` executes code via the DevTools protocol, which seems to bypass the strict page-context CSP that blocks the `Function` constructor used by `waitForFunction`.
-   **Simplify Selectors**: We replaced some `page.$eval` calls with `page.evaluate` where possible, especially inside loops or complex logic.

## 2. Navigation Timeouts and Reloads

**The Problem:**
In the Firefox/Puppeteer (WebDriver BiDi) environment, standard navigation methods like `page.reload()` and `page.goto()` often hang indefinitely when interacting with extension pages (`moz-extension://...`), causing "Navigation timeout of 30000 ms exceeded" errors.

**The Solution:**

-   **Custom Reload Helper**: We created a `reloadPage` helper in `test/testUtils.mjs` that uses `page.evaluate(() => location.reload())`. This successfully reloads the page without triggering the Puppeteer navigation timeout issue.
-   **Navigation Options**: For `page.goto()`, we use specific strategies depending on the target:
    -   **Extension Pages (`moz-extension://`)**: Use `{ waitUntil: "networkidle0" }`. Extension pages are local and load fast, but often run async initialization logic (like storage reads) immediately. Waiting for network idle ensures this logic has settled.
    -   **External Sites (`example.com`)**: Use `{ waitUntil: "domcontentloaded" }`. External sites often have lingering network requests (analytics, etc.) that cause `networkidle0` to timeout. We only need the DOM to be ready to interact with them.

## 3. Chrome DevTools Protocol (CDP) vs. WebDriver BiDi

**The Problem:**
Firefox support in Puppeteer is transitioning to WebDriver BiDi. Features that rely strictly on the Chrome DevTools Protocol (CDP) are not fully supported or behave differently.

-   Specifically, `page.target().createCDPSession()` and `Browser.setDownloadBehavior` failed on Firefox.

**The Solution:**

-   **Mocking/Intercepting**: For tests relying on file downloads (which are flaky or unsupported in Puppeteer+Firefox headless), we intercept the download trigger logic within the page.
    -   Example: In "should trigger download history", we mock `URL.createObjectURL` to verify that the extension generates the correct JSON blob, instead of trying to verify the file existence on the OS filesystem.
-   **Skip Incompatible Tests**: We skip tests that rely on specific CDP features _only if_ logic verification is impossible without them. (We managed to avoid skipping the download test!).

## 4. Test Helpers Refactoring

To ensure consistency and maintainability, we refactored the codebase to use shared helpers in `test/testUtils.mjs`:

-   `waitForFunction(page, fn, args, timeout)`: A CSP-safe replacement for Puppeteer's `waitForFunction`.
-   `reloadPage(page)`: A safe reload method for extension pages.

## Running Tests

To run the tests on Firefox:

```bash
browser=firefox npm test
```

This command sets the `browser` environment variable, which our test setup detects to launch Firefox and apply the necessary skips and configurations.
