// eslint-disable-next-line no-undef
module.exports = {
  extends: ["plugin:n/recommended-module"],
  rules: {
    "n/no-missing-import": 0,
  },
  env: {
    es2022: true,
    node: true,
  },
  parserOptions: {
    project: "server/tsconfig.json",
  },
  settings: {
    "import/resolver": {
      typescript: {
        project: "server/tsconfig.json",
      },
    },
  },
}
