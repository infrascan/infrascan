module.exports = {
  extends: ["custom"],
  root: true,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  rules: {
    "no-console": "off",
    "no-await-in-loop": "off"
  },
  ignorePatterns: ["dist/**",".eslintrc.js", "config.ts", "codegen.ts"]
}
