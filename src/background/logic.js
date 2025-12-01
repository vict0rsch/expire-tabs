import {
    getSettings,
    addExpiredTab,
    getTabKey,
    getProtectedKey,
    getTabProtection,
    setTabProtection,
} from "../utils/storage.js";

/**
 * Checks all tabs and closes them if they have expired.
 * Fetches storage data in bulk to optimize performance.
 * @returns {Promise<void>}
 */
export async function checkTabs() {
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

/**
 * Closes a specific tab and adds it to history.
 * @param {chrome.tabs.Tab} tab
 * @returns {Promise<void>}
 */
export async function closeTab(tab) {
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
export async function updateBadge(tabId) {
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
export async function cleanUpStorage() {
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
 * Handles keyboard commands.
 * @param {string} command
 * @returns {Promise<void>}
 */
export async function handleCommand(command) {
    if (command === "toggle-protection") {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });
        if (tab) {
            const isProtected = await getTabProtection(tab.id);
            await setTabProtection(tab.id, !isProtected);
            // Badge update is handled by storage listener in main.js or we can call it here explicitly
            // Ideally, main.js listener handles it, but calling it here gives immediate feedback if listener is slow/detached
            // For now, reliance on storage listener is fine as it preserves architecture
        }
    } else if (command === "open-history") {
        chrome.runtime.openOptionsPage();
    }
}
