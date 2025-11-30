import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_PATH = path.join(__dirname, "../src");
export const TEST_DATA_PATH = path.join(
    __dirname,
    "expired-tabs-test-data.json"
);

export const launchBrowser = async () => {
    return await puppeteer.launch({
        headless: "new",
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            "--no-sandbox",
            "--disable-setuid-sandbox",
        ],
    });
};

export const getExtensionId = async (browser) => {
    const extensionPage = await browser.newPage();
    await extensionPage.goto("chrome://extensions");
    await extensionPage.waitForSelector("extensions-manager");

    const extensionId = await extensionPage.evaluate(async () => {
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
                    item.shadowRoot && item.shadowRoot.querySelector("#name");
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
    return extensionId;
};

export const loadTestData = () => {
    const content = fs.readFileSync(TEST_DATA_PATH, "utf-8");
    return JSON.parse(content);
};

export const seedStorage = async (page, data) => {
    await page.evaluate(async (data) => {
        await new Promise((resolve) => chrome.storage.local.set(data, resolve));
    }, data);
};

export const clearStorage = async (page) => {
    await page.evaluate(async () => {
        await new Promise((resolve) => chrome.storage.local.clear(resolve));
    });
};
