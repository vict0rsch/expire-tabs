import { defineConfig } from "wxt";

export default defineConfig({
    hooks: {
        // WXT unconditionally sets options_ui from the entrypoint after merging
        // the user manifest, so we fix open_in_tab here instead.
        "build:manifestGenerated": (wxt, manifest) => {
            if (manifest.options_ui) {
                manifest.options_ui.open_in_tab = true;
            }
        },
    },
    // WXT defaults: Chrome MV3, Firefox MV2
    manifest: ({ browser }) => ({
        name: "Expire Tabs",
        description:
            "Automatically closes tabs that haven't been focused for a while.",
        permissions: ["tabs", "storage", "alarms"],
        options_ui: { open_in_tab: true },
        commands: {
            _execute_action: {
                suggested_key: {
                    default: "Alt+Shift+A",
                    mac: "Alt+Shift+A",
                },
                description: "Open the extension popup",
            },
            "toggle-protection": {
                suggested_key: {
                    default: "Alt+Shift+P",
                    mac: "Alt+Shift+P",
                },
                description: "Toggle protection for the current tab",
            },
            "open-history": {
                suggested_key: {
                    default: "Alt+Shift+H",
                    mac: "Alt+Shift+H",
                },
                description: "Open the history (options) page",
            },
        },
        ...(browser === "firefox" && {
            browser_specific_settings: {
                gecko: {
                    id: "expire-tabs@vict0rsch",
                    data_collection_permissions: {
                        required: ["none"],
                    },
                },
            },
        }),
    }),
    outDir: "dist",
});
