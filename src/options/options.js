import {
    getExpiredTabs,
    clearExpiredTabs,
    removeExpiredTab,
} from "../utils/storage.js";
import { unitToMs } from "../utils/config.js";
let allTabs = [];
let currentTabsToRender = [];
let renderedCount = 0;
const BATCH_SIZE = 20;
const LOAD_MARGIN = 5;
let observer = null;

const escapeHtml = (unsafe) => {
    return (unsafe || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

const createTabHtml = (tab) => {
    const title = escapeHtml(tab.title || "Unknown Title");
    const url = escapeHtml(tab.url || "Unknown URL");
    const time = new Date(tab.closedAt).toLocaleString();
    const id = escapeHtml(String(tab.id));

    return `
            <li data-id="${id}" data-url="${url}" class="my-4">
                <span class="title" title="${title}">${title}</span>
                <a class="url" title="${url}" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>
                <span class="time">${time}</span>
                <div class="actions">
                    <button class="icon-btn copy-btn" title="Copy URL to clipboard">Copy URL</button>
                    <button class="icon-btn delete-btn" title="Remove from history">×</button>
                </div>
            </li>
        `;
};

const setupObserver = () => {
    if (observer) {
        observer.disconnect();
        observer = null;
    }

    // If we have rendered everything, stop observing
    if (renderedCount >= currentTabsToRender.length) return;

    const list = document.getElementById("history-list");
    if (!list) return;

    // We want to trigger when the (End - Margin)th element comes into view
    // e.g. rendered 25, margin 5. Trigger at 20th element (index 19).
    let targetIndex = renderedCount - LOAD_MARGIN - 1;

    // Safety check
    if (targetIndex < 0) targetIndex = 0;

    const items = list.children;
    if (items.length > targetIndex) {
        const target = items[targetIndex];

        observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    // Disconnect current observer to prevent duplicate triggers
                    // setupObserver will be called again after rendering
                    observer.disconnect();
                    renderNextBatch();
                }
            },
            {
                root: null, // viewport
                rootMargin: "0px",
                threshold: 0.1,
            }
        );

        observer.observe(target);
    }
};

const renderNextBatch = () => {
    const list = document.getElementById("history-list");
    const nextBatch = currentTabsToRender.slice(
        renderedCount,
        renderedCount + BATCH_SIZE
    );

    if (nextBatch.length === 0) return;

    const html = nextBatch.map(createTabHtml).join("");
    list.insertAdjacentHTML("beforeend", html);

    renderedCount += nextBatch.length;

    setupObserver();
};

const renderList = (tabsToRender) => {
    const list = document.getElementById("history-list");

    // Reset state
    list.innerHTML = "";
    currentTabsToRender = tabsToRender;
    renderedCount = 0;
    updateResultsCount(tabsToRender.length);

    if (tabsToRender.length === 0) {
        list.innerHTML =
            "<li style='color: #6c757d;'>No matching closed tabs history.</li>";
        document.getElementById("deleteSearchResults").disabled = true;
        return;
    }
    document.getElementById("deleteSearchResults").disabled = false;
    renderNextBatch();
};

const handleListClick = async (e) => {
    // Copy Button
    if (e.target.classList.contains("copy-btn")) {
        const btn = e.target;
        const li = btn.closest("li");
        const url = li.dataset.url;
        try {
            const decodedUrl = new DOMParser().parseFromString(url, "text/html")
                .documentElement.textContent;
            await navigator.clipboard.writeText(decodedUrl);
            const originalText = btn.textContent;
            btn.textContent = "Copied!";
            setTimeout(() => {
                btn.textContent = originalText;
            }, 1500);
        } catch (err) {
            console.error("Failed to copy: ", err);
        }
        return;
    }

    // Delete Button
    if (e.target.classList.contains("delete-btn")) {
        const btn = e.target;
        if (confirm("Remove this item?")) {
            const li = btn.closest("li");
            const id = li.dataset.id;
            try {
                await removeExpiredTab(id);
                await loadAndRender();

                // Re-apply current search filter
                const searchVal = document.getElementById("search").value;
                if (searchVal) {
                    filterTabs(searchVal);
                }
            } catch (err) {
                console.error("Error deleting:", err);
            }
        }
        return;
    }
};

const loadAndRender = async () => {
    allTabs = await getExpiredTabs();
    renderList(allTabs);
};

const updateResultsCount = (count) => {
    const resultsCount = document.getElementById("results-count");
    if (resultsCount) {
        resultsCount.textContent = count;
    }
};

const deleteSearchResults = async () => {
    for (const tab of currentTabsToRender) {
        await removeExpiredTab(tab.id);
    }
    await loadAndRender();
    document.getElementById("search").value = "";
};

const filterTabs = (query) => {
    if (!query) {
        renderList(allTabs);
        return;
    }

    const terms = query
        .toLowerCase()
        .split(" ")
        .filter((t) => t.length > 0);

    const filtered = allTabs.filter((tab) => {
        const title = (tab.title || "").toLowerCase();
        const url = (tab.url || "").toLowerCase();

        const titleMatch = terms.every((term) => title.includes(term));
        const urlMatch = terms.every((term) => url.includes(term));

        return titleMatch || urlMatch;
    });

    renderList(filtered);
};

const getOldEntries = async ({ value, unit }) => {
    if (
        !value ||
        !["minutes", "hours", "days"].includes(unit) ||
        isNaN(value) ||
        value <= 0
    ) {
        return [];
    }
    const expiredTabs = await getExpiredTabs();
    return expiredTabs.filter((entry) => {
        let delta = value;
        delta = unitToMs(unit) * value;
        const time = new Date(entry.closedAt).getTime();
        const now = new Date().getTime();
        const diff = now - time;
        return diff > delta;
    });
};

document.addEventListener("DOMContentLoaded", async () => {
    await loadAndRender();

    // Event delegation for list items
    document
        .getElementById("history-list")
        .addEventListener("click", handleListClick);

    document
        .getElementById("downloadHistory")
        .addEventListener("click", async () => {
            const data = await chrome.storage.local.get();
            const dataJson = JSON.stringify(data, null, 2);
            const blob = new Blob([dataJson], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `expired-tabs-data-${new Date().toJSON()}.json`;
            a.click();
        });

    document.getElementById("search").addEventListener("input", (e) => {
        filterTabs(e.target.value);
    });

    ["deleteOlderThan", "unit"].forEach((id) => {
        ["input", "change"].forEach((eventType) => {
            document
                .getElementById(id)
                .addEventListener(eventType, async () => {
                    const value = parseInt(
                        document.getElementById("deleteOlderThan").value,
                        10
                    );
                    const unit = document.getElementById("unit").value;
                    const oldEntries = await getOldEntries({ value, unit });
                    document.getElementById("deleteOlderThanButton").disabled =
                        oldEntries.length === 0 ? true : false;
                    document.getElementById("oldEntriesCount").textContent =
                        oldEntries.length;
                });
        });
    });

    document
        .getElementById("deleteSearchResults")
        .addEventListener("click", async () => {
            const resultsCount =
                document.getElementById("results-count").textContent;
            if (
                confirm(
                    `Are you sure you want to delete ${resultsCount} search results?`
                )
            ) {
                await deleteSearchResults();
                await loadAndRender();
                document.getElementById("search").value = "";
            }
        });
    document
        .getElementById("deleteOlderThanButton")
        .addEventListener("click", async () => {
            const value = parseInt(
                document.getElementById("deleteOlderThan").value,
                10
            );
            const unit = document.getElementById("unit").value;
            const oldEntries = await getOldEntries({ value, unit });
            if (oldEntries.length === 0) {
                alert(
                    `No entries found to delete older than ${value} ${unit}.`
                );
                return;
            }
            if (
                confirm(
                    `Are you sure you want to delete ${oldEntries.length} older than ${value} ${unit}?`
                )
            ) {
                for (const entry of oldEntries) {
                    await removeExpiredTab(entry.id);
                }
                await loadAndRender();
            }
        });
});
