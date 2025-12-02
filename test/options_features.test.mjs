import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
    launchBrowser,
    getExtensionId,
    seedStorage,
    clearStorage,
    loadTestData,
} from "./testUtils.mjs";
import { getDefaults, unitToMs } from "../src/utils/config.js";

const defaults = getDefaults();
const defaultUnitMultiplier = unitToMs(defaults.unit);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Options Page New Features", function () {
    this.timeout(60000);
    this.slow(500);
    let browser;
    let page;
    let extensionId;
    let testData;

    before(async function () {
        browser = await launchBrowser();
        extensionId = await getExtensionId(browser);
        testData = loadTestData();
    });

    after(async function () {
        if (browser) await browser.close();
    });

    beforeEach(async function () {
        // Clear storage before each test
        page = await browser.newPage();
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        await page.goto(optionsUrl);
        await clearStorage(page);
    });

    afterEach(async function () {
        if (page) await page.close();
    });

    it("should delete entries older than specified time", async function () {
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        await page.goto(optionsUrl);

        const now = Date.now();
        const timeoutMs = (defaults.timeout + 1) * defaultUnitMultiplier;

        // Use data from JSON but override closedAt relative to now
        // Assuming testData has at least 2 items
        const tabs = [
            {
                ...testData.expiredTabs[0],
                id: "old-tab",
                title: "Old Tab",
                closedAt: now - timeoutMs,
            },
            {
                ...testData.expiredTabs[1],
                id: "new-tab",
                title: "New Tab",
                closedAt: now - timeoutMs / 2,
            },
        ];

        await seedStorage(page, { expiredTabs: tabs });

        await page.reload();

        // Wait for list to render
        await page.waitForSelector("#history-list li");
        let items = await page.$$("#history-list li");
        assert.strictEqual(items.length, 2, "Should have 2 items initially");

        // Interact with "Delete older than" inputs
        await page.type("#deleteOlderThan", defaults.timeout.toString());
        await page.select("#unit", defaults.unit);

        // Trigger change event to update button state
        await page.evaluate(() => {
            const event = new Event("change");
            document.getElementById("deleteOlderThan").dispatchEvent(event);
            document.getElementById("unit").dispatchEvent(event);
        });

        // Wait for button to be enabled and show count
        await page.waitForFunction(() => {
            const btn = document.getElementById("deleteOlderThanButton");
            const count =
                document.getElementById("oldEntriesCount").textContent;
            return !btn.disabled && count === "1";
        });

        // Setup dialog handler
        page.on("dialog", async (dialog) => {
            await dialog.accept();
        });

        // Click delete
        await page.click("#deleteOlderThanButton");

        // Wait for list to update
        await page.waitForFunction(() => {
            return document.querySelectorAll("#history-list li").length === 1;
        });

        items = await page.$$("#history-list li");
        assert.strictEqual(items.length, 1, "Should have 1 item after delete");

        const title = await page.$eval(
            "#history-list li .title",
            (el) => el.textContent
        );
        assert.strictEqual(
            title,
            "New Tab",
            "Remaining tab should be the new one"
        );
    });

    it("should delete search results", async function () {
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        await page.goto(optionsUrl);

        // Seed data from JSON but add our specific searchable items to be sure
        const tabs = [
            {
                id: "apple",
                title: "Apple",
                url: "http://apple.com",
                closedAt: Date.now(),
            },
            {
                id: "banana",
                title: "Banana",
                url: "http://banana.com",
                closedAt: Date.now(),
            },
            {
                id: "apricot",
                title: "Apricot",
                url: "http://apricot.com",
                closedAt: Date.now(),
            },
        ];

        // We can append the rest of testData if we want, but it might pollute search results if they match "Ap"
        // Let's just stick to controlled data for this specific search logic test

        await seedStorage(page, { expiredTabs: tabs });

        await page.reload();
        await page.waitForSelector("#history-list li");

        // Search for "Ap" (Apple, Apricot)
        await page.type("#search", "Ap");

        // Wait for filter
        await page.waitForFunction(() => {
            return document.querySelectorAll("#history-list li").length === 2;
        });

        // Check count in button
        const countText = await page.$eval(
            "#results-count",
            (el) => el.textContent
        );
        assert.strictEqual(countText, "2", "Button should show 2 results");

        // Setup dialog handler
        page.on("dialog", async (dialog) => {
            await dialog.accept();
        });

        // Click Delete Search Results
        await page.click("#deleteSearchResults");

        // Wait for reload/update
        await page.waitForFunction(() => {
            // Should be 1 item left (Banana) and search cleared
            const searchVal = document.getElementById("search").value;
            const lis = document.querySelectorAll("#history-list li");
            return searchVal === "" && lis.length === 1;
        });

        const title = await page.$eval(
            "#history-list li .title",
            (el) => el.textContent
        );
        assert.strictEqual(title, "Banana", "Remaining tab should be Banana");
    });

    it("should trigger download history", async function () {
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        await page.goto(optionsUrl);

        // Setup download behavior
        const downloadPath = path.resolve(__dirname, "downloads");
        // Ensure directory exists
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath);
        }

        const client = await page.target().createCDPSession();
        await client.send("Browser.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: downloadPath,
        });

        // Seed data from JSON
        await seedStorage(page, { expiredTabs: testData.expiredTabs });

        await page.reload();
        await page.waitForSelector("#downloadHistory");

        // Click download
        await page.click("#downloadHistory");

        // Poll for file existence
        const waitForFile = async (dir, timeout = 5000) => {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const files = fs.readdirSync(dir);
                const jsonFiles = files.filter(
                    (f) =>
                        f.startsWith("expired-tabs-data") && f.endsWith(".json")
                );
                if (jsonFiles.length > 0) return jsonFiles[0];
                await new Promise((r) => setTimeout(r, 200));
            }
            return null;
        };

        const downloadedFile = await waitForFile(downloadPath);
        assert.ok(downloadedFile, "File should be downloaded");

        // Clean up
        if (downloadedFile) {
            fs.unlinkSync(path.join(downloadPath, downloadedFile));
        }
        fs.rmdirSync(downloadPath);
    });

    it("should load more items on scroll (infinite scrolling)", async function () {
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        await page.goto(optionsUrl);

        // Set viewport to a fixed small size to ensure scrolling is possible
        await page.setViewport({ width: 800, height: 600 });

        // Seed 25 items (Batch size is 10)
        // We'll generate them to ensure we have enough
        const tabs = Array.from({ length: 25 }, (_, i) => ({
            id: `tab-${i}`,
            title: `Tab ${i}`,
            url: `http://example.com/${i}`,
            closedAt: Date.now() - i * 1000,
        }));

        await seedStorage(page, { expiredTabs: tabs });

        await page.reload();
        await page.waitForSelector("#history-list li");

        // Initially should have 10 items
        let count = await page.$$eval("#history-list li", (lis) => lis.length);
        assert.strictEqual(count, 20, "Should initially render 20 items");

        // Scroll to bottom
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        // Wait for more items (should be 20)
        await page.waitForFunction(() => {
            return document.querySelectorAll("#history-list li").length > 20;
        });

        count = await page.$$eval("#history-list li", (lis) => lis.length);
        assert.ok(count >= 20, "Should render next batch (20 items)");

        // Scroll again
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        // Wait for all items (25)
        await page.waitForFunction(() => {
            return document.querySelectorAll("#history-list li").length === 25;
        });

        count = await page.$$eval("#history-list li", (lis) => lis.length);
        assert.strictEqual(count, 25, "Should finally render all 25 items");
    });

    it("should filter tabs on search", async function () {
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        await page.goto(optionsUrl);
        const query = "Ap an";

        // Seed data from JSON
        await seedStorage(page, { expiredTabs: testData.expiredTabs });
        const nTabsToRender = Math.min(
            20,
            testData.expiredTabs.filter((tab) =>
                query
                    .toLowerCase()
                    .split(" ")
                    .every(
                        (term) =>
                            tab.title.toLowerCase().includes(term) ||
                            tab.url.toLowerCase().includes(term)
                    )
            ).length
        );

        await page.reload();
        await page.waitForSelector("#history-list li");

        // Search for "Ap" (Apple, Apricot)
        await page.type("#search", query);

        assert.strictEqual(
            await page.$$eval("#history-list li", (lis) => lis.length),
            nTabsToRender,
            "Should have the correct number of items"
        );

        await page.type("#search", Math.random().toString());

        assert.strictEqual(
            await page.$$eval(
                "#history-list li:not(.no-match)",
                (lis) => lis.length
            ),
            0,
            "Should have 0 items for random query"
        );
    });
});
