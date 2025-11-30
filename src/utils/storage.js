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
export const getSettings = async () => {
    const {
        timeout = 30,
        unit = "minutes",
        historyLimit = 100,
    } = await chrome.storage.local.get(["timeout", "unit", "historyLimit"]);
    return { timeout, unit, historyLimit };
};

/**
 * Saves settings to sync storage.
 * @param {Object} settings
 * @returns {Promise<void>}
 */
export const saveSettings = async (settings) =>
    await chrome.storage.local.set(settings);

/**
 * Retrieves closed tabs history from local storage.
 * @returns {Promise<ExpiredTab[]>}
 */
export const getExpiredTabs = async () => {
    const { expiredTabs } = await chrome.storage.local.get(["expiredTabs"]);
    return expiredTabs || [];
};

/**
 * Adds a tab to the closed tabs history.
 * @param {Object} tabInfo
 * @returns {Promise<void>}
 */
export const addExpiredTab = async (tabInfo) => {
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
 * Removes a closed tab from history by ID.
 * @param {string} tabId
 * @returns {Promise<void>}
 */
export const removeExpiredTab = async (tabId) => {
    const expiredTabs = await getExpiredTabs();
    const newExpiredTabs = expiredTabs.filter((t) => {
        // Ensure strict string comparison just in case
        return String(t.id) !== String(tabId);
    });
    await chrome.storage.local.set({ expiredTabs: newExpiredTabs });
};

/**
 * Clears all closed tabs history.
 * @returns {Promise<void>}
 */
export const clearExpiredTabs = async () =>
    await chrome.storage.local.set({ expiredTabs: [] });

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
    const { [key]: isProtected } = await chrome.storage.local.get([key]);
    return !!isProtected;
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

    if (isProtected) {
        await chrome.storage.local.set({ [protectedKey]: true });
    } else {
        // Unprotecting: Remove protection AND reset timestamp
        await chrome.storage.local.remove(protectedKey);
        await chrome.storage.local.set({ [tabKey]: Date.now() });
    }
};
