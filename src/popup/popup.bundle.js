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
    const saveSettings = async (settings) =>
        await chrome.storage.local.set(settings);

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

    document.addEventListener("DOMContentLoaded", async () => {
        const timeoutInput = document.getElementById("timeout");
        const unitInput = document.getElementById("unit");
        const historyLimitInput = document.getElementById("historyLimit");
        const saveButton = document.getElementById("save");
        const historyButton = document.getElementById("history");
        const status = document.getElementById("status");
        const protectBtn = document.getElementById("protect-toggle");
        const helpIcon = document.getElementById("help-icon");
        const helpModal = document.getElementById("help-modal");

        helpIcon.addEventListener("click", () => {
            helpModal.classList.remove("hidden");
        });

        window.addEventListener("click", (event) => {
            if (event.target === helpModal) {
                helpModal.classList.add("hidden");
            }
        });

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
            protectBtn.classList.add("hidden");
        }

        // Save setting
        saveButton.addEventListener("click", async () => {
            status.classList.remove("error");
            const timeout = parseInt(timeoutInput.value, 10);
            const unit = unitInput.value;
            const historyLimit = parseInt(historyLimitInput.value, 10);

            if (isNaN(timeout) || timeout < 1) {
                status.textContent = "Invalid time.";
                status.classList.add("error");
                return;
            }

            if (isNaN(historyLimit) || historyLimit < -1 || historyLimit === 0) {
                status.textContent = "Invalid limit.";
                status.classList.add("error");
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
