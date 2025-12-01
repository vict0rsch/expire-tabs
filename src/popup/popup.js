import {
    getSettings,
    saveSettings,
    getTabProtection,
    setTabProtection,
} from "../utils/storage.js";

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
