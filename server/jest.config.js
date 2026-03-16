// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFiles: ['./tests/setup.js'],
  testTimeout: 30000, // 30s — DB operations can be slow
  verbose: true,
  // Run test files sequentially — avoids DB race conditions
  maxWorkers: 1,
  // Clear mocks between tests
  clearMocks: true,
  // Collect coverage
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**',
  ],
};
