import { getSettings, saveSettings } from "../utils/storage.js";

document.addEventListener("DOMContentLoaded", async () => {
    const timeoutInput = document.getElementById("timeout");
    const unitInput = document.getElementById("unit");
    const historyLimitInput = document.getElementById("historyLimit");
    const saveButton = document.getElementById("save");
    const historyButton = document.getElementById("history");
    const status = document.getElementById("status");

    // Load current settings
    const settings = await getSettings();
    timeoutInput.value = settings.timeout;
    unitInput.value = settings.unit;
    historyLimitInput.value = settings.historyLimit;

    // Save setting
    saveButton.addEventListener("click", async () => {
        const timeout = parseInt(timeoutInput.value, 10);
        const unit = unitInput.value;
        const historyLimit = parseInt(historyLimitInput.value, 10);

        if (isNaN(timeout) || timeout < 1) {
            status.textContent = "Invalid time.";
            status.style.color = "red";
            return;
        }

        if (isNaN(historyLimit) || historyLimit < -1 || historyLimit === 0) {
            status.textContent = "Invalid limit.";
            status.style.color = "red";
            return;
        }

        await saveSettings({ timeout, unit, historyLimit });
        status.textContent = "Settings saved.";
        status.style.color = "green";

        setTimeout(() => {
            status.textContent = "";
        }, 2000);
    });

    // Open history
    historyButton.addEventListener("click", () => {
        chrome.runtime.openOptionsPage();
    });
});
