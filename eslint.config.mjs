import pluginNext from "@next/eslint-plugin-next";

export default [
  {
    plugins: { "@next/next": pluginNext },
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },
  { ignores: [".next/*", "node_modules/*"] },
];
