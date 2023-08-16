export default {
  "extends": ["custom"],
  "root": true,
  "parserOptions": {
    "project": "./tsconfig.json",
    "tsconfigRootDir": __dirname
  },
  "rules": {
    "no-underscore-dangle": "off"
  },
  "ignorePatterns": ["dist/**"]
}
