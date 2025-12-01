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
        } = await chrome.storage.local.get([
            "timeoutInput",
            "unit",
            "historyLimit",
        ]);
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
        const elements = {};
        for (const id of [
            "timeoutInput",
            "unitSelect",
            "historyLimitInput",
            "saveBtn",
            "historyBtn",
            "statusMsg",
            "protectToggleBtn",
            "helpIcon",
            "helpModal",
        ]) {
            elements[id] = document.getElementById(id);
            if (!elements[id]) {
                console.error(`Element with id ${id} not found`);
            }
        }

        if (elements.helpIcon && elements.helpModal) {
            elements.helpIcon.addEventListener("click", () => {
                elements.helpModal.classList.remove("hidden");
            });

            window.addEventListener("click", (event) => {
                if (event.target === elements.helpModal) {
                    elements.helpModal.classList.add("hidden");
                }
            });
        }

        // Load current settings
        const settings = await getSettings();
        elements.timeoutInput.value = settings.timeout;
        elements.unitSelect.value = settings.unit;
        elements.historyLimitInput.value = settings.historyLimit;

        // Handle Protection Button
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });

        if (tab) {
            const updateButton = async () => {
                const isProtected = await getTabProtection(tab.id);
                if (isProtected) {
                    elements.protectToggleBtn.textContent = "Protected 🔒";
                    elements.protectToggleBtn.classList.remove("secondary");
                } else {
                    elements.protectToggleBtn.textContent = "Protect Tab 🛡️";
                    elements.protectToggleBtn.classList.add("secondary");
                }
                return isProtected;
            };

            await updateButton();

            if (elements.protectToggleBtn) {
                elements.protectToggleBtn.addEventListener("click", async () => {
                    const isProtected = await getTabProtection(tab.id);
                    await setTabProtection(tab.id, !isProtected);
                    await updateButton();
                });
            }
        } else {
            if (elements.protectToggleBtn) {
                elements.protectToggleBtn.classList.add("hidden");
            }
        }

        // Save setting
        if (elements.saveBtn) {
            elements.saveBtn.addEventListener("click", async () => {
                elements.statusMsg.classList.remove("error");
                const timeout = parseInt(elements.timeoutInput.value, 10);
                const unit = elements.unitSelect.value;
                const historyLimit = parseInt(elements.historyLimitInput.value, 10);

                if (isNaN(timeout) || timeout < 1) {
                    elements.statusMsg.textContent = "Invalid time.";
                    elements.statusMsg.classList.add("error");
                    return;
                }

                if (
                    isNaN(historyLimit) ||
                    historyLimit < -1 ||
                    historyLimit === 0
                ) {
                    elements.statusMsg.textContent = "Invalid limit.";
                    elements.statusMsg.classList.add("error");
                    return;
                }

                await saveSettings({ timeout, unit, historyLimit });
                elements.statusMsg.textContent = "Settings saved.";

                setTimeout(() => {
                    elements.statusMsg.textContent = "";
                }, 2000);
            });
        }

        // Open history
        elements.historyBtn.addEventListener("click", () =>
            chrome.runtime.openOptionsPage()
        );
    });

})();
