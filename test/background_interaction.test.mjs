import assert from "assert";
import { launchBrowser, getExtensionId, clearStorage } from "./testUtils.mjs";

describe("Background Interactions", function () {
    this.timeout(60000);
    this.slow(1500);
    let browser;
    let extensionId;
    let monitorPage; // We'll use options page to monitor storage/tabs

    before(async function () {
        browser = await launchBrowser({
            headless: !(process.env.headless === "0"),
            browser: process.env.browser || "chrome",
        });
        extensionId = await getExtensionId(browser);
    });

    after(async function () {
        if (browser) await browser.close();
    });

    beforeEach(async function () {
        // Open options page to act as a privileged context for checking storage
        monitorPage = await browser.newPage();
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        await monitorPage.goto(optionsUrl);
        await clearStorage(monitorPage);
    });

    afterEach(async function () {
        // Close all pages except the first blank one (to avoid browser closing)
        const pages = await browser.pages();
        // Keep one page open so browser doesn't close if we close others
        if (pages.length > 1) {
            for (let i = 1; i < pages.length; i++) {
                await pages[i].close();
            }
        }
    });

    it("should track tab activation timestamps", async function () {
        // Create a new tab (Tab A)
        const pageA = await browser.newPage();
        // Use a real URL instead of about:blank to ensure reliable events
        await pageA.goto("https://example.com/");

        // Get Tab A ID
        const tabAId = await monitorPage.evaluate(async () => {
            const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            // Since we navigated to example.com, check that
            if (tabs.length && tabs[0].url.includes("example.com")) {
                return tabs[0].id;
            }
            // Fallback
            console.log("Fallback to query all tabs");
            const matches = await chrome.tabs.query({
                url: "*://example.com/*",
            });
            return matches.length ? matches[matches.length - 1].id : null;
        });

        if (!tabAId) throw new Error("Could not find active tab ID");

        const getStorage = async () =>
            monitorPage.evaluate(async () => {
                return await chrome.storage.local.get(null);
            });

        // Check storage for Tab A
        let storage = await getStorage();
        const key = `tab_${tabAId}`;
        let timestamp1 = storage[key];

        assert.ok(
            timestamp1,
            `Tab A (id=${tabAId}) should have a timestamp. Storage keys found: ${Object.keys(
                storage
            ).join(", ")}`
        );

        // Activate Monitor Page (Tab A becomes inactive)
        await monitorPage.bringToFront();

        // Activate Tab A again
        await pageA.bringToFront();

        // Check storage again
        storage = await getStorage();
        const timestamp2 = storage[key];

        assert.ok(
            timestamp2 > timestamp1,
            `Timestamp should update on activation (T1: ${timestamp1}, T2: ${timestamp2})`
        );
    });

    it("should remove tab data when tab is closed", async function () {
        // Create a new tab (Tab B)
        const pageB = await browser.newPage();
        await pageB.goto("https://example2.com/");

        // Get Tab B ID
        const tabBId = await monitorPage.evaluate(async () => {
            const tabs = await chrome.tabs.query({
                url: "https://example2.com/",
            });
            return tabs[0].id;
        });

        // Verify data exists
        const existsBefore = await monitorPage.evaluate(async (id) => {
            const key = `tab_${id}`;
            return new Promise((resolve) => {
                chrome.storage.local.get([key], (res) => resolve(!!res[key]));
            });
        }, tabBId);

        assert.strictEqual(
            existsBefore,
            true,
            "Storage data should exist initially"
        );

        // Close Tab B
        await pageB.close();

        // Verify data removed
        const existsAfter = await monitorPage.evaluate(async (id) => {
            const key = `tab_${id}`;
            return new Promise((resolve) => {
                chrome.storage.local.get([key], (res) => resolve(!!res[key]));
            });
        }, tabBId);
        assert.strictEqual(
            existsAfter,
            false,
            "Storage data should be removed after close"
        );
    });
});
