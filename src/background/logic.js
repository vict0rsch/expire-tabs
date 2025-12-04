import {
    getSettings,
    addExpiredTab,
    getTabKey,
    getProtectedKey,
    getTabProtection,
    setTabProtection,
} from "../utils/storage.js";
import { unitToMs } from "../utils/config.js";
/**
 * Checks all tabs and closes them if they have expired.
 * Fetches storage data in bulk to optimize performance.
 * @returns {Promise<void>}
 */
export async function checkTabs() {
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
export async function handleCommand(command) {
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
