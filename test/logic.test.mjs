import { expect } from "chai";
import sinon from "sinon";

import { getDefaults, unitToMs } from "../src/utils/config.js";
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
    runtime: {
        openOptionsPage: sinon.stub(),
    },
};

const defaults = getDefaults();
const defaultUnitMultiplier = unitToMs(defaults.unit);

// Import after mocking
import {
    checkTabs,
    getTabsStatus,
    updateBadge,
    cleanUpStorage,
    handleCommand,
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
            chromeMock.storage.local.get
                .withArgs(["timeout", "unit", "historyLimit"])
                .resolves({ timeout: defaults.timeout, unit: defaults.unit });
            chromeMock.storage.local.get
                .withArgs(["expiredTabs"])
                .resolves({ expiredTabs: [] });

            const now = Date.now();
            const expiredTime =
                now - (defaults.timeout + 1) * defaultUnitMultiplier;

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
                if (keys === null) {
                    return Promise.resolve(storageData);
                }
                if (Array.isArray(keys) && keys.includes("timeout")) {
                    return Promise.resolve({
                        timeout: defaults.timeout,
                        unit: defaults.unit,
                    });
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
            const expiredTime =
                now - (defaults.timeout + 1) * defaultUnitMultiplier;

            const tabs = [
                { id: 1, active: false, pinned: false, audible: false },
            ];
            chromeMock.tabs.query.resolves(tabs);

            const storageData = {
                tab_1: expiredTime,
                protected_1: true,
            };

            chromeMock.storage.local.get.callsFake((keys) => {
                if (keys === null) {
                    return Promise.resolve(storageData);
                }
                if (Array.isArray(keys) && keys.includes("timeout")) {
                    return Promise.resolve({
                        timeout: defaults.timeout,
                        unit: defaults.unit,
                    });
                }
                return Promise.resolve({});
            });

            await checkTabs();

            expect(chromeMock.tabs.remove.called).to.be.false;
        });

        it("should not close audible or pinned tabs", async () => {
            chromeMock.storage.local.get.callsFake((keys) => {
                if (Array.isArray(keys) && keys.includes("timeout")) {
                    return Promise.resolve({
                        timeout: defaults.timeout,
                        unit: defaults.unit,
                    });
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
            // 1 call for tab data
            expect(getCalls.length).to.equal(2);
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
        it("should log but not remove orphaned keys by default", async () => {
            chromeMock.tabs.query.resolves([{ id: 1 }]);

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

            expect(chromeMock.tabs.query.calledOnce).to.be.true;
            expect(chromeMock.storage.local.remove.called).to.be.false;
        });

        it("should remove orphaned keys when shouldDelete is true", async () => {
            chromeMock.tabs.query.resolves([{ id: 1 }]);

            const storageData = {
                tab_1: 123456,
                protected_1: true,
                tab_2: 123456,
                protected_2: false,
                other_key: "value",
            };
            chromeMock.storage.local.get.resolves(storageData);
            chromeMock.storage.local.remove.resolves();

            await cleanUpStorage({ shouldDelete: true });

            expect(chromeMock.tabs.query.calledOnce).to.be.true;

            expect(chromeMock.storage.local.remove.calledOnce).to.be.true;
            const keysRemoved =
                chromeMock.storage.local.remove.firstCall.args[0];
            expect(keysRemoved).to.include("tab_2");
            expect(keysRemoved).to.include("protected_2");

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

    describe("handleCommand", () => {
        it("should toggle protection ON when tab is unprotected", async () => {
            const tabId = 101;
            chromeMock.tabs.query.resolves([{ id: tabId }]);
            chromeMock.storage.local.get
                .withArgs([`protected_${tabId}`])
                .resolves({});

            await handleCommand("toggle-protection");

            // Should set protected_101 to true
            expect(
                chromeMock.storage.local.set.calledWith({
                    [`protected_${tabId}`]: true,
                })
            ).to.be.true;
        });

        it("should toggle protection OFF when tab is protected", async () => {
            const tabId = 102;
            chromeMock.tabs.query.resolves([{ id: tabId }]);
            chromeMock.storage.local.get
                .withArgs([`protected_${tabId}`])
                .resolves({ [`protected_${tabId}`]: true });

            await handleCommand("toggle-protection");

            // Should remove protected_102
            expect(
                chromeMock.storage.local.remove.calledWith(`protected_${tabId}`)
            ).to.be.true;
            // Should update timestamp (tab_102)
            const setCall = chromeMock.storage.local.set
                .getCalls()
                .find((call) => call.args[0][`tab_${tabId}`]);
            expect(setCall).to.exist;
        });

        it("should open options page on open-history command", async () => {
            await handleCommand("open-history");
            expect(chromeMock.runtime.openOptionsPage.calledOnce).to.be.true;
        });

        it("should ignore unknown commands", async () => {
            await handleCommand("unknown-command");
            expect(chromeMock.tabs.query.called).to.be.false;
        });

        it("should do nothing if no active tab found", async () => {
            chromeMock.tabs.query.resolves([]);
            await handleCommand("toggle-protection");
            expect(chromeMock.storage.local.get.called).to.be.false;
        });
    });

    describe("getTabsStatus", () => {
        it("should correctly categorize tabs based on status and priority", async () => {
            const now = Date.now();
            const expiredTime =
                now - (defaults.timeout + 1) * defaultUnitMultiplier;
            const recentTime =
                now - (defaults.timeout - 1) * defaultUnitMultiplier;

            // Create tabs with conflicting states to test priority
            // Priority: Pinned > Audible > Active > Protected > Expired/MayExpire > Orphan
            const tabs = [
                // 1. Pinned (wins over everything else)
                {
                    id: 1,
                    active: true,
                    pinned: true,
                    audible: true,
                    title: "Pinned Tab",
                },
                // 2. Audible (wins over active/protected/expired)
                {
                    id: 2,
                    active: true,
                    pinned: false,
                    audible: true,
                    title: "Audible Tab",
                },
                // 3. Active (wins over protected/expired)
                {
                    id: 3,
                    active: true,
                    pinned: false,
                    audible: false,
                    title: "Active Tab",
                },
                // 4. Protected (wins over expired)
                {
                    id: 4,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "Protected Tab",
                },
                // 5. Expired (wins over mayExpire)
                {
                    id: 5,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "Expired Tab",
                },
                // 6. MayExpire (wins over orphan)
                {
                    id: 6,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "May Expire Tab",
                },
                // 7. Orphan (no storage data)
                {
                    id: 7,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "Orphan Tab",
                },
            ];

            chromeMock.tabs.query.resolves(tabs);

            const storageData = {
                // Tab 1: Pinned (data irrelevant but present)
                tab_1: expiredTime,
                // Tab 2: Audible (data irrelevant but present)
                tab_2: expiredTime,
                // Tab 3: Active (data irrelevant but present)
                tab_3: expiredTime,
                protected_3: true,
                // Tab 4: Protected
                tab_4: expiredTime,
                protected_4: true,
                // Tab 5: Expired
                tab_5: expiredTime,
                // Tab 6: May Expire
                tab_6: recentTime,
                // Tab 7: Orphan (no data)
            };

            chromeMock.storage.local.get.callsFake((keys) => {
                if (Array.isArray(keys) && keys.includes("timeout")) {
                    return Promise.resolve({
                        timeout: defaults.timeout,
                        unit: defaults.unit,
                    });
                }
                if (keys === null) {
                    return Promise.resolve(storageData);
                }
                return Promise.resolve({});
            });

            const status = await getTabsStatus();

            // Verify counts and IDs
            expect(status.pinned).to.have.length(1);
            expect(status.pinned[0].id).to.equal(1);

            expect(status.audible).to.have.length(1);
            expect(status.audible[0].id).to.equal(2);

            expect(status.active).to.have.length(1);
            expect(status.active[0].id).to.equal(3);

            expect(status.protected).to.have.length(1);
            expect(status.protected[0].id).to.equal(4);

            expect(status.expired).to.have.length(1);
            expect(status.expired[0].id).to.equal(5);

            expect(status.mayExpire).to.have.length(1);
            expect(status.mayExpire[0].id).to.equal(6);

            expect(status.orphan).to.have.length(1);
            expect(status.orphan[0].id).to.equal(7);
        });

        it("should handle exact timeout boundary", async () => {
            const clock = sinon.useFakeTimers({
                now: new Date().getTime(),
                toFake: ["Date"],
            });

            try {
                const now = Date.now();
                const exactTimeoutTime =
                    now - defaults.timeout * defaultUnitMultiplier;

                const tabs = [
                    {
                        id: 1,
                        active: false,
                        pinned: false,
                        audible: false,
                        title: "Boundary Tab",
                        url: "http://boundary.com",
                    },
                ];
                chromeMock.tabs.query.resolves(tabs);

                const storageData = {
                    tab_1: exactTimeoutTime,
                };

                chromeMock.storage.local.get.callsFake((keys) => {
                    if (Array.isArray(keys) && keys.includes("timeout")) {
                        return Promise.resolve({
                            timeout: defaults.timeout,
                            unit: defaults.unit,
                        });
                    }
                    if (keys === null) {
                        return Promise.resolve(storageData);
                    }
                    return Promise.resolve({});
                });

                const status = await getTabsStatus();

                // At exact boundary (diff == timeout), should be in mayExpire (not expired)
                // logic: if (diff > timeout) expired; else if (diff <= timeout) mayExpire
                expect(status.mayExpire).to.have.length(1);
                expect(status.mayExpire[0].id).to.equal(1);
                expect(status.expired).to.have.length(0);
            } finally {
                clock.restore();
            }
        });

        it("should handle empty tabs array", async () => {
            chromeMock.tabs.query.resolves([]);

            chromeMock.storage.local.get.callsFake((keys) => {
                if (Array.isArray(keys) && keys.includes("timeout")) {
                    return Promise.resolve({
                        timeout: defaults.timeout,
                        unit: defaults.unit,
                    });
                }
                if (keys === null) {
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });

            const status = await getTabsStatus();

            expect(status.expired).to.have.length(0);
            expect(status.orphan).to.have.length(0);
            expect(status.audible).to.have.length(0);
            expect(status.pinned).to.have.length(0);
            expect(status.protected).to.have.length(0);
            expect(status.active).to.have.length(0);
            expect(status.mayExpire).to.have.length(0);
        });

        it("should use custom timeout settings", async () => {
            const customTimeout = 24;
            const customUnit = "hours";
            const customUnitMs = unitToMs(customUnit);
            const now = Date.now();
            const expiredTime = now - (customTimeout + 1) * customUnitMs;

            const tabs = [
                {
                    id: 1,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "Custom Timeout Tab",
                    url: "http://custom.com",
                },
            ];
            chromeMock.tabs.query.resolves(tabs);

            const storageData = {
                tab_1: expiredTime,
            };

            chromeMock.storage.local.get.callsFake((keys) => {
                if (Array.isArray(keys) && keys.includes("timeout")) {
                    return Promise.resolve({
                        timeout: customTimeout,
                        unit: customUnit,
                    });
                }
                if (keys === null) {
                    return Promise.resolve(storageData);
                }
                return Promise.resolve({});
            });

            const status = await getTabsStatus();

            expect(status.expired).to.have.length(1);
            expect(status.expired[0].id).to.equal(1);
        });
    });
});
