import { expect } from "chai";
import sinon from "sinon";

import { getDefaults, unitToMs } from "../utils/config.js";
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
        get: sinon.stub(),
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
    expireAllTabs,
} from "../utils/background/logic.js";

describe("Background Logic", () => {
    beforeEach(() => {
        // Ensure browser globals are set before each test
        global.chrome = chromeMock;
        global.browser = chromeMock;
        sinon.reset();
        // Default: tabs.get rejects (tab not found / truly orphaned).
        // Tests exercising the cross-workspace path opt-in by overriding this.
        chromeMock.tabs.get.rejects(new Error("Tab not found"));
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
            const expiredTime = now - (defaults.timeout + 1) * defaultUnitMultiplier;

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
            const expiredTime = now - (defaults.timeout + 1) * defaultUnitMultiplier;

            const tabs = [{ id: 1, active: false, pinned: false, audible: false }];
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

        it("should close expired tabs in other workspaces (Zen/Firefox bug)", async () => {
            const now = Date.now();
            const expiredTime = now - (defaults.timeout + 1) * defaultUnitMultiplier;

            // Only tab 1 is in the current workspace; tab 99 is in another
            // workspace and only reachable via tabs.get, but it has an expired
            // timestamp in storage and must still be closed.
            chromeMock.tabs.query.resolves([
                {
                    id: 1,
                    active: true,
                    pinned: false,
                    audible: false,
                    title: "Active",
                    url: "http://active.com",
                },
            ]);

            const storageData = {
                tab_1: expiredTime,
                tab_99: expiredTime,
            };

            chromeMock.storage.local.get.callsFake((keys) => {
                if (keys === null) return Promise.resolve(storageData);
                if (Array.isArray(keys) && keys.includes("timeout"))
                    return Promise.resolve({
                        timeout: defaults.timeout,
                        unit: defaults.unit,
                    });
                if (Array.isArray(keys) && keys.includes("expiredTabs"))
                    return Promise.resolve({ expiredTabs: [] });
                return Promise.resolve({});
            });
            chromeMock.storage.local.set.resolves();
            chromeMock.tabs.remove.resolves();

            chromeMock.tabs.get.withArgs(99).resolves({
                id: 99,
                active: false,
                pinned: false,
                audible: false,
                title: "Cross-workspace",
                url: "http://other-workspace.com",
            });

            await checkTabs();

            // Hidden expired tab must be closed
            expect(chromeMock.tabs.remove.calledWith(99)).to.be.true;
            // Active visible tab must NOT be closed
            expect(chromeMock.tabs.remove.calledWith(1)).to.be.false;
        });

        it("should NOT close hidden tabs that are pinned/audible/active", async () => {
            const now = Date.now();
            const expiredTime = now - (defaults.timeout + 1) * defaultUnitMultiplier;

            chromeMock.tabs.query.resolves([]);

            const storageData = {
                tab_50: expiredTime, // hidden + pinned -> shielded
                tab_51: expiredTime, // hidden + audible -> shielded
                tab_52: expiredTime, // hidden + active -> shielded
            };

            chromeMock.storage.local.get.callsFake((keys) => {
                if (keys === null) return Promise.resolve(storageData);
                if (Array.isArray(keys) && keys.includes("timeout"))
                    return Promise.resolve({
                        timeout: defaults.timeout,
                        unit: defaults.unit,
                    });
                if (Array.isArray(keys) && keys.includes("expiredTabs"))
                    return Promise.resolve({ expiredTabs: [] });
                return Promise.resolve({});
            });
            chromeMock.storage.local.set.resolves();
            chromeMock.tabs.remove.resolves();

            chromeMock.tabs.get.withArgs(50).resolves({
                id: 50,
                pinned: true,
                audible: false,
                active: false,
                title: "Hidden Pinned",
                url: "http://p.com",
            });
            chromeMock.tabs.get.withArgs(51).resolves({
                id: 51,
                pinned: false,
                audible: true,
                active: false,
                title: "Hidden Audible",
                url: "http://a.com",
            });
            chromeMock.tabs.get.withArgs(52).resolves({
                id: 52,
                pinned: false,
                audible: false,
                active: true,
                title: "Hidden Active",
                url: "http://act.com",
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
                }),
            ).to.be.true;
        });

        it("should clear badge for unprotected tab", async () => {
            chromeMock.storage.local.get.resolves({ protected_123: false });

            await updateBadge(123);

            expect(
                chromeMock.action.setBadgeText.calledWith({
                    tabId: 123,
                    text: "",
                }),
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
            const keysRemoved = chromeMock.storage.local.remove.firstCall.args[0];
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

        it("should not remove keys for cross-workspace tabs reachable via tabs.get", async () => {
            // Tab 1 visible (current workspace), tab 2 not in query but reachable via get
            // (e.g. in another Zen workspace). Its keys must NOT be removed.
            chromeMock.tabs.query.resolves([{ id: 1 }]);

            const storageData = {
                tab_1: 123456,
                tab_2: 123456,
                protected_2: true,
                tab_3: 123456,
            };
            chromeMock.storage.local.get.resolves(storageData);
            chromeMock.storage.local.remove.resolves();

            chromeMock.tabs.get
                .withArgs(2)
                .resolves({ id: 2, title: "Hidden", url: "http://hidden.com" });
            chromeMock.tabs.get.withArgs(3).rejects(new Error("Tab not found"));

            await cleanUpStorage({ shouldDelete: true });

            expect(chromeMock.storage.local.remove.calledOnce).to.be.true;
            const keysRemoved = chromeMock.storage.local.remove.firstCall.args[0];
            // Only tab 3 keys should be removed
            expect(keysRemoved).to.include("tab_3");
            expect(keysRemoved).to.not.include("tab_1");
            expect(keysRemoved).to.not.include("tab_2");
            expect(keysRemoved).to.not.include("protected_2");
        });
    });

    describe("handleCommand", () => {
        it("should toggle protection ON when tab is unprotected", async () => {
            const tabId = 101;
            chromeMock.tabs.query.resolves([{ id: tabId }]);
            chromeMock.storage.local.get.withArgs([`protected_${tabId}`]).resolves({});

            await handleCommand("toggle-protection");

            // Should set protected_101 to true
            expect(
                chromeMock.storage.local.set.calledWith({
                    [`protected_${tabId}`]: true,
                }),
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
            expect(chromeMock.storage.local.remove.calledWith(`protected_${tabId}`)).to
                .be.true;
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

    describe("expireAllTabs", () => {
        it("should close all expirable tabs (expired + mayExpire + orphan)", async () => {
            const now = Date.now();
            const expiredTime = now - (defaults.timeout + 1) * defaultUnitMultiplier;
            const recentTime = now - (defaults.timeout - 1) * defaultUnitMultiplier;

            const tabs = [
                {
                    id: 1,
                    active: false,
                    pinned: true,
                    audible: false,
                    title: "Pinned",
                    url: "http://pinned.com",
                },
                {
                    id: 2,
                    active: false,
                    pinned: false,
                    audible: true,
                    title: "Audible",
                    url: "http://audible.com",
                },
                {
                    id: 3,
                    active: true,
                    pinned: false,
                    audible: false,
                    title: "Active",
                    url: "http://active.com",
                },
                {
                    id: 4,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "Protected",
                    url: "http://protected.com",
                },
                {
                    id: 5,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "Expired",
                    url: "http://expired.com",
                },
                {
                    id: 6,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "MayExpire",
                    url: "http://mayexpire.com",
                },
                {
                    id: 7,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "Orphan",
                    url: "http://orphan.com",
                },
            ];
            chromeMock.tabs.query.resolves(tabs);
            chromeMock.tabs.remove.resolves();

            const storageData = {
                tab_1: expiredTime,
                tab_2: expiredTime,
                tab_3: expiredTime,
                protected_4: true,
                tab_4: expiredTime,
                tab_5: expiredTime,
                tab_6: recentTime,
            };

            chromeMock.storage.local.get.callsFake((keys) => {
                if (keys === null) return Promise.resolve(storageData);
                if (Array.isArray(keys) && keys.includes("timeout"))
                    return Promise.resolve({
                        timeout: defaults.timeout,
                        unit: defaults.unit,
                    });
                if (Array.isArray(keys) && keys.includes("expiredTabs"))
                    return Promise.resolve({ expiredTabs: [] });
                return Promise.resolve({});
            });
            chromeMock.storage.local.set.resolves();

            const result = await expireAllTabs();

            expect(result.closed).to.equal(3);
            expect(chromeMock.tabs.remove.calledWith(5)).to.be.true;
            expect(chromeMock.tabs.remove.calledWith(6)).to.be.true;
            expect(chromeMock.tabs.remove.calledWith(7)).to.be.true;

            expect(chromeMock.tabs.remove.calledWith(1)).to.be.false;
            expect(chromeMock.tabs.remove.calledWith(2)).to.be.false;
            expect(chromeMock.tabs.remove.calledWith(3)).to.be.false;
            expect(chromeMock.tabs.remove.calledWith(4)).to.be.false;
        });

        it("should return 0 when no expirable tabs exist", async () => {
            const tabs = [
                {
                    id: 1,
                    active: true,
                    pinned: false,
                    audible: false,
                    title: "Active",
                    url: "http://active.com",
                },
                {
                    id: 2,
                    active: false,
                    pinned: true,
                    audible: false,
                    title: "Pinned",
                    url: "http://pinned.com",
                },
            ];
            chromeMock.tabs.query.resolves(tabs);

            chromeMock.storage.local.get.callsFake((keys) => {
                if (keys === null) return Promise.resolve({});
                if (Array.isArray(keys) && keys.includes("timeout"))
                    return Promise.resolve({
                        timeout: defaults.timeout,
                        unit: defaults.unit,
                    });
                return Promise.resolve({});
            });

            const result = await expireAllTabs();

            expect(result.closed).to.equal(0);
            expect(chromeMock.tabs.remove.called).to.be.false;
        });

        it("should handle empty tabs array", async () => {
            chromeMock.tabs.query.resolves([]);

            chromeMock.storage.local.get.callsFake((keys) => {
                if (keys === null) return Promise.resolve({});
                if (Array.isArray(keys) && keys.includes("timeout"))
                    return Promise.resolve({
                        timeout: defaults.timeout,
                        unit: defaults.unit,
                    });
                return Promise.resolve({});
            });

            const result = await expireAllTabs();

            expect(result.closed).to.equal(0);
            expect(chromeMock.tabs.remove.called).to.be.false;
        });
    });

    describe("getTabsStatus", () => {
        it("should correctly categorize tabs based on status and priority", async () => {
            const now = Date.now();
            const expiredTime = now - (defaults.timeout + 1) * defaultUnitMultiplier;
            const recentTime = now - (defaults.timeout - 1) * defaultUnitMultiplier;

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
                const exactTimeoutTime = now - defaults.timeout * defaultUnitMultiplier;

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

        it("should include hidden cross-workspace tabs and expose hiddenTabIds", async () => {
            const now = Date.now();
            const expiredTime = now - (defaults.timeout + 1) * defaultUnitMultiplier;
            const recentTime = now - (defaults.timeout - 1) * defaultUnitMultiplier;

            // One visible tab and two hidden tabs (different workspaces)
            chromeMock.tabs.query.resolves([
                {
                    id: 1,
                    active: false,
                    pinned: false,
                    audible: false,
                    title: "Visible MayExpire",
                    url: "http://v.com",
                },
            ]);

            const storageData = {
                tab_1: recentTime,
                tab_10: expiredTime,
                tab_11: recentTime,
                protected_11: true,
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

            chromeMock.tabs.get.withArgs(10).resolves({
                id: 10,
                active: false,
                pinned: false,
                audible: false,
                title: "Hidden Expired",
                url: "http://hex.com",
            });
            chromeMock.tabs.get.withArgs(11).resolves({
                id: 11,
                active: false,
                pinned: false,
                audible: false,
                title: "Hidden Protected",
                url: "http://hp.com",
            });

            const status = await getTabsStatus();

            expect(status.mayExpire.map((t) => t.id)).to.include(1);
            expect(status.expired.map((t) => t.id)).to.include(10);
            expect(status.protected.map((t) => t.id)).to.include(11);

            expect(status.hiddenTabIds).to.be.instanceOf(Set);
            expect(status.hiddenTabIds.has(10)).to.be.true;
            expect(status.hiddenTabIds.has(11)).to.be.true;
            expect(status.hiddenTabIds.has(1)).to.be.false;
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
