const { launchBrowser } = await import("../test/testUtils.mjs");
const fs = await import("fs");
const path = await import("path");

const currentDirectory = process.cwd();
const testDataPath = path.join(
    currentDirectory,
    "../test/expired-tabs-test-data.json"
);
const { expiredTabs } = JSON.parse(fs.readFileSync(testDataPath, "utf8"));

const { browser, extensionId } = await launchBrowser({
    headless: false,
    browser: process.env.browser || "chrome",
});

// const page = await browser.newPage();

// await page.goto(await getPopupUrl(browser, extensionId));

// await page.evaluate((expiredTabs) => {
//     chrome.storage.local.set({ expiredTabs });
// }, expiredTabs);
