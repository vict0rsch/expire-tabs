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

/**
 * Launch a browser with the extension loaded.
 * @param {Object} options - The options to launch the browser with.
 * @param {boolean} options.headless - Whether to launch the browser in headless mode.
 * @returns {Promise<Object>} The launched browser and the extension ID.
 */
export const launchBrowser = async ({
    headless = true,
    browser = "chrome",
} = {}) => {
    if (!["chrome", "firefox"].includes(browser)) {
        throw new Error(
            `Invalid browser: ${browser}, valid browsers are: chrome, firefox`
        );
    }
    const extensionPath = path.join(EXTENSION_PATH, "dist", browser);
    const _browser = await puppeteer.launch({
        browser,
        headless,
        pipe: true,
        enableExtensions: [extensionPath],
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--window-size=1278,798",
        ],
    });
    let extensionId;
    if (browser === "firefox") {
        extensionId = await getFirefoxExtensionId(_browser);
    } else {
        extensionId = await getChromeExtensionId(_browser);
    }
    return {
        browser: _browser,
        extensionId,
    };
};

/**
 * Get the ID of the extension.
 * @param {Browser} browser - The browser to get the extension ID of.
 * @returns {Promise<string>} The ID of the extension.
 */
export const getChromeExtensionId = async (browser) => {
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

export const getFirefoxExtensionId = async (browser) => {
    const extensionPage = await browser.newPage();
    await extensionPage.goto("about:debugging#/runtime/this-firefox", {
        waitUntil: "networkidle0",
    });
    const manifest = JSON.parse(
        fs.readFileSync(path.join(EXTENSION_PATH, "manifest.json"), "utf-8")
    );
    const manifestId = manifest["firefox:browser_specific_settings"].gecko.id;
    const extensionId = await extensionPage.evaluate((manifestId) => {
        const extensionCard = [
            ...document.querySelectorAll(
                ".debug-target-item.qa-debug-target-item"
            ),
        ].find((card) => [card.textContent.includes(manifestId)]);
        return [...extensionCard.querySelectorAll(".fieldpair")]
            .find((div) => div.textContent.includes("Internal UUID"))
            .querySelector("dd")
            .textContent.trim();
    }, manifestId);
    await extensionPage.close();
    return extensionId;
};

/**
 * Get the options URL for a given browser.
 * @param {Browser} browser - The browser to get the options URL for.
 * @returns {Promise<string>} The options URL.
 */
export const getOptionsUrl = async (browser, extensionId) => {
    const isChrome = (await browser.version()).includes("Chrome");
    return `${
        isChrome ? "chrome" : "moz"
    }-extension://${extensionId}/options_ui/page.html`;
};

/**
 * Get the popup URL for a given browser.
 * @param {Browser} browser - The browser to get the popup URL for.
 * @param {string} extensionId - The ID of the extension.
 * @returns {Promise<string>} The popup URL.
 */
export const getPopupUrl = async (browser, extensionId) => {
    const isChrome = (await browser.version()).includes("Chrome");
    return `${
        isChrome ? "chrome" : "moz"
    }-extension://${extensionId}/action/default_popup.html`;
};

/**
 * Load the test data from the test data file.
 * @returns {Object} The test data.
 */
export const loadTestData = () => {
    const content = fs.readFileSync(TEST_DATA_PATH, "utf-8");
    return JSON.parse(content);
};

/**
 * Seed the storage of a given page with a given data.
 * @param {Page} page - The page to seed the storage of.
 * @param {Object} data - The data to seed the storage with.
 * @returns {Promise<void>}
 */
export const seedStorage = async (page, data) => {
    await page.evaluate(async (data) => {
        await new Promise((resolve) => chrome.storage.local.set(data, resolve));
    }, data);
};

/**
 * Clear the storage of a given page.
 * @param {Page} page - The page to clear the storage of.
 * @returns {Promise<void>}
 */
export const clearStorage = async (page) => {
    await page.evaluate(async () => {
        await new Promise((resolve) => chrome.storage.local.clear(resolve));
    });
};

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms - The number of milliseconds to sleep.
 * @returns {Promise<void>}
 */
export const sleep = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Wait for a function to return true.
 * @param {Page} page - The page to evaluate the function on.
 * @param {Function} fn - The function to evaluate.
 * @param {Object} args - The arguments to pass to the function.
 * @param {number} timeout - The timeout in milliseconds.
 * @returns {Promise<void>}
 */
export const waitForFunction = async (page, fn, args = [], timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const result = await page.evaluate(fn, ...args);
        if (result) return;
        await sleep(100);
    }
    throw new Error("Timeout waiting for function");
};

/**
 * Reload the page safely for both Chrome and Firefox.
 * @param {Page} page - The page to reload.
 * @returns {Promise<void>}
 */
export const reloadPage = async (page) => {
    await page.evaluate(() => location.reload());
};
