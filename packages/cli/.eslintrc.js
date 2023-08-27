module.exports = {
  extends: ["custom"],
  root: true,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname
  },
  "rules": {
    "no-underscore-dangle": "off",
    "no-await-in-loop": "off",
    "no-restricted-syntax": [
      "warn",
      "ForInStatement"
    ]
  },
  ignorePatterns: ["dist/**", ".eslintrc.js"]
}
