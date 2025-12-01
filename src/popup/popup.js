import {
    getSettings,
    saveSettings,
    getTabProtection,
    setTabProtection,
} from "../utils/storage.js";

document.addEventListener("DOMContentLoaded", async () => {
    const elements = {};
    for (const id of [
        "timeoutInput",
        "unitSelect",
        "historyLimitInput",
        "save",
        "history",
        "status",
        "protectToggleBtn",
        "helpIcon",
        "helpModal",
    ]) {
        elements[id] = document.getElementById(id);
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
    if (elements.save) {
        elements.save.addEventListener("click", async () => {
            elements.status.classList.remove("error");
            const timeout = parseInt(elements.timeoutInput.value, 10);
            const unit = elements.unitSelect.value;
            const historyLimit = parseInt(elements.historyLimitInput.value, 10);

            if (isNaN(timeout) || timeout < 1) {
                elements.status.textContent = "Invalid time.";
                elements.status.classList.add("error");
                return;
            }

            if (
                isNaN(historyLimit) ||
                historyLimit < -1 ||
                historyLimit === 0
            ) {
                elements.status.textContent = "Invalid limit.";
                elements.status.classList.add("error");
                return;
            }

            await saveSettings({ timeout, unit, historyLimit });
            elements.status.textContent = "Settings saved.";

            setTimeout(() => {
                elements.status.textContent = "";
            }, 2000);
        });
    }

    // Open history
    if (elements.history) {
        elements.history.addEventListener("click", () => {
            chrome.runtime.openOptionsPage();
        });
    }

    for (const element of Object.values(elements)) {
        if (!element) {
            console.error(`Element with id ${id} not found`);
        }
    }
});
