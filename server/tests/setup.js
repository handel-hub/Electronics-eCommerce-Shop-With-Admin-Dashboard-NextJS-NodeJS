// tests/setup.js
// Must run before any test file
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
// Set env vars needed for tests

process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'jest-test-secret-minimum-32-chars!!';
process.env.DATABASE_URL = process.env.DATABASE_URL; // Use same DB — test data is cleaned up

// Suppress console.error noise during tests
// Comment these out if you need to debug
global.console.error = jest.fn();
global.console.warn = jest.fn();
