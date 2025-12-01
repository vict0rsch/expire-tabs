const defaultSettings = {
    timeout: 12,
    unit: "hours",
    historyLimit: 1000,
};

/**
 * Returns a copy of the default settings.
 */
export const getDefaults = () => {
    return { ...defaultSettings };
};
