const defaultSettings = {
    timeout: 12,
    unit: "hours",
    historyLimit: 1000,
    batchSize: 25,
    loadMargin: 5,
};

/**
 * Converts a unit to milliseconds.
 * Units are: minutes, hours, days.
 * @throws {Error} If the unit is invalid.
 * @param {string} unit - The unit to convert.
 * @returns {number} The number of milliseconds in the unit.
 */
export const unitToMs = (unit) => {
    switch (unit) {
        case "minutes":
            return 60 * 1000;
        case "hours":
            return 60 * 60 * 1000;
        case "days":
            return 24 * 60 * 60 * 1000;
    }
    throw new Error(`Invalid unit: ${unit}`);
};

/**
 * Get a copy of the default settings object.
 * @returns {Object} The default settings.
 */
export const getDefaults = () => {
    return { ...defaultSettings };
};
