import { expect } from "chai";
import sinon from "sinon";

// Mock browser API
const chromeMock = {
    storage: {
        sync: {
            get: sinon.stub(),
            set: sinon.stub(),
        },
        local: {
            get: sinon.stub(),
            set: sinon.stub(),
        },
    },
};

global.chrome = chromeMock;

// Import after mocking
import {
    getSettings,
    saveSettings,
    getExpiredTabs,
    addExpiredTab,
    clearExpiredTabs,
    removeExpiredTab,
} from "../src/utils/storage.js";

describe("Storage Utils", () => {
    beforeEach(() => {
        global.chrome = chromeMock;
        sinon.reset();
    });

    afterEach(() => {
        sinon.reset();
    });

    describe("getSettings", () => {
        it("should return default settings if not set", async () => {
            chromeMock.storage.sync.get.yields({});
            const settings = await getSettings();
            expect(settings.timeout).to.equal(30);
            expect(settings.unit).to.equal("minutes");
            expect(settings.historyLimit).to.equal(100);
        });

        it("should return saved settings", async () => {
            chromeMock.storage.sync.get.yields({
                timeout: 60,
                unit: "hours",
                historyLimit: 200,
            });
            const settings = await getSettings();
            expect(settings.timeout).to.equal(60);
            expect(settings.unit).to.equal("hours");
            expect(settings.historyLimit).to.equal(200);
        });
    });

    describe("saveSettings", () => {
        it("should save settings object", async () => {
            chromeMock.storage.sync.set.yields();
            await saveSettings({ timeout: 45, unit: "days", historyLimit: 50 });
            expect(
                chromeMock.storage.sync.set.calledWith({
                    timeout: 45,
                    unit: "days",
                    historyLimit: 50,
                })
            ).to.be.true;
        });
    });

    describe("addExpiredTab", () => {
        it("should add a tab to history and generate ID", async () => {
            // getSettings returns default historyLimit=100
            chromeMock.storage.sync.get.yields({});
            chromeMock.storage.local.get.yields({ expiredTabs: [] });
            chromeMock.storage.local.set.yields();

            const tab = {
                title: "Test",
                url: "http://test.com",
                closedAt: 12345,
            };
            await addExpiredTab(tab);

            const savedTab =
                chromeMock.storage.local.set.firstCall.args[0].expiredTabs[0];
            expect(savedTab.title).to.equal(tab.title);
            expect(savedTab.url).to.equal(tab.url);
            expect(savedTab.id).to.exist; // Check if ID was generated
        });

        it("should limit history to configured limit", async () => {
            // Mock configured limit of 10
            chromeMock.storage.sync.get.yields({ historyLimit: 10 });

            const existing = Array(10).fill({ title: "Old", url: "old.com" });
            chromeMock.storage.local.get.yields({ expiredTabs: existing });
            chromeMock.storage.local.set.yields();

            const tab = { title: "New", url: "new.com" };
            await addExpiredTab(tab);

            const args = chromeMock.storage.local.set.firstCall.args[0];
            expect(args.expiredTabs.length).to.equal(10);
            expect(args.expiredTabs[0].title).to.equal(tab.title);
        });

        it("should allow infinite history if limit is -1", async () => {
            // Mock infinite limit
            chromeMock.storage.sync.get.yields({ historyLimit: -1 });

            // Existing 150 items (more than default 100)
            const existing = Array(150).fill({ title: "Old", url: "old.com" });
            chromeMock.storage.local.get.yields({ expiredTabs: existing });
            chromeMock.storage.local.set.yields();

            const tab = { title: "New", url: "new.com" };
            await addExpiredTab(tab);

            const args = chromeMock.storage.local.set.firstCall.args[0];
            expect(args.expiredTabs.length).to.equal(151);
        });
    });

    describe("removeExpiredTab", () => {
        it("should remove a tab by ID", async () => {
            const tabs = [
                { id: "1", title: "Tab 1" },
                { id: "2", title: "Tab 2" },
                { id: "3", title: "Tab 3" },
            ];
            chromeMock.storage.local.get.yields({ expiredTabs: tabs });
            chromeMock.storage.local.set.yields();

            await removeExpiredTab("2");

            const savedTabs =
                chromeMock.storage.local.set.firstCall.args[0].expiredTabs;
            expect(savedTabs.length).to.equal(2);
            expect(savedTabs.find((t) => t.id === "2")).to.be.undefined;
        });
    });

    describe("clearExpiredTabs", () => {
        it("should clear history", async () => {
            chromeMock.storage.local.set.yields();
            await clearExpiredTabs();
            expect(chromeMock.storage.local.set.calledWith({ expiredTabs: [] }))
                .to.be.true;
        });
    });
});
