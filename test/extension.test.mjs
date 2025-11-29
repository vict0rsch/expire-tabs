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
        const popupUrl = `chrome-extension://${extensionId}/popup/index.html`;
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
        const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
        page = await browser.newPage();
        await page.goto(optionsUrl);

        // Check for search input
        const searchInput = await page.$("#search");
        assert.ok(searchInput, "Search input should exist");

        // Check for clear button
        const clearBtn = await page.$("#clear");
        assert.ok(clearBtn, "Clear button should exist");
    });
});
