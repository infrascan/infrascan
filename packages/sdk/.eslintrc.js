module.exports = {
  extends: ["custom"],
  root: true,
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname
  },
  "rules": {
    "no-console": "off",
    "no-await-in-loop": "off",
    "no-restricted-syntax": [
      "warn",
      "ForInStatement",
      "LabeledStatement",
      "WithStatement"
    ],
    "no-plusplus": "off",
    "no-underscore-dangle": "off",
    "no-param-reassign": [2, { "props": false }]
  },
  ignorePatterns: ["dist/**", "docs/**", ".eslintrc.js"]
};
