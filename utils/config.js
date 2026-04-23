import { Duration } from "luxon";

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

/**
 * Formats a duration in milliseconds to a human-readable string.
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
export const msToDuration = (ms) => {
    const daysMs = 24 * 60 * 60 * 1000;
    const hoursMs = 60 * 60 * 1000;
    return ms > 2 * daysMs
        ? Duration.fromMillis(ms).toFormat("d 'days' hh:mm:ss")
        : ms > daysMs
        ? Duration.fromMillis(ms).toFormat("d 'day' hh:mm:ss")
        : ms > hoursMs
        ? Duration.fromMillis(ms).toFormat("h 'hours' mm:ss")
        : Duration.fromMillis(ms).toFormat("mm:ss");
};
