import { launchBrowser, getExtensionId } from "../test/testUtils.mjs";
import fs from "fs";
import path from "path";

const currentDirectory = new URL(".", import.meta.url).pathname;
const testDataPath = path.join(
    currentDirectory,
    "../test/expired-tabs-test-data.json"
);
const { expiredTabs } = JSON.parse(fs.readFileSync(testDataPath, "utf8"));

const browser = await launchBrowser({ headless: false });

const extensionId = await getExtensionId(browser);

const page = await browser.newPage();

await page.goto("chrome-extension://" + extensionId + "/popup/popup.html");

await page.evaluate((expiredTabs) => {
    chrome.storage.local.set({ expiredTabs });
}, expiredTabs);
