module.exports = {
  extends: ["codegen"],
  root: true,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  "rules": {
    "no-underscore-dangle": "warn"
  },
  ignorePatterns: ["dist/**", ".eslintrc.js", "config.ts", "codegen.ts", "test/*.test.ts"],
};
