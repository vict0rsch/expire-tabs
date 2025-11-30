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
     * Saves settings to sync storage.
     * @param {Object} settings
     * @returns {Promise<void>}
     */
    const saveSettings = async (settings) => {
        return new Promise((resolve) => {
            chrome.storage.sync.set(settings, () => {
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

    /**
     * Sets protection status for a tab.
     * @param {number} tabId
     * @param {boolean} isProtected
     * @returns {Promise<void>}
     */
    const setTabProtection = async (tabId, isProtected) => {
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

    document.addEventListener("DOMContentLoaded", async () => {
        const timeoutInput = document.getElementById("timeout");
        const unitInput = document.getElementById("unit");
        const historyLimitInput = document.getElementById("historyLimit");
        const saveButton = document.getElementById("save");
        const historyButton = document.getElementById("history");
        const status = document.getElementById("status");
        const protectBtn = document.getElementById("protect-toggle");

        // Load current settings
        const settings = await getSettings();
        timeoutInput.value = settings.timeout;
        unitInput.value = settings.unit;
        historyLimitInput.value = settings.historyLimit;

        // Handle Protection Button
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });

        if (tab) {
            const updateButton = async () => {
                const isProtected = await getTabProtection(tab.id);
                if (isProtected) {
                    protectBtn.textContent = "Protected 🔒";
                    protectBtn.classList.remove("secondary");
                } else {
                    protectBtn.textContent = "Protect Tab 🛡️";
                    protectBtn.classList.add("secondary");
                }
                return isProtected;
            };

            await updateButton();

            protectBtn.addEventListener("click", async () => {
                const isProtected = await getTabProtection(tab.id);
                await setTabProtection(tab.id, !isProtected);
                await updateButton();
            });
        } else {
            protectBtn.style.display = "none";
        }

        // Save setting
        saveButton.addEventListener("click", async () => {
            const timeout = parseInt(timeoutInput.value, 10);
            const unit = unitInput.value;
            const historyLimit = parseInt(historyLimitInput.value, 10);

            if (isNaN(timeout) || timeout < 1) {
                status.textContent = "Invalid time.";
                status.style.color = "red";
                return;
            }

            if (isNaN(historyLimit) || historyLimit < -1 || historyLimit === 0) {
                status.textContent = "Invalid limit.";
                status.style.color = "red";
                return;
            }

            await saveSettings({ timeout, unit, historyLimit });
            status.textContent = "Settings saved.";

            setTimeout(() => {
                status.textContent = "";
            }, 2000);
        });

        // Open history
        historyButton.addEventListener("click", () => {
            chrome.runtime.openOptionsPage();
        });
    });

})();
