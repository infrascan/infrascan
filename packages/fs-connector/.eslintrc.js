module.exports = {
  extends: ["custom"],
  root: true,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname
  },
  ignorePatterns: ["dist/**", ".eslintrc.js"]
}
