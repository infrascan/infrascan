module.exports = {
  extends: ["custom"],
  root: true,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  rules: {},
  ignorePatterns: ["dist/**", "docs/**", ".eslintrc.js"],
};
