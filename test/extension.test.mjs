import assert from "assert";
import {
    launchBrowser,
    getExtensionId,
    seedStorage,
    loadTestData,
} from "./testUtils.mjs";

describe("Expire Tabs Extension E2E", function () {
    this.timeout(60000);
    this.slow(500);
    let browser;
    let page;
    let extensionId;
    let testData;

    before(async function () {
        browser = await launchBrowser({
            headless: !(process.env.headless === "0"),
        });
        extensionId = await getExtensionId(browser);
        testData = loadTestData();
    });

    after(async function () {
        if (browser) await browser.close();
    });

    it("should load the popup and have expected elements", async function () {
        const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
        page = await browser.newPage();
        await page.goto(popupUrl);

        const title = await page.title();
        assert.strictEqual(title, "Expire Tabs Settings");

        // Check for history button
        const historyBtn = await page.$("#historyBtn");
        assert.ok(historyBtn, "History button should exist");

        // Check for history limit input
        const historyLimitInput = await page.$("#historyLimitInput");
        assert.ok(historyLimitInput, "History limit input should exist");
    });

    it("should load options page and search", async function () {
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        page = await browser.newPage();
        await page.goto(optionsUrl);

        // Check for search input
        const searchInput = await page.$("#search");
        assert.ok(searchInput, "Search input should exist");

        // Check for download button
        const downloadBtn = await page.$("#downloadHistory");
        assert.ok(downloadBtn, "Download button should exist");
    });

    it("should delete an item from history", async function () {
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        page = await browser.newPage();

        // Navigate to options page first to set context
        await page.goto(optionsUrl);

        // Seed data from JSON + our specific test item
        const expiredTabs = [...testData.expiredTabs];
        const testItem = {
            id: "delete-test-id",
            title: "Delete Me",
            url: "http://delete.me",
            closedAt: Date.now(),
        };
        expiredTabs.unshift(testItem);

        await seedStorage(page, { expiredTabs });

        await page.reload(); // Ensure fresh render with seeded data

        // Find the item
        await page.waitForSelector("#history-list li");
        const itemsBefore = await page.$$("#history-list li");
        assert.ok(itemsBefore.length > 0, "Should have items");

        // Setup dialog handler BEFORE click
        let dialogMessage = "";
        page.on("dialog", async (dialog) => {
            dialogMessage = dialog.message();
            await dialog.accept();
        });

        // Verify first item is ours
        const firstItemTitle = await page.$eval(
            "#history-list li:first-child .title",
            (el) => el.textContent
        );
        assert.strictEqual(
            firstItemTitle,
            "Delete Me",
            "First item should be the one we added"
        );

        // Check dataset id
        const firstItemId = await page.$eval(
            "#history-list li:first-child",
            (el) => el.dataset.id
        );
        // Click delete button on first item
        await page.click("#history-list li:first-child .delete-btn");

        assert.strictEqual(
            dialogMessage,
            "Remove this item?",
            "Dialog message should be correct"
        );
        // Wait for list to update
        // We wait until the first item is NOT the one we deleted
        await page.waitForFunction(
            (deletedId) => {
                const firstItem = document.querySelector(
                    "#history-list li:first-child"
                );
                // If list is empty or first item is different
                return !firstItem || firstItem.dataset.id !== deletedId;
            },
            { timeout: 5000 },
            firstItemId
        );

        const itemsAfter = await page.$$("#history-list li");
        // Verify the first item is now the second one from our list (or different)
        if (itemsAfter.length > 0) {
            const text = await page.evaluate(
                (el) => el.querySelector(".title")?.textContent,
                itemsAfter[0]
            );
            assert.notStrictEqual(text, "Delete Me", "Item should be deleted");
        }
    });

    it("should protect and unprotect a tab", async function () {
        const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
        page = await browser.newPage();
        await page.goto(popupUrl);

        // Wait for protect button
        await page.waitForSelector("#protectToggleBtn");

        // Initial state: "Protect Tab" (unprotected)
        let btnText = await page.$eval("#protectToggleBtn", (el) =>
            el.textContent.trim()
        );
        assert.ok(
            btnText.includes("Protect Tab"),
            "Initial state should be 'Protect Tab'"
        );

        // Click to protect
        await page.click("#protectToggleBtn");

        btnText = await page.$eval("#protectToggleBtn", (el) => el.textContent);
        assert.ok(btnText.includes("Protected"), "State should be 'Protected'");

        // Verify in storage
        const isProtectedInStorage = await page.evaluate(async () => {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            const key = `protected_${tab.id}`;
            return new Promise((resolve) => {
                chrome.storage.local.get([key], (res) => resolve(!!res[key]));
            });
        });
        assert.strictEqual(
            isProtectedInStorage,
            true,
            "Storage should have protection key"
        );

        // Click to unprotect
        await page.click("#protectToggleBtn");

        // Wait for text change
        await page.waitForFunction(() => {
            const btn = document.querySelector("#protectToggleBtn");
            return btn.textContent.includes("Protect Tab");
        });

        // Verify storage cleared
        const isProtectedAfter = await page.evaluate(async () => {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            const key = `protected_${tab.id}`;
            return new Promise((resolve) => {
                chrome.storage.local.get([key], (res) => resolve(!!res[key]));
            });
        });
        assert.strictEqual(
            isProtectedAfter,
            false,
            "Storage should NOT have protection key"
        );
    });
});
