import { getTabKey, getProtectedKey } from "../utils/storage.js";
import {
    checkTabs,
    updateBadge,
    cleanUpStorage,
    handleCommand,
    displayTabsStatus,
    expireAllTabs,
} from "./logic.js";

const ALARM_NAME = "check_tabs";
const ALARM_INTERVAL_IN_MINUTES = 1 / 6;

const mainRoutine = async () => {
    await cleanUpStorage();
    await displayTabsStatus();
    await checkTabs();
};

// Setup alarm on install/startup
chrome.runtime.onInstalled.addListener(async () => {
    chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: ALARM_INTERVAL_IN_MINUTES,
    });
    await mainRoutine();
});

chrome.runtime.onStartup.addListener(async () => {
    chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: ALARM_INTERVAL_IN_MINUTES,
    });
    await cleanUpStorage({ shouldDelete: true });
    await mainRoutine();
});

// When a tab is activated, update its last active time
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const key = getTabKey(activeInfo.tabId);
    await chrome.storage.local.set({ [key]: Date.now() });
    updateBadge(activeInfo.tabId);
});

// When a tab is updated (e.g. loaded), update its timestamp
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        const key = getTabKey(tabId);
        await chrome.storage.local.set({ [key]: Date.now() });
        updateBadge(tabId);
    }
});

// Clean up when tab is removed
chrome.tabs.onRemoved.addListener(async (tabId) => {
    const key = getTabKey(tabId);
    const protectedKey = getProtectedKey(tabId);
    await chrome.storage.local.remove([key, protectedKey]);
});

// Listen for commands (keyboard shortcuts)
chrome.commands.onCommand.addListener(handleCommand);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "expire-all") {
        expireAllTabs().then(sendResponse);
        return true;
    }
});

// Listen for storage changes to update badge
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
        for (const key of Object.keys(changes)) {
            if (key.startsWith("protected_")) {
                const tabId = parseInt(key.replace("protected_", ""), 10);
                if (!isNaN(tabId)) {
                    updateBadge(tabId);
                }
            }
        }
    }
});

// Check tabs
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        await mainRoutine();
    }
});
