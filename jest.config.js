/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Integration tests share one test database, so running files in parallel
  // would let one file's cleanup wipe another file's data mid-test.
  maxWorkers: 1,
}
