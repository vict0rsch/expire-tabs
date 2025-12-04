(function () {
    'use strict';

    /**
     * Content script that displays toast notifications to show tab protection status.
     * Styled to match the extension's design system with inline styles to avoid CSS conflicts.
     */
    (function () {
        const colors = {
            background: "#2e315c",
            backgroundLight: "rgb(145, 150, 230)",
            secondary: "#d58438",
        };

        const toastContainer = document.createElement("div");
        toastContainer.setAttribute("data-extension-toast-container", "true");
        Object.assign(toastContainer.style, {
            position: "fixed",
            bottom: "30px",
            right: "30px",
            zIndex: "2147483647",
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column-reverse",
            gap: "16px",
            fontFamily:
                '"Quicksand", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
        });
        document.body.appendChild(toastContainer);

        function showToast(message, isProtected) {
            const toast = document.createElement("div");
            toast.setAttribute("data-extension-toast", "true");
            toast.setAttribute("role", "alert");
            toast.setAttribute("aria-live", "assertive");
            toast.setAttribute("aria-atomic", "true");
            toast.style.pointerEvents = "auto";

            Object.assign(toast.style, {
                backgroundColor: colors.background,
                borderRadius: "8px",
                boxShadow: `5px 6px 0px 0px ${colors.secondary}`,
                minWidth: "200px",
                maxWidth: "300px",
                opacity: "0",
                transform: "translateX(100%)",
                transition: "all 0.25s ease",
                overflow: "hidden",
            });

            const header = document.createElement("div");
            Object.assign(header.style, {
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                color: "#ffffff",
                backgroundColor: isProtected
                    ? colors.background
                    : colors.backgroundLight,
                borderRadius: "8px",
                fontWeight: "bold",
                fontSize: "0.875rem",
            });

            const messageText = document.createElement("strong");
            messageText.textContent = message;
            messageText.style.flex = "1";
            messageText.style.marginRight = "0.5rem";
            header.appendChild(messageText);

            const closeButton = document.createElement("button");
            closeButton.setAttribute("type", "button");
            closeButton.setAttribute("aria-label", "Close");
            closeButton.textContent = "×";
            Object.assign(closeButton.style, {
                background: "rgba(255, 255, 255, 0.2)",
                border: "none",
                borderRadius: "8px",
                fontSize: "1.2rem",
                lineHeight: "1",
                color: "#ffffff",
                cursor: "pointer",
                padding: "4px 8px",
                marginLeft: "auto",
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                transition: "all 0.25s ease",
            });
            closeButton.addEventListener("mouseenter", () => {
                closeButton.style.background = "rgba(255, 255, 255, 0.3)";
                closeButton.style.transform = "scale(1.1)";
            });
            closeButton.addEventListener("mouseleave", () => {
                closeButton.style.background = "rgba(255, 255, 255, 0.2)";
                closeButton.style.transform = "scale(1)";
            });
            closeButton.addEventListener("click", () => hideToast(toast));
            header.appendChild(closeButton);

            toast.appendChild(header);
            toastContainer.appendChild(toast);

            // Force reflow to ensure initial state is rendered before transition
            toast.offsetHeight;

            requestAnimationFrame(() => {
                toast.style.opacity = "1";
                toast.style.transform = "translateX(0)";
            });

            let autoHideTimer = setTimeout(() => hideToast(toast), 3000);

            toast.addEventListener("mouseenter", () => {
                clearTimeout(autoHideTimer);
                toast.style.transform = "translateX(0) translateY(-2px)";
                toast.style.boxShadow = `3px 4px 0px 0px ${colors.secondary}`;
            });
            toast.addEventListener("mouseleave", () => {
                toast.style.transform = "translateX(0)";
                toast.style.boxShadow = `5px 6px 0px 0px ${colors.secondary}`;
                autoHideTimer = setTimeout(() => hideToast(toast), 3000);
            });
        }

        function hideToast(toast) {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(100%)";
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 200);
        }

        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === "protection-status") {
                showToast(
                    message.isProtected ? "Protected 🔒" : "Unprotected ⏳",
                    message.isProtected
                );
            }
        });
    })();

})();
