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
import {
    checkTabs,
    updateBadge,
    cleanUpStorage,
} from "../src/background/logic.js";

describe("Background Logic", () => {
    beforeEach(() => {
        // Ensure global.chrome is set before each test
        global.chrome = chromeMock;
        sinon.reset();
    });

    afterEach(() => {
        sinon.reset();
    });

    describe("checkTabs", () => {
        it("should close expired tabs", async () => {
            // Settings: 30 minutes
            chromeMock.storage.local.get
                .withArgs(["timeout", "unit", "historyLimit"])
                .resolves({ timeout: 30, unit: "minutes" });
            chromeMock.storage.local.get
                .withArgs(["expiredTabs"])
                .resolves({ expiredTabs: [] });

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

            // Storage data for tabs
            const storageData = {
                tab_1: expiredTime,
                protected_1: false,
                tab_2: expiredTime,
                protected_2: false,
            };

            // We need to handle the bulk get call in checkTabs which passes an array of keys
            // checkTabs calls: chrome.storage.local.get(keysToFetch)
            // keysToFetch will be ["tab_1", "protected_1", "tab_2", "protected_2"]
            chromeMock.storage.local.get.callsFake((keys) => {
                if (Array.isArray(keys) && keys.includes("tab_1")) {
                    return Promise.resolve(storageData);
                }
                if (Array.isArray(keys) && keys.includes("timeout")) {
                    return Promise.resolve({ timeout: 30, unit: "minutes" });
                }
                if (Array.isArray(keys) && keys.includes("expiredTabs")) {
                    return Promise.resolve({ expiredTabs: [] });
                }
                return Promise.resolve({});
            });

            // storage.local.set needs to resolve
            chromeMock.storage.local.set.resolves();

            await checkTabs();

            // Tab 1 should be removed
            expect(chromeMock.tabs.remove.calledWith(1)).to.be.true;

            // Tab 2 should NOT be removed
            expect(chromeMock.tabs.remove.calledWith(2)).to.be.false;
        });

        it("should not close protected tabs", async () => {
            const now = Date.now();
            const expiredTime = now - 31 * 60 * 1000;

            const tabs = [
                { id: 1, active: false, pinned: false, audible: false },
            ];
            chromeMock.tabs.query.resolves(tabs);

            const storageData = {
                tab_1: expiredTime,
                protected_1: true,
            };

            chromeMock.storage.local.get.callsFake((keys) => {
                if (Array.isArray(keys) && keys.includes("tab_1")) {
                    return Promise.resolve(storageData);
                }
                if (Array.isArray(keys) && keys.includes("timeout")) {
                    return Promise.resolve({ timeout: 30, unit: "minutes" });
                }
                return Promise.resolve({});
            });

            await checkTabs();

            expect(chromeMock.tabs.remove.called).to.be.false;
        });

        it("should not close audible or pinned tabs", async () => {
            chromeMock.storage.local.get.callsFake((keys) => {
                if (Array.isArray(keys) && keys.includes("timeout")) {
                    return Promise.resolve({ timeout: 30, unit: "minutes" });
                }
                return Promise.resolve({});
            });

            const tabs = [
                { id: 1, active: false, pinned: true, audible: false },
                { id: 2, active: false, pinned: false, audible: true },
            ];
            chromeMock.tabs.query.resolves(tabs);

            await checkTabs();

            // Should not fetch tab storage if no tabs are candidates for closing
            // checkTabs filters out pinned and audible tabs before fetching storage
            const getCalls = chromeMock.storage.local.get.getCalls();
            // 1 call for settings
            // 0 calls for tab data because list is empty after filtering
            expect(getCalls.length).to.equal(1);
            expect(chromeMock.tabs.remove.called).to.be.false;
        });
    });

    describe("updateBadge", () => {
        it("should show lock icon for protected tab", async () => {
            chromeMock.storage.local.get.resolves({ protected_123: true });

            await updateBadge(123);

            expect(
                chromeMock.action.setBadgeText.calledWith({
                    tabId: 123,
                    text: "🔒",
                })
            ).to.be.true;
        });

        it("should clear badge for unprotected tab", async () => {
            chromeMock.storage.local.get.resolves({ protected_123: false });

            await updateBadge(123);

            expect(
                chromeMock.action.setBadgeText.calledWith({
                    tabId: 123,
                    text: "",
                })
            ).to.be.true;
        });
    });

    describe("cleanUpStorage", () => {
        it("should remove storage keys for non-existent tabs", async () => {
            // Mock current tabs: only tab 1 exists
            chromeMock.tabs.query.resolves([{ id: 1 }]);

            // Mock storage: contains keys for tab 1 and tab 2 (which doesn't exist)
            const storageData = {
                tab_1: 123456,
                protected_1: true,
                tab_2: 123456,
                protected_2: false,
                other_key: "value",
            };
            chromeMock.storage.local.get.resolves(storageData);
            chromeMock.storage.local.remove.resolves();

            await cleanUpStorage();

            // Should call tabs.query
            expect(chromeMock.tabs.query.calledOnce).to.be.true;

            // Should remove tab_2 and protected_2
            expect(chromeMock.storage.local.remove.calledOnce).to.be.true;
            const keysRemoved =
                chromeMock.storage.local.remove.firstCall.args[0];
            expect(keysRemoved).to.include("tab_2");
            expect(keysRemoved).to.include("protected_2");

            // Should NOT remove tab_1 or protected_1
            expect(keysRemoved).to.not.include("tab_1");
            expect(keysRemoved).to.not.include("protected_1");
            expect(keysRemoved).to.not.include("other_key");
        });

        it("should do nothing if all tabs exist", async () => {
            chromeMock.tabs.query.resolves([{ id: 1 }]);

            const storageData = {
                tab_1: 123456,
            };
            chromeMock.storage.local.get.resolves(storageData);

            await cleanUpStorage();

            expect(chromeMock.storage.local.remove.called).to.be.false;
        });
    });
});
