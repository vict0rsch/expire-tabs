import {
    getExpiredTabs,
    clearExpiredTabs,
    removeExpiredTab,
} from "../utils/storage.js";

let allTabs = [];

const escapeHtml = (unsafe) => {
    return (unsafe || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

const renderList = (tabsToRender) => {
    const list = document.getElementById("history-list");

    if (tabsToRender.length === 0) {
        list.innerHTML = "<li>No matching closed tabs history.</li>";
        return;
    }

    const html = tabsToRender
        .map((tab) => {
            const title = escapeHtml(tab.title || "Unknown Title");
            const url = escapeHtml(tab.url || "Unknown URL");
            const time = new Date(tab.closedAt).toLocaleString();
            const id = escapeHtml(String(tab.id));

            return `
            <li data-id="${id}" data-url="${url}">
                <span class="title" title="${title}">${title}</span>
                <a class="url" title="${url}" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>
                <span class="time">${time}</span>
                <div class="actions">
                    <button class="icon-btn copy-btn" title="Copy URL to clipboard">Copy URL</button>
                    <button class="icon-btn delete-btn" title="Remove from history">×</button>
                </div>
            </li>
        `;
        })
        .join("");

    list.innerHTML = html;

    // Re-attach event listeners
    list.querySelectorAll(".copy-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            const li = e.target.closest("li");
            const url = li.dataset.url;
            try {
                const decodedUrl = new DOMParser().parseFromString(
                    url,
                    "text/html"
                ).documentElement.textContent;
                await navigator.clipboard.writeText(decodedUrl);
                const originalText = btn.textContent;
                btn.textContent = "Copied!";
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 1500);
            } catch (err) {
                console.error("Failed to copy: ", err);
            }
        });
    });

    list.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            if (confirm("Remove this item?")) {
                const li = e.target.closest("li");
                const id = li.dataset.id;
                try {
                    await removeExpiredTab(id);
                    await loadAndRender();
                    const searchVal = document.getElementById("search").value;
                    if (searchVal) {
                        filterTabs(searchVal);
                    }
                } catch (err) {
                    console.error("Error deleting:", err);
                }
            }
        });
    });
};

const loadAndRender = async () => {
    allTabs = await getExpiredTabs();
    renderList(allTabs);
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

document.addEventListener("DOMContentLoaded", async () => {
    await loadAndRender();

    document.getElementById("clear").addEventListener("click", async () => {
        if (confirm("Are you sure you want to clear history?")) {
            await clearExpiredTabs();
            await loadAndRender();
            document.getElementById("search").value = "";
        }
    });

    document.getElementById("search").addEventListener("input", (e) => {
        filterTabs(e.target.value);
    });
});
