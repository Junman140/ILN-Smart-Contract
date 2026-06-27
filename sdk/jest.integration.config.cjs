/**
 * Jest config for the testnet integration suite.
 *
 * Run separately from unit tests (`npm run test:integration`) because these
 * tests hit the live Stellar testnet and require Friendbot-funded keypairs in
 * TEST_SUBMITTER_SECRET and TEST_LP_SECRET.
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testMatch: ["**/tests/integration/**/*.integration.test.ts"],
  // Network round-trips against testnet are slow.
  testTimeout: 300000,
};
