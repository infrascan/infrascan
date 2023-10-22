module.exports = {
  extends: ["codegen"],
  root: true,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  "rules": {
    "no-param-reassign": [2, { "props": false }]
  },
  ignorePatterns: ["dist/**", ".eslintrc.js", "config.ts", "codegen.ts", "test/*.test.ts"]
};
