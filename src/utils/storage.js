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

export const saveSettings = async (settings) => {
    return new Promise((resolve) => {
        chrome.storage.sync.set(settings, () => {
            resolve();
        });
    });
};

export const getClosedTabs = async () => {
    return new Promise((resolve) => {
        chrome.storage.local.get(["closedTabs"], (result) => {
            resolve(result.closedTabs || []);
        });
    });
};

export const addClosedTab = async (tabInfo) => {
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

export const removeClosedTab = async (tabId) => {
    const tabs = await getClosedTabs();
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

export const clearClosedTabs = async () => {
    return new Promise((resolve) => {
        chrome.storage.local.set({ closedTabs: [] }, () => {
            resolve();
        });
    });
};
