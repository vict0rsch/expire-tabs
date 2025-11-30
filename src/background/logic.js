import {
    getSettings,
    addClosedTab,
    getTabKey,
    getProtectedKey,
    getTabProtection,
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
