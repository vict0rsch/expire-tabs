(function () {
    'use strict';

    /**
     * Storage utility functions for Expire Tabs extension.
     */

    /**
     * @typedef {Object} Settings
     * @property {number} timeout - Timeout value
     * @property {string} unit - Time unit (minutes, hours, days)
     * @property {number} historyLimit - Number of closed tabs to keep
     */

    /**
     * @typedef {Object} ClosedTab
     * @property {string} id - Unique ID
     * @property {string} title - Tab title
     * @property {string} url - Tab URL
     * @property {number} closedAt - Timestamp when closed
     */

    /**
     * Retrieves settings from sync storage.
     * @returns {Promise<Settings>}
     */
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

    /**
     * Retrieves closed tabs history from local storage.
     * @returns {Promise<ClosedTab[]>}
     */
    const getClosedTabs = async () => {
        return new Promise((resolve) => {
            chrome.storage.local.get(["closedTabs"], (result) => {
                resolve(result.closedTabs || []);
            });
        });
    };

    /**
     * Adds a tab to the closed tabs history.
     * @param {Object} tabInfo
     * @returns {Promise<void>}
     */
    const addClosedTab = async (tabInfo) => {
        const { historyLimit } = await getSettings();
        const tabs = await getClosedTabs();
        
        // Add ID to tabInfo if not present
        if (!tabInfo.id) {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                tabInfo.id = crypto.randomUUID();
            } else {
                // Fallback for environments without randomUUID
                tabInfo.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
            }
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

    /**
     * Generates storage key for a tab's activity timestamp.
     * @param {number} tabId
     * @returns {string}
     */
    const getTabKey = (tabId) => `tab_${tabId}`;

    /**
     * Generates storage key for a tab's protection status.
     * @param {number} tabId
     * @returns {string}
     */
    const getProtectedKey = (tabId) => `protected_${tabId}`;

    /**
     * Checks if a tab is protected.
     * @param {number} tabId
     * @returns {Promise<boolean>}
     */
    const getTabProtection = async (tabId) => {
        const key = getProtectedKey(tabId);
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(!!result[key]);
            });
        });
    };

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

        // Optimize: Fetch all storage data at once
        const keysToFetch = [];
        const tabsToCheck = [];

        for (const tab of tabs) {
            if (tab.pinned) continue;
            if (tab.audible) continue; // Don't close if playing audio

            const key = getTabKey(tab.id);
            const protectedKey = getProtectedKey(tab.id);
            
            keysToFetch.push(key, protectedKey);
            tabsToCheck.push({ tab, key, protectedKey });
        }

        if (keysToFetch.length === 0) return;

        const storedData = await chrome.storage.local.get(keysToFetch);
        const updates = {};

        for (const { tab, key, protectedKey } of tabsToCheck) {
            // Check if protected
            if (storedData[protectedKey]) {
                continue; // Tab is protected, skip
            }

            if (tab.active) {
                // It's active now, update timestamp
                updates[key] = now;
                continue;
            }

            let lastActive = storedData[key];

            if (!lastActive) {
                // Start tracking from now
                lastActive = now;
                updates[key] = now;
            }

            if (now - lastActive > timeoutMs) {
                // Expired
                await closeTab(tab);
            }
        }

        if (Object.keys(updates).length > 0) {
            await chrome.storage.local.set(updates);
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

})();
