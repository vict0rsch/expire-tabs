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
export const getSettings = async () => {
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
 * Saves settings to sync storage.
 * @param {Object} settings
 * @returns {Promise<void>}
 */
export const saveSettings = async (settings) => {
    return new Promise((resolve) => {
        chrome.storage.sync.set(settings, () => {
            resolve();
        });
    });
};

/**
 * Retrieves closed tabs history from local storage.
 * @returns {Promise<ClosedTab[]>}
 */
export const getExpiredTabs = async () => {
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
export const addClosedTab = async (tabInfo) => {
    const { historyLimit } = await getSettings();
    const tabs = await getExpiredTabs();

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
 * Removes a closed tab from history by ID.
 * @param {string} tabId
 * @returns {Promise<void>}
 */
export const removeExpiredTab = async (tabId) => {
    const tabs = await getExpiredTabs();
    const newTabs = tabs.filter((t) => {
        // Ensure strict string comparison just in case
        return String(t.id) !== String(tabId);
    });
    return new Promise((resolve) => {
        chrome.storage.local.set({ closedTabs: newTabs }, () => {
            resolve();
        });
    });
};

/**
 * Clears all closed tabs history.
 * @returns {Promise<void>}
 */
export const clearExpiredTabs = async () => {
    return new Promise((resolve) => {
        chrome.storage.local.set({ closedTabs: [] }, () => {
            resolve();
        });
    });
};

/**
 * Generates storage key for a tab's activity timestamp.
 * @param {number} tabId
 * @returns {string}
 */
export const getTabKey = (tabId) => `tab_${tabId}`;

/**
 * Generates storage key for a tab's protection status.
 * @param {number} tabId
 * @returns {string}
 */
export const getProtectedKey = (tabId) => `protected_${tabId}`;

/**
 * Checks if a tab is protected.
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
export const getTabProtection = async (tabId) => {
    const key = getProtectedKey(tabId);
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            resolve(!!result[key]);
        });
    });
};

/**
 * Sets protection status for a tab.
 * @param {number} tabId
 * @param {boolean} isProtected
 * @returns {Promise<void>}
 */
export const setTabProtection = async (tabId, isProtected) => {
    const protectedKey = getProtectedKey(tabId);
    const tabKey = getTabKey(tabId);

    return new Promise((resolve) => {
        if (isProtected) {
            chrome.storage.local.set({ [protectedKey]: true }, resolve);
        } else {
            // Unprotecting: Remove protection AND reset timestamp
            chrome.storage.local.remove(protectedKey, () => {
                chrome.storage.local.set({ [tabKey]: Date.now() }, resolve);
            });
        }
    });
};
