import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..");

const main = async () => {
    const packageData = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    );
    const version = packageData.version;

    const chromeZipWithVersion = path.join(
        ROOT,
        `dist/expire-tabs-${version}-chrome.zip`,
    );
    const firefoxZipWithVersion = path.join(
        ROOT,
        `dist/expire-tabs-${version}-firefox.zip`,
    );
    const firefoxSourceWithVersion = path.join(
        ROOT,
        `dist/expire-tabs-${version}-sources.zip`,
    );

    if (!fs.existsSync(chromeZipWithVersion)) {
        throw new Error(
            `Chrome zip not found at ${chromeZipWithVersion}, run $ bun run zip`,
        );
    }
    if (!fs.existsSync(firefoxZipWithVersion)) {
        throw new Error(
            `Firefox zip not found at ${firefoxZipWithVersion}, run $ bun run zip`,
        );
    }
    if (!fs.existsSync(firefoxSourceWithVersion)) {
        throw new Error(
            `Firefox source zip not found at ${firefoxSourceWithVersion}, run $ bun run zip`,
        );
    }

    console.log("Chrome zip found");
    console.log(`${chromeZipWithVersion}`);
    console.log("Firefox zip found");
    console.log(`${firefoxZipWithVersion}`);
    console.log("Firefox source zip found");
    console.log(`${firefoxSourceWithVersion}`);

    // subprocess command:
    const subprocess = await exec(
        `cd ${ROOT} && ./node_modules/.bin/publish-extension submit --firefox-zip ${firefoxZipWithVersion} --firefox-sources-zip ${firefoxSourceWithVersion} --chrome-zip ${chromeZipWithVersion}`,
    );
    console.log(subprocess.stdout);
    console.log(subprocess.stderr);
};

main();
