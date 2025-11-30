import puppeteer from "puppeteer";
import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.join(__dirname, "../src");

describe("Expire Tabs Extension E2E", function () {
    this.timeout(60000);
    let browser;
    let page;
    let extensionId;

    before(async function () {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`,
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ],
        });

        // Strategy: Go to chrome://extensions to find the ID
        const extensionPage = await browser.newPage();
        await extensionPage.goto("chrome://extensions");
        await extensionPage.waitForSelector("extensions-manager");

        extensionId = await extensionPage.evaluate(async () => {
            const findId = () => {
                const manager = document.querySelector("extensions-manager");
                if (!manager || !manager.shadowRoot) return null;

                const getItems = (root) => {
                    let items = [];
                    const children = root.querySelectorAll("*");
                    for (const child of children) {
                        if (child.tagName === "EXTENSIONS-ITEM") {
                            items.push(child);
                        }
                        if (child.shadowRoot) {
                            items = items.concat(getItems(child.shadowRoot));
                        }
                    }
                    return items;
                };

                const items = getItems(manager.shadowRoot);
                for (const item of items) {
                    const nameEl =
                        item.shadowRoot &&
                        item.shadowRoot.querySelector("#name");
                    if (nameEl && nameEl.textContent.trim() === "Expire Tabs") {
                        return item.id;
                    }
                }
                return null;
            };

            return new Promise((resolve) => {
                const check = () => {
                    const id = findId();
                    if (id) {
                        resolve(id);
                    } else {
                        setTimeout(check, 100);
                    }
                };
                check();
            });
        });

        await extensionPage.close();
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
        const historyBtn = await page.$("#history");
        assert.ok(historyBtn, "History button should exist");

        // Check for history limit input
        const historyLimitInput = await page.$("#historyLimit");
        assert.ok(historyLimitInput, "History limit input should exist");
    });

    it("should load options page and search", async function () {
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        page = await browser.newPage();
        await page.goto(optionsUrl);

        // Check for search input
        const searchInput = await page.$("#search");
        assert.ok(searchInput, "Search input should exist");

        // Check for clear button
        const clearBtn = await page.$("#clear");
        assert.ok(clearBtn, "Clear button should exist");
    });

    it("should delete an item from history", async function () {
        const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
        page = await browser.newPage();

        // Listen to page logs
        page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

        // Navigate to options page first to set context
        await page.goto(optionsUrl);

        // Seed data using chrome.storage directly in the extension context
        await page.evaluate(async () => {
            const existing = await new Promise((resolve) =>
                chrome.storage.local.get(["closedTabs"], (r) =>
                    resolve(r.closedTabs || [])
                )
            );
            // Add specific item to ensure we can identify/delete it
            existing.unshift({
                id: "delete-test-id",
                title: "Delete Me",
                url: "http://delete.me",
                closedAt: Date.now(),
            });
            await new Promise((resolve) =>
                chrome.storage.local.set({ closedTabs: existing }, resolve)
            );
        });

        await page.reload(); // Ensure fresh render with seeded data

        // Find the item
        await page.waitForSelector("#history-list li");
        const itemsBefore = await page.$$("#history-list li");
        console.log(`Items before delete: ${itemsBefore.length}`);
        assert.ok(itemsBefore.length > 0, "Should have items");

        // Setup dialog handler BEFORE click
        page.on("dialog", async (dialog) => {
            console.log("Dialog appeared:", dialog.message());
            await dialog.accept();
        });

        // Verify first item is ours
        const firstItemTitle = await page.$eval(
            "#history-list li:first-child .title",
            (el) => el.textContent
        );
        console.log(`First item title: ${firstItemTitle}`);
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
        console.log(`First item data-id: ${firstItemId}`);

        // Click delete button on first item
        console.log("Clicking delete button...");
        await page.click("#history-list li:first-child .delete-btn");

        // Wait for list to update
        await page.waitForFunction(
            () => {
                const lis = document.querySelectorAll("#history-list li");
                // If "No matching..." message is shown, it has no .delete-btn
                if (lis.length === 1 && !lis[0].querySelector(".delete-btn"))
                    return true;
                // Or if we have actual items, check if they are different (not robust if we only had 1)
                return false;
            },
            { timeout: 5000 }
        );

        const itemsAfter = await page.$$("#history-list li");
        // Verify the "No matching" message
        const text = await page.evaluate((el) => el.textContent, itemsAfter[0]);
        assert.ok(text.includes("No matching"), "Should show empty message");
    });

    it("should protect and unprotect a tab", async function () {
        const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
        page = await browser.newPage();
        await page.goto(popupUrl);

        // Wait for protect button
        await page.waitForSelector("#protect-toggle");

        // Initial state: "Protect Tab" (unprotected)
        let btnText = await page.$eval("#protect-toggle", (el) =>
            el.textContent.trim()
        );
        assert.ok(
            btnText.includes("Protect Tab"),
            "Initial state should be 'Protect Tab'"
        );

        // Click to protect
        await page.click("#protect-toggle");

        // Wait for text change
        await page.waitForFunction(() => {
            const btn = document.querySelector("#protect-toggle");
            return btn.textContent.includes("Protected");
        });

        btnText = await page.$eval("#protect-toggle", (el) => el.textContent);
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
        await page.click("#protect-toggle");

        // Wait for text change
        await page.waitForFunction(() => {
            const btn = document.querySelector("#protect-toggle");
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
