import assert from "assert";
import { launchBrowser, getExtensionId, clearStorage } from "./testUtils.mjs";

describe("Popup Settings", function () {
    this.timeout(60000);
    let browser;
    let page;
    let extensionId;

    before(async function () {
        browser = await launchBrowser();
        extensionId = await getExtensionId(browser);
    });

    after(async function () {
        if (browser) await browser.close();
    });

    beforeEach(async function () {
        page = await browser.newPage();
        const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
        await page.goto(popupUrl);
        await clearStorage(page);
    });

    afterEach(async function () {
        if (page) await page.close();
    });

    it("should save valid settings", async function () {
        // Set inputs
        await page.evaluate(() => {
            document.getElementById("timeoutInput").value = "45";
            document.getElementById("unitSelect").value = "minutes";
            document.getElementById("historyLimitInput").value = "500";
        });

        // Click save
        await page.click("#saveBtn");

        // Wait for status message
        await page.waitForFunction(() => {
            const msg = document.getElementById("statusMsg").textContent;
            return msg === "Settings saved.";
        });

        // Verify storage
        const settings = await page.evaluate(async () => {
            return await chrome.storage.local.get([
                "timeout",
                "unit",
                "historyLimit",
            ]);
        });

        assert.strictEqual(settings.timeout, 45);
        assert.strictEqual(settings.unit, "minutes");
        assert.strictEqual(settings.historyLimit, 500);
    });

    it("should reject invalid timeout (negative)", async function () {
        // Set inputs
        await page.evaluate(() => {
            document.getElementById("timeoutInput").value = "-5";
        });

        // Click save
        await page.click("#saveBtn");

        // Wait for error message
        await page.waitForFunction(() => {
            const msg = document.getElementById("statusMsg");
            return (
                msg.textContent === "Invalid time." &&
                msg.classList.contains("error")
            );
        });

        // Verify storage unchanged (should be empty or defaults if we didn't seed)
        // Since we cleared storage, it should be empty or contain defaults if getSettings was called and cached
        // But saving writes to storage. If save failed, no write.
        const settings = await page.evaluate(async () => {
            return await chrome.storage.local.get(["timeout"]);
        });
        // If nothing saved, it might be undefined or default if the background script initialized it
        // Let's check if it matches the invalid value
        assert.notStrictEqual(settings.timeout, -5);
    });

    it("should reject invalid history limit (0)", async function () {
        // Set inputs
        await page.evaluate(() => {
            document.getElementById("historyLimitInput").value = "0";
        });

        // Click save
        await page.click("#saveBtn");

        // Wait for error message
        await page.waitForFunction(() => {
            const msg = document.getElementById("statusMsg");
            return (
                msg.textContent === "Invalid limit." &&
                msg.classList.contains("error")
            );
        });

        const settings = await page.evaluate(async () => {
            return await chrome.storage.local.get(["historyLimit"]);
        });
        assert.notStrictEqual(settings.historyLimit, 0);
    });

    it("should allow infinite history limit (-1)", async function () {
        // Set inputs
        await page.evaluate(() => {
            document.getElementById("historyLimitInput").value = "-1";
        });

        // Click save
        await page.click("#saveBtn");

        // Wait for status message
        await page.waitForFunction(() => {
            const msg = document.getElementById("statusMsg").textContent;
            return msg === "Settings saved.";
        });

        const settings = await page.evaluate(async () => {
            return await chrome.storage.local.get(["historyLimit"]);
        });
        assert.strictEqual(settings.historyLimit, -1);
    });
});
