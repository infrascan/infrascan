module.exports = {
  extends: ["custom"],
  root: true,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  rules: {
    "@typescript/no-explicit-any": "off",
    "no-restricted-syntax": [
      "warn",
      "ForInStatement",
      "LabeledStatement",
      "WithStatement",
    ],
    "no-await-in-loop": "off",
  },
  ignorePatterns: ["dist/**", "docs/**", ".eslintrc.js"],
};
