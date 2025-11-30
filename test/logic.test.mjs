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
            remove: sinon.stub(),
        },
        onChanged: {
            addListener: sinon.stub(),
        },
    },
    tabs: {
        query: sinon.stub(),
        remove: sinon.stub(),
    },
    action: {
        setBadgeText: sinon.stub(),
        setBadgeBackgroundColor: sinon.stub(),
    },
};

// Import after mocking
import { checkTabs, updateBadge } from "../src/background/logic.js";

describe("Background Logic", () => {
    beforeEach(() => {
        // Ensure global.chrome is set before each test
        global.chrome = chromeMock;
        sinon.reset();
    });

    afterEach(() => {
        sinon.reset();
        // delete global.chrome; // Don't delete, it might break other tests if they expect it
    });

    // Helper to mock storage.local.get which is used in mixed ways (Promise vs Callback)
    const mockLocalGet = (data) => {
        chromeMock.storage.local.get.callsFake((keys, callback) => {
            if (typeof callback === "function") {
                callback(data);
            } else {
                return Promise.resolve(data);
            }
        });
    };

    describe("checkTabs", () => {
        it("should close expired tabs", async () => {
            // Settings: 30 minutes
            chromeMock.storage.sync.get.callsFake((keys, callback) => {
                if (typeof callback === "function")
                    callback({ timeout: 30, unit: "minutes" });
            });

            const now = Date.now();
            const expiredTime = now - 31 * 60 * 1000; // 31 minutes ago

            // Mock tabs
            const tabs = [
                {
                    id: 1,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "Expired",
                    url: "http://expired.com",
                },
                {
                    id: 2,
                    active: true,
                    pinned: false,
                    audible: false,
                    title: "Active",
                    url: "http://active.com",
                },
            ];
            chromeMock.tabs.query.resolves(tabs);

            // Storage data
            const storageData = {
                tab_1: expiredTime,
                protected_1: false,
                tab_2: expiredTime,
                protected_2: false,
                expiredTabs: [],
            };

            mockLocalGet(storageData);

            // storage.local.set needs to support both promise and callback
            chromeMock.storage.local.set.callsFake((items, callback) => {
                if (typeof callback === "function") callback();
                else return Promise.resolve();
            });

            await checkTabs();

            // Tab 1 should be removed
            expect(chromeMock.tabs.remove.calledWith(1)).to.be.true;

            // Tab 2 should NOT be removed
            expect(chromeMock.tabs.remove.calledWith(2)).to.be.false;
        });

        it("should not close protected tabs", async () => {
            chromeMock.storage.sync.get.callsFake((keys, callback) => {
                if (typeof callback === "function")
                    callback({ timeout: 30, unit: "minutes" });
            });
            const now = Date.now();
            const expiredTime = now - 31 * 60 * 1000;

            const tabs = [
                { id: 1, active: false, pinned: false, audible: false },
            ];
            chromeMock.tabs.query.resolves(tabs);

            mockLocalGet({
                tab_1: expiredTime,
                protected_1: true,
            });

            await checkTabs();

            expect(chromeMock.tabs.remove.called).to.be.false;
        });

        it("should not close audible or pinned tabs", async () => {
            chromeMock.storage.sync.get.callsFake((keys, callback) => {
                if (typeof callback === "function")
                    callback({ timeout: 30, unit: "minutes" });
            });

            const tabs = [
                { id: 1, active: false, pinned: true, audible: false },
                { id: 2, active: false, pinned: false, audible: true },
            ];
            chromeMock.tabs.query.resolves(tabs);

            await checkTabs();

            expect(chromeMock.storage.local.get.called).to.be.false;
            expect(chromeMock.tabs.remove.called).to.be.false;
        });
    });

    describe("updateBadge", () => {
        it("should show lock icon for protected tab", async () => {
            mockLocalGet({ protected_123: true });

            await updateBadge(123);

            expect(
                chromeMock.action.setBadgeText.calledWith({
                    tabId: 123,
                    text: "🔒",
                })
            ).to.be.true;
        });

        it("should clear badge for unprotected tab", async () => {
            mockLocalGet({ protected_123: false });

            await updateBadge(123);

            expect(
                chromeMock.action.setBadgeText.calledWith({
                    tabId: 123,
                    text: "",
                })
            ).to.be.true;
        });
    });
});
