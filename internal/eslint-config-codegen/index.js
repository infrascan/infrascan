module.exports = {
  extends: ["custom"],
  rules: {
    "@typescript-eslint/no-explicit-any": ["warn"],
    "no-console": "off",
    "no-undef-init": "off",
    "no-await-in-loop": "off",
    "no-underscore-dangle": ["warn"],
    "no-restricted-syntax": [
      "warn",
      "ForInStatement",
      "LabeledStatement",
      "WithStatement",
    ],
    "import/extensions": [
      "error",
      "always",
      {
        ts: "never",
      },
    ],
  },
};
