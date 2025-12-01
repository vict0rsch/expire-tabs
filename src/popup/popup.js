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
        "saveBtn",
        "historyBtn",
        "statusMsg",
        "protectToggleBtn",
        "helpIcon",
        "helpModal",
    ]) {
        elements[id] = document.getElementById(id);
        if (!elements[id]) {
            console.error(`Element with id ${id} not found`);
        }
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
    if (elements.timeoutInput) {
        elements.timeoutInput.value = settings.timeout;
    }
    if (elements.unitSelect) {
        elements.unitSelect.value = settings.unit;
    }
    if (elements.historyLimitInput) {
        elements.historyLimitInput.value = settings.historyLimit;
    }

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
    if (elements.saveBtn) {
        elements.saveBtn.addEventListener("click", async () => {
            elements.statusMsg.classList.remove("error");
            const timeout = parseInt(elements.timeoutInput.value, 10);
            const unit = elements.unitSelect.value;
            const historyLimit = parseInt(elements.historyLimitInput.value, 10);

            if (isNaN(timeout) || timeout < 1) {
                elements.statusMsg.textContent = "Invalid time.";
                elements.statusMsg.classList.add("error");
                return;
            }

            if (
                isNaN(historyLimit) ||
                historyLimit < -1 ||
                historyLimit === 0
            ) {
                elements.statusMsg.textContent = "Invalid limit.";
                elements.statusMsg.classList.add("error");
                return;
            }

            await saveSettings({ timeout, unit, historyLimit });
            elements.statusMsg.textContent = "Settings saved.";

            setTimeout(() => {
                elements.statusMsg.textContent = "";
            }, 2000);
        });
    }

    // Open history
    if (elements.historyBtn) {
        elements.historyBtn.addEventListener("click", () =>
            chrome.runtime.openOptionsPage()
        );
    }
});
