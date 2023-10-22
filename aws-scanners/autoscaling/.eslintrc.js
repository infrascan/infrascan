module.exports = {
  extends: ["codegen"],
  root: true,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: ["dist/**", ".eslintrc.js", "config.ts", "codegen.ts", "test/**.test.ts"],
};
