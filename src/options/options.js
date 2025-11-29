import {
    getClosedTabs,
    clearClosedTabs,
    removeClosedTab,
} from "../utils/storage.js";

let allTabs = [];

const renderList = (tabsToRender) => {
    const list = document.getElementById("history-list");
    list.innerHTML = "";

    if (tabsToRender.length === 0) {
        list.innerHTML = "<li>No matching closed tabs history.</li>";
        return;
    }

    tabsToRender.forEach((tab) => {
        const li = document.createElement("li");

        const title = document.createElement("span");
        title.className = "title";
        title.textContent = tab.title || "Unknown Title";
        title.title = tab.title || ""; // Tooltip for full text

        const url = document.createElement("span");
        url.className = "url";
        url.textContent = tab.url || "Unknown URL";
        url.title = tab.url || ""; // Tooltip for full text

        // Actions Container
        const actions = document.createElement("div");
        actions.className = "actions";

        // Copy Button
        const copyBtn = document.createElement("button");
        copyBtn.className = "icon-btn copy-btn";
        copyBtn.textContent = "Copy URL";
        copyBtn.title = "Copy URL to clipboard";
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(tab.url);
                const originalText = copyBtn.textContent;
                copyBtn.textContent = "Copied!";
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 1500);
            } catch (err) {
                console.error("Failed to copy: ", err);
            }
        };
        actions.appendChild(copyBtn);

        // Delete Button
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "icon-btn delete-btn";
        deleteBtn.textContent = "×"; // or use an icon
        deleteBtn.title = "Remove from history";
        deleteBtn.onclick = async () => {
            if (confirm("Remove this item?")) {
                await removeClosedTab(tab.id);
                // Reload list - simpler than manipulating DOM and array manually for now
                await loadAndRender();
                // Re-apply filter if search exists
                const searchVal = document.getElementById("search").value;
                if (searchVal) {
                    filterTabs(searchVal);
                }
            }
        };
        actions.appendChild(deleteBtn);

        const time = document.createElement("span");
        time.className = "time";
        time.textContent = new Date(tab.closedAt).toLocaleString();

        li.appendChild(title);
        li.appendChild(url);
        li.appendChild(actions);
        li.appendChild(time);
        list.appendChild(li);
    });
};

const loadAndRender = async () => {
    allTabs = await getClosedTabs();
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

        // Check if title contains all terms
        const titleMatch = terms.every((term) => title.includes(term));
        // Check if url contains all terms
        const urlMatch = terms.every((term) => url.includes(term));

        return titleMatch || urlMatch;
    });

    renderList(filtered);
};

document.addEventListener("DOMContentLoaded", async () => {
    await loadAndRender();

    document.getElementById("clear").addEventListener("click", async () => {
        if (confirm("Are you sure you want to clear history?")) {
            await clearClosedTabs();
            await loadAndRender();
            // Clear search box as well
            document.getElementById("search").value = "";
        }
    });

    document.getElementById("search").addEventListener("input", (e) => {
        filterTabs(e.target.value);
    });
});
