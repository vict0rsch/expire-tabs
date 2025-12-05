import assert from "assert";
import {
    launchBrowser,
    waitForFunction,
    sleep,
    getOptionsUrl,
} from "./testUtils.mjs";

/**
 * Test Suite: Content Script Toast Notifications
 *
 * Tests that content script displays toast notifications when protection status changes.
 */
describe("Content Script Toast", function () {
    this.timeout(60000);
    this.slow(500);
    let browser;
    let page;
    let extensionId;
    let monitorPage; // Options page with chrome API access

    before(async function () {
        ({ browser, extensionId } = await launchBrowser({
            headless: !(process.env.headless === "0"),
            browser: process.env.browser || "chrome",
        }));

        // Create a monitor page (options page) that has access to chrome APIs
        monitorPage = await browser.newPage();
        const optionsUrl = await getOptionsUrl(browser, extensionId);
        // Use networkidle0 like other tests, with longer timeout for Firefox
        await monitorPage.goto(optionsUrl, {
            waitUntil: "networkidle0",
            timeout: 60000,
        });
    });

    after(async function () {
        if (page) await page.close();
        if (monitorPage) await monitorPage.close();
        if (browser) await browser.close();
    });

    beforeEach(async function () {
        // Reuse page if it exists, otherwise create new one
        if (!page) {
            page = await browser.newPage();
        }
    });

    afterEach(async function () {
        // Close page after each test to free resources
        if (page) {
            await page.close();
            page = null;
        }
    });

    it("should load content script and create toast container", async function () {
        await page.goto("https://example.com", {
            waitUntil: "domcontentloaded",
            timeout: 10000,
        });

        // Wait for content script container to be ready
        await waitForFunction(
            page,
            () => {
                return (
                    document.querySelector(
                        '[data-extension-toast-container="true"]'
                    ) !== null
                );
            },
            [],
            3000
        );

        const containerStyles = await page.evaluate(() => {
            const container = document.querySelector(
                '[data-extension-toast-container="true"]'
            );
            return container
                ? window.getComputedStyle(container).position
                : null;
        });

        assert.strictEqual(
            containerStyles,
            "fixed",
            "Toast container should be created with fixed position"
        );
    });

    it("should show Protected toast when receiving protection-status message", async function () {
        await page.goto("https://example.com", {
            waitUntil: "domcontentloaded",
            timeout: 10000,
        });

        // Wait for content script container to be ready
        await waitForFunction(
            page,
            () => {
                return (
                    document.querySelector(
                        '[data-extension-toast-container="true"]'
                    ) !== null
                );
            },
            [],
            3000
        );

        // Get tab ID using monitor page (has chrome API access)
        const tabId = await monitorPage.evaluate(async () => {
            const tabs = await chrome.tabs.query({
                url: "*://example.com/*",
            });
            // Get the most recently created tab with example.com
            return tabs.length > 0 ? tabs[tabs.length - 1].id : null;
        });

        assert.ok(tabId, "Should be able to get tab ID");

        // Send message from monitor page (which has chrome API access) to content script
        await monitorPage.evaluate(async (tabId) => {
            const delay = (ms) =>
                new Promise((resolve) => setTimeout(resolve, ms));
            try {
                await chrome.tabs.sendMessage(tabId, {
                    type: "protection-status",
                    isProtected: true,
                });
            } catch (err) {
                // Content script might not be ready yet, retry after a delay
                await delay(100);
                await chrome.tabs.sendMessage(tabId, {
                    type: "protection-status",
                    isProtected: true,
                });
            }
        }, tabId);

        // Wait for toast to appear instead of fixed sleep
        await waitForFunction(
            page,
            () => {
                const toasts = document.querySelectorAll(
                    '[data-extension-toast="true"]'
                );
                for (const toast of toasts) {
                    const text = toast.textContent || "";
                    if (text.includes("Protected") && text.includes("🔒")) {
                        return true;
                    }
                }
                return false;
            },
            [],
            2000
        );

        const { toastExists, hasCorrectStyle } = await page.evaluate(() => {
            const toasts = document.querySelectorAll(
                '[data-extension-toast="true"]'
            );
            for (const toast of toasts) {
                const text = toast.textContent || "";
                if (text.includes("Protected") && text.includes("🔒")) {
                    const header = toast.querySelector("div");
                    if (header) {
                        const bgColor =
                            window.getComputedStyle(header).backgroundColor;
                        return {
                            toastExists: true,
                            hasCorrectStyle:
                                bgColor.includes("46") &&
                                bgColor.includes("49"),
                        };
                    }
                }
            }
            return { toastExists: false, hasCorrectStyle: false };
        });

        assert.ok(toastExists, "Toast with 'Protected 🔒' should be displayed");
        assert.ok(
            hasCorrectStyle,
            "Protected toast should have dark background color"
        );
    });

    it("should show Unprotected toast when receiving unprotected status", async function () {
        await page.goto("https://example.com", {
            waitUntil: "domcontentloaded",
            timeout: 10000,
        });

        // Wait for content script container to be ready
        await waitForFunction(
            page,
            () => {
                return (
                    document.querySelector(
                        '[data-extension-toast-container="true"]'
                    ) !== null
                );
            },
            [],
            3000
        );

        // Get tab ID using monitor page
        const tabId = await monitorPage.evaluate(async () => {
            const tabs = await chrome.tabs.query({
                url: "*://example.com/*",
            });
            return tabs.length > 0 ? tabs[tabs.length - 1].id : null;
        });

        assert.ok(tabId, "Should be able to get tab ID");

        // Send unprotected message via monitor page
        await monitorPage.evaluate(async (tabId) => {
            const delay = (ms) =>
                new Promise((resolve) => setTimeout(resolve, ms));
            try {
                await chrome.tabs.sendMessage(tabId, {
                    type: "protection-status",
                    isProtected: false,
                });
            } catch (err) {
                // Content script might not be ready yet, retry after a delay
                await delay(100);
                await chrome.tabs.sendMessage(tabId, {
                    type: "protection-status",
                    isProtected: false,
                });
            }
        }, tabId);

        // Wait for toast to appear instead of fixed sleep
        await waitForFunction(
            page,
            () => {
                const toasts = document.querySelectorAll(
                    '[data-extension-toast="true"]'
                );
                for (const toast of toasts) {
                    const text = toast.textContent || "";
                    if (text.includes("Unprotected") && text.includes("⏳")) {
                        return true;
                    }
                }
                return false;
            },
            [],
            2000
        );

        const { toastExists, hasCorrectStyle } = await page.evaluate(() => {
            const toasts = document.querySelectorAll(
                '[data-extension-toast="true"]'
            );
            for (const toast of toasts) {
                const text = toast.textContent || "";
                if (text.includes("Unprotected") && text.includes("⏳")) {
                    const header = toast.querySelector("div");
                    if (header) {
                        const bgColor =
                            window.getComputedStyle(header).backgroundColor;
                        return {
                            toastExists: true,
                            hasCorrectStyle:
                                bgColor.includes("145") &&
                                bgColor.includes("150"),
                        };
                    }
                }
            }
            return { toastExists: false, hasCorrectStyle: false };
        });

        assert.ok(
            toastExists,
            "Toast with 'Unprotected ⏳' should be displayed"
        );
        assert.ok(
            hasCorrectStyle,
            "Unprotected toast should have light background color"
        );
    });

    it("should handle message sending with retry when content script isn't ready immediately", async function () {
        // This test verifies that messages can be sent and received by content script
        await page.goto("https://example.com", {
            waitUntil: "domcontentloaded",
            timeout: 10000,
        });

        // Wait for content script container to exist
        await waitForFunction(
            page,
            () => {
                return (
                    document.querySelector(
                        '[data-extension-toast-container="true"]'
                    ) !== null
                );
            },
            [],
            3000
        );

        // Get tab ID
        const tabId = await monitorPage.evaluate(async () => {
            const tabs = await chrome.tabs.query({
                url: "*://example.com/*",
            });
            return tabs.length > 0 ? tabs[tabs.length - 1].id : null;
        });

        // Send message with retry logic (in case listener isn't ready yet)
        await monitorPage.evaluate(async (tabId) => {
            const delay = (ms) =>
                new Promise((resolve) => setTimeout(resolve, ms));
            for (let attempt = 0; attempt <= 3; attempt++) {
                try {
                    await chrome.tabs.sendMessage(tabId, {
                        type: "protection-status",
                        isProtected: true,
                    });
                    break;
                } catch (err) {
                    if (attempt === 3) break;
                    await delay(100);
                }
            }
        }, tabId);

        // Wait for toast using custom waitForFunction for Firefox compatibility
        await waitForFunction(
            page,
            () => {
                return (
                    document.querySelector('[data-extension-toast="true"]') !==
                    null
                );
            },
            [],
            2000
        );

        const toastExists = await page.evaluate(() => {
            return (
                document.querySelector('[data-extension-toast="true"]') !== null
            );
        });

        assert.ok(
            toastExists,
            "Toast should appear even when message is sent before content script is ready"
        );
    });
});
