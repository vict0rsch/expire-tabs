import resolve from "@rollup/plugin-node-resolve";

export default [
    {
        input: "src/popup/popup.js",
        output: {
            file: "src/popup/bundle.js",
            format: "iife",
            name: "popup",
        },
        plugins: [resolve()],
    },
    {
        input: "src/background/main.js",
        output: {
            file: "src/background/bundle.js",
            format: "iife",
            name: "background",
        },
        plugins: [resolve()],
    },
];
