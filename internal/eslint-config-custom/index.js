module.exports = {
  extends: [
    'turbo',
    'airbnb-base',
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    "import/prefer-default-export": "off",
  },
};
