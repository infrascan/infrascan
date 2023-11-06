module.exports = {
  extends: ["custom"],
  root: true,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  rules: {
    "no-await-in-loop": "off",
  },
  ignorePatterns: ["dist/**", ".eslintrc.js"],
};
