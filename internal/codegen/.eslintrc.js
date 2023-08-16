export default {
  "extends": ["custom"],
  "root": true,
  "parserOptions": {
    "project": "./tsconfig.json",
    "tsconfigRootDir": __dirname,
  },
  "rules": {
    "no-console": "off",
    "no-await-in-loop": "off"
  },
  "ignorePatterns": ["dist/**"]
}
