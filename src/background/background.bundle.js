(function () {
    'use strict';

    const defaultSettings = {
        timeout: 12,
        unit: "hours",
        historyLimit: 1000,
        batchSize: 25,
        loadMargin: 5,
    };

    /**
     * Converts a unit to milliseconds.
     * Units are: minutes, hours, days.
     * @throws {Error} If the unit is invalid.
     * @param {string} unit - The unit to convert.
     * @returns {number} The number of milliseconds in the unit.
     */
    const unitToMs = (unit) => {
        switch (unit) {
            case "minutes":
                return 60 * 1000;
            case "hours":
                return 60 * 60 * 1000;
            case "days":
                return 24 * 60 * 60 * 1000;
        }
        throw new Error(`Invalid unit: ${unit}`);
    };

    /**
     * Get a copy of the default settings object.
     * @returns {Object} The default settings.
     */
    const getDefaults = () => {
        return { ...defaultSettings };
    };

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
     * @typedef {Object} ExpiredTab
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
        const defaults = getDefaults();
        let { timeout, unit, historyLimit } = await chrome.storage.local.get([
            "timeout",
            "unit",
            "historyLimit",
        ]);
        timeout = timeout ?? defaults.timeout;
        unit = unit ?? defaults.unit;
        historyLimit = historyLimit ?? defaults.historyLimit;
        return { timeout, unit, historyLimit };
    };

    /**
     * Retrieves closed tabs history from local storage.
     * @returns {Promise<ExpiredTab[]>}
     */
    const getExpiredTabs = async () => {
        const { expiredTabs } = await chrome.storage.local.get(["expiredTabs"]);
        return expiredTabs || [];
    };

    /**
     * Adds a tab to the closed tabs history.
     * @param {Object} tabInfo
     * @returns {Promise<void>}
     */
    const addExpiredTab = async (tabInfo) => {
        const { historyLimit } = await getSettings();
        const expiredTabs = await getExpiredTabs();

        // Add ID to tabInfo if not present
        if (!tabInfo.id) {
            if (typeof crypto !== "undefined" && crypto.randomUUID) {
                tabInfo.id = crypto.randomUUID();
            } else {
                // Fallback for environments without randomUUID
                tabInfo.id =
                    Date.now().toString(36) +
                    Math.random().toString(36).substr(2, 9);
            }
        }

        expiredTabs.unshift(tabInfo);

        // Apply limit if not infinite (-1)
        if (historyLimit !== -1 && expiredTabs.length > historyLimit) {
            expiredTabs.length = historyLimit;
        }

        await chrome.storage.local.set({ expiredTabs });
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
        const { [key]: isProtected } = await chrome.storage.local.get([key]);
        return !!isProtected;
    };

    /**
     * Sets protection status for a tab.
     * @param {number} tabId
     * @param {boolean} isProtected
     * @returns {Promise<void>}
     */
    const setTabProtection = async (tabId, isProtected) => {
        const protectedKey = getProtectedKey(tabId);
        const tabKey = getTabKey(tabId);

        if (isProtected) {
            await chrome.storage.local.set({ [protectedKey]: true });
        } else {
            // Unprotecting: Remove protection AND reset timestamp
            await chrome.storage.local.remove(protectedKey);
            await chrome.storage.local.set({ [tabKey]: Date.now() });
        }
    };

    /**
     * Checks all tabs and closes them if they have expired.
     * Fetches storage data in bulk to optimize performance.
     * @returns {Promise<void>}
     */
    async function checkTabs() {
        const { timeout, unit } = await getSettings();

        const timeoutMs = unitToMs(unit) * timeout;
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

    /**
     * Closes a specific tab and adds it to history.
     * @param {chrome.tabs.Tab} tab
     * @returns {Promise<void>}
     */
    async function closeTab(tab) {
        try {
            // Add to history first
            await addExpiredTab({
                title: tab.title,
                url: tab.url,
                closedAt: Date.now(),
            });

            await chrome.tabs.remove(tab.id);
        } catch (err) {
            console.error(`Failed to close tab ${tab.id}:`, err);
        }
    }

    /**
     * Updates the badge for a specific tab (shows lock icon if protected).
     * @param {number} tabId
     * @returns {Promise<void>}
     */
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

    /**
     * Cleans up storage by removing data for tabs that no longer exist.
     * @returns {Promise<void>}
     */
    async function cleanUpStorage() {
        const allData = await chrome.storage.local.get(null);
        const allKeys = Object.keys(allData);
        const tabs = await chrome.tabs.query({});
        const openTabIds = new Set(tabs.map((t) => t.id));

        const keysToRemove = [];

        for (const key of allKeys) {
            let tabId;
            if (key.startsWith("tab_")) {
                tabId = parseInt(key.replace("tab_", ""), 10);
            } else if (key.startsWith("protected_")) {
                tabId = parseInt(key.replace("protected_", ""), 10);
            }

            if (tabId && !openTabIds.has(tabId)) {
                keysToRemove.push(key);
            }
        }

        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }
    }

    /**
     * Checks if a URL supports content script injection.
     * Content scripts cannot be injected into chrome://, about:, or extension pages.
     * @param {string} url - The URL to check
     * @returns {boolean} True if content scripts can be injected
     */
    function canInjectContentScript(url) {
        if (!url) return false;
        const urlLower = url.toLowerCase();
        return (
            !urlLower.startsWith("chrome://") &&
            !urlLower.startsWith("chrome-extension://") &&
            !urlLower.startsWith("moz-extension://") &&
            !urlLower.startsWith("about:") &&
            !urlLower.startsWith("edge://") &&
            !urlLower.startsWith("opera://")
        );
    }

    /**
     * Sends a message to a content script with retry logic.
     * Retries if the content script isn't ready yet (common with document_idle timing).
     * @param {number} tabId - The tab ID to send the message to
     * @param {Object} message - The message to send
     * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
     * @param {number} retryDelay - Delay between retries in ms (default: 200)
     * @returns {Promise<void>}
     */
    async function sendMessageWithRetry(
        tabId,
        message,
        maxRetries = 3,
        retryDelay = 200
    ) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await chrome.tabs.sendMessage(tabId, message);
                return; // Success
            } catch (err) {
                const isLastAttempt = attempt === maxRetries;
                const isConnectionError =
                    err.message?.includes("Could not establish connection") ||
                    err.message?.includes("Receiving end does not exist");

                if (isLastAttempt || !isConnectionError) {
                    // Only log if it's the last attempt or a non-connection error
                    // Connection errors on early attempts are expected if content script isn't ready
                    if (isLastAttempt) {
                        console.error(
                            "Failed to send message to content script after retries:",
                            err
                        );
                    }
                    return; // Give up
                }

                // Wait before retrying
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
        }
    }

    /**
     * Handles keyboard commands.
     * @param {string} command
     * @returns {Promise<void>}
     */
    async function handleCommand(command) {
        if (command === "toggle-protection") {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            if (tab) {
                const isProtected = await getTabProtection(tab.id);
                const newProtectedStatus = !isProtected;
                await setTabProtection(tab.id, newProtectedStatus);
                // Badge update is handled by storage listener in main.js or we can call it here explicitly
                // Ideally, main.js listener handles it, but calling it here gives immediate feedback if listener is slow/detached
                // For now, reliance on storage listener is fine as it preserves architecture

                // Notify content script to show toast notification
                // The content script will display a Bootstrap toast showing "Protected 🔒" or "Unprotected ⏳"
                // Only attempt if the tab URL supports content scripts
                if (canInjectContentScript(tab.url)) {
                    await sendMessageWithRetry(tab.id, {
                        type: "protection-status",
                        isProtected: newProtectedStatus,
                    });
                }
                // Silently skip for pages that don't support content scripts (chrome://, about:, etc.)
            }
        } else if (command === "open-history") {
            chrome.runtime.openOptionsPage();
        }
    }

    const ALARM_NAME = "check_tabs";

    // Setup alarm on install/startup
    chrome.runtime.onInstalled.addListener(async () => {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
        await cleanUpStorage();
    });

    chrome.runtime.onStartup.addListener(async () => {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
        await cleanUpStorage();
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
