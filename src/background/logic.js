import {
    getSettings,
    addExpiredTab,
    getTabKey,
    getProtectedKey,
    getTabProtection,
    setTabProtection,
} from "../utils/storage.js";
import { msToDuration } from "../utils/config.js";
/**
 * Checks all tabs and closes them if they have expired.
 * Fetches storage data in bulk to optimize performance.
 * @returns {Promise<void>}
 */
export async function checkTabs() {
    const { expired, orphan } = await getTabsStatus();
    if (expired.length > 0) {
        console.log("To expire tabs:", expired);
    }
    if (orphan.length > 0) {
        console.log("Orphan tabs:", orphan);
    }
    for (const tab of expired) {
        await closeTab(tab);
    }
    for (const tab of orphan) {
        await chrome.storage.local.set({ [getTabKey(tab.id)]: Date.now() });
    }
}

/**
 * Displays the status of all tabs.
 * @returns {Promise<void>}
 */
export async function displayTabsStatus() {
    const storedData = await chrome.storage.local.get(null);
    const tabsStatus = await getTabsStatus();
    const { timeoutMs } = await getSettings();
    const headers = {
        orphan: "🔴 Orphan tabs",
        audible: "🎤 Audible tabs",
        pinned: "📍 Pinned tabs",
        protected: "🔒 Protected tabs",
        expired: "🟡 Tabs to expire",
        active: "🎯 Active tabs",
        mayExpire: "🔄 Tabs to expire next",
    };
    console.log("Tabs status at", new Date().toISOString());
    for (const [key, value] of Object.entries(headers)) {
        const tabs = tabsStatus[key];
        if (tabs?.length) {
            console.log(`  -- ${value}`);
            const displays = tabs.map((tab) => {
                let display = {
                    title: tab.title,
                    url: tab.url,
                    id: tab.id,
                };
                const tabKey = getTabKey(tab.id);
                const recordedAt = storedData[tabKey];
                if (recordedAt) {
                    const expireAtMs = recordedAt + timeoutMs;
                    display.expireAt = new Date(expireAtMs).toLocaleString();
                    display.timeLeft = msToDuration(expireAtMs - Date.now());
                }
                return display;
            });
            if (key === "mayExpire") {
                displays.sort(
                    (a, b) =>
                        storedData[getTabKey(a.id)] -
                        storedData[getTabKey(b.id)]
                );
            }
            console.log(displays);
        }
    }
    console.log("--------------------------------");
}

/**
 * Gets the status of all tabs, categorized by priority.
 * Priority order: pinned > audible > active > protected > expired > mayExpire > orphan.
 * @returns {Promise<Object>}
 * @property {chrome.tabs.Tab[]} pinned - pinned tabs
 * @property {chrome.tabs.Tab[]} audible - playing audio
 * @property {chrome.tabs.Tab[]} active - currently active in their window
 * @property {chrome.tabs.Tab[]} protected - user-protected tabs
 * @property {chrome.tabs.Tab[]} expired - past timeout, should be closed
 * @property {chrome.tabs.Tab[]} mayExpire - tracked but not yet expired
 * @property {chrome.tabs.Tab[]} orphan - not listed in storage, need timestamp reset
 */
export async function getTabsStatus() {
    const { timeoutMs } = await getSettings();
    const now = Date.now();
    const tabs = await chrome.tabs.query({});
    const storedData = await chrome.storage.local.get(null);
    const tabsStatus = {
        expired: [], // expired, to close
        audible: [], // playing audio, to ignore
        pinned: [], // pinned, to ignore
        protected: [], // protected, to ignore
        active: [], // currently active, to ignore
        mayExpire: [], // may become expired but not yet
        orphan: [], // can be timed out but not listed in storage, to reset timestamp
    };
    for (const tab of tabs) {
        if (tab.pinned) {
            tabsStatus.pinned.push(tab);
        } else if (tab.audible) {
            tabsStatus.audible.push(tab);
        } else if (tab.active) {
            tabsStatus.active.push(tab);
        } else if (storedData[getProtectedKey(tab.id)]) {
            tabsStatus.protected.push(tab);
        } else if (now - storedData[getTabKey(tab.id)] > timeoutMs) {
            tabsStatus.expired.push(tab);
        } else if (now - storedData[getTabKey(tab.id)] <= timeoutMs) {
            tabsStatus.mayExpire.push(tab);
        } else {
            tabsStatus.orphan.push(tab);
        }
    }
    return tabsStatus;
}

/**
 * Immediately closes all expirable tabs (not pinned, active, audible, or protected).
 * @returns {Promise<{closed: number}>} The number of tabs that were closed.
 */
export async function expireAllTabs() {
    const { expired, mayExpire, orphan } = await getTabsStatus();
    const toClose = [...expired, ...mayExpire, ...orphan];
    for (const tab of toClose) {
        await closeTab(tab);
    }
    return { closed: toClose.length };
}

/**
 * Closes a specific tab and adds it to history.
 * @param {chrome.tabs.Tab} tab
 * @param {boolean} [log=true] - Whether to log the tab closure to the console.
 * @returns {Promise<void>}
 */
export async function closeTab(tab, log = true) {
    if (log) {
        console.log("Closing tab:", tab.id, tab.title, tab.url);
    }
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
 * @param {Object} [options]
 * @param {boolean} [options.shouldDelete=false] - Whether to actually remove orphaned keys from storage.
 * @returns {Promise<void>}
 */
export async function cleanUpStorage({ shouldDelete = false } = {}) {
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
        console.log("Orphaned keys:", keysToRemove);
        console.log(
            "This may be due to workspace switching, the tab may be open but unreachable to the extension"
        );
        if (shouldDelete) {
            await chrome.storage.local.remove(keysToRemove);
        }
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
