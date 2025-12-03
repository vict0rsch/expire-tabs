import resolve from "@rollup/plugin-node-resolve";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// Shared timeout to ensure only one build runs even with multiple configs
let buildTimeout;

const triggerExtensionBuild = () => {
    return {
        name: "trigger-extension-build",
        writeBundle() {
            // Clear any pending build
            if (buildTimeout) clearTimeout(buildTimeout);

            // Set a new timeout
            buildTimeout = setTimeout(() => {
                const command =
                    'concurrently "extension build --zip --zip-source" "extension build --zip --browser=firefox"';

                console.log(`\n📦 Triggering extension build...\n`);
                // Use shell: true for command chaining with &&
                const child = spawn(command, { stdio: "inherit", shell: true });

                child.on("close", (code) => {
                    if (code === 0) {
                        console.log(
                            `\n✅ Extension build completed successfully at ${new Date().toLocaleTimeString()}\n`
                        );
                    } else {
                        console.error(
                            `❌ Extension build failed with code ${code}`
                        );
                    }
                });
            }, 1000); // Increased to 1s to be safe
        },
    };
};

const watchExtraFiles = () => {
    return {
        name: "watch-extra-files",
        buildStart() {
            // Watch manifest
            this.addWatchFile("src/manifest.json");

            // Watch all HTML and CSS files in src
            const findFiles = (dir) => {
                // Skip dist directory to avoid infinite loops
                if (dir.includes("dist") || dir.includes("node_modules"))
                    return;

                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    if (stat.isDirectory()) {
                        findFiles(filePath);
                    } else if (
                        file.endsWith(".html") ||
                        file.endsWith(".css")
                    ) {
                        this.addWatchFile(filePath);
                    }
                }
            };

            try {
                findFiles("src");
            } catch (err) {
                console.error("Error watching extra files:", err);
            }
        },
    };
};

export default [
    {
        input: "src/popup/popup.js",
        output: {
            file: "src/popup/popup.bundle.js",
            format: "iife",
            name: "popup",
        },
        // Add the watcher here so it triggers a rebuild (and thus the extension build)
        plugins: [resolve(), watchExtraFiles(), triggerExtensionBuild()],
    },
    {
        input: "src/background/main.js",
        output: {
            file: "src/background/background.bundle.js",
            format: "iife",
            name: "background",
        },
        plugins: [resolve(), triggerExtensionBuild()],
    },
    {
        input: "src/options/options.js",
        output: {
            file: "src/options/options.bundle.js",
            format: "iife",
            name: "options",
        },
        plugins: [resolve(), triggerExtensionBuild()],
    },
];
