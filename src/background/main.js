import { getSettings, addClosedTab } from "../utils/storage.js";

const ALARM_NAME = "check_tabs";

// Setup alarm on install/startup
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});

// Helper to get tab key
const getTabKey = (tabId) => `tab_${tabId}`;

// When a tab is activated, update its last active time
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const key = getTabKey(activeInfo.tabId);
    await chrome.storage.local.set({ [key]: Date.now() });
});

// When a tab is updated (e.g. loaded), update its timestamp
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        const key = getTabKey(tabId);
        await chrome.storage.local.set({ [key]: Date.now() });
    }
});

// Clean up when tab is removed
chrome.tabs.onRemoved.addListener(async (tabId) => {
    const key = getTabKey(tabId);
    await chrome.storage.local.remove(key);
});

// Check tabs
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        await checkTabs();
    }
});

async function checkTabs() {
    const { timeout, unit } = await getSettings();

    let multiplier = 60 * 1000; // default minutes
    if (unit === "hours") {
        multiplier = 60 * 60 * 1000;
    } else if (unit === "days") {
        multiplier = 24 * 60 * 60 * 1000;
    }

    const timeoutMs = timeout * multiplier;
    const now = Date.now();

    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
        // Skip pinned tabs or audio playing tabs if desired?
        // Requirement says "closes your tabs after some time".
        // Usually people don't want pinned tabs closed. I'll add a check for pinned.
        if (tab.pinned) continue;
        if (tab.audible) continue; // Don't close if playing audio

        const key = getTabKey(tab.id);

        if (tab.active) {
            // It's active now, update timestamp
            await chrome.storage.local.set({ [key]: now });
            continue;
        }

        // Check stored timestamp
        const result = await chrome.storage.local.get([key]);
        let lastActive = result[key];

        if (!lastActive) {
            // Start tracking from now
            lastActive = now;
            await chrome.storage.local.set({ [key]: now });
        }

        if (now - lastActive > timeoutMs) {
            // Expired
            await closeTab(tab);
        }
    }
}

async function closeTab(tab) {
    try {
        // Add to history first
        await addClosedTab({
            title: tab.title,
            url: tab.url,
            closedAt: Date.now(),
        });

        // Remove from storage (handled by onRemoved, but good to be explicit or let onRemoved handle it)
        // We rely on onRemoved to clean up storage.

        await chrome.tabs.remove(tab.id);
        console.log(`Closed tab: ${tab.title}`);
    } catch (err) {
        console.error(`Failed to close tab ${tab.id}:`, err);
    }
}
