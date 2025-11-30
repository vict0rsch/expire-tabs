(function () {
    'use strict';

    const getSettings = async () => {
        return new Promise((resolve) => {
            chrome.storage.sync.get(
                ["timeout", "unit", "historyLimit"],
                (result) => {
                    resolve({
                        timeout: result.timeout || 30,
                        unit: result.unit || "minutes",
                        historyLimit:
                            result.historyLimit !== undefined
                                ? result.historyLimit
                                : 100,
                    });
                }
            );
        });
    };

    const getClosedTabs = async () => {
        return new Promise((resolve) => {
            chrome.storage.local.get(["closedTabs"], (result) => {
                resolve(result.closedTabs || []);
            });
        });
    };

    const addClosedTab = async (tabInfo) => {
        const { historyLimit } = await getSettings();
        const tabs = await getClosedTabs();
        // Add ID to tabInfo if not present, useful for deletion
        if (!tabInfo.id) {
            tabInfo.id = Date.now() + Math.random().toString(36).substr(2, 9);
        }

        tabs.unshift(tabInfo);

        // Apply limit if not infinite (-1)
        if (historyLimit !== -1 && tabs.length > historyLimit) {
            tabs.length = historyLimit;
        }

        return new Promise((resolve) => {
            chrome.storage.local.set({ closedTabs: tabs }, () => {
                resolve();
            });
        });
    };

    const getTabKey = (tabId) => `tab_${tabId}`;
    const getProtectedKey = (tabId) => `protected_${tabId}`;

    const getTabProtection = async (tabId) => {
        const key = getProtectedKey(tabId);
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(!!result[key]);
            });
        });
    };

    const ALARM_NAME = "check_tabs";

    // Setup alarm on install/startup
    chrome.runtime.onInstalled.addListener(() => {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    });

    chrome.runtime.onStartup.addListener(() => {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
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
            if (tab.pinned) continue;
            if (tab.audible) continue; // Don't close if playing audio

            const key = getTabKey(tab.id);
            const protectedKey = getProtectedKey(tab.id);

            // Check if protected
            const storedData = await chrome.storage.local.get([key, protectedKey]);
            if (storedData[protectedKey]) {
                continue; // Tab is protected, skip
            }

            if (tab.active) {
                // It's active now, update timestamp
                await chrome.storage.local.set({ [key]: now });
                continue;
            }

            let lastActive = storedData[key];

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

            await chrome.tabs.remove(tab.id);
            console.log(`Closed tab: ${tab.title}`);
        } catch (err) {
            console.error(`Failed to close tab ${tab.id}:`, err);
        }
    }

    async function updateBadge(tabId) {
        try {
            const isProtected = await getTabProtection(tabId);
            const text = isProtected ? "🔒" : "";
            await chrome.action.setBadgeText({ tabId, text });
            if (isProtected) {
                await chrome.action.setBadgeBackgroundColor({
                    tabId,
                    color: "#5dc162",
                });
            }
        } catch (err) {
            // Tab might be closed
        }
    }

})();
