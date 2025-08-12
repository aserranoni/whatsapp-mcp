// Global test setup for Jest
global.console = {
  ...console,
  // Uncomment to silence console output during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.WHATSAPP_SESSION_NAME = 'test-session';
process.env.AUDIO_OUTPUT_DIR = './test-audio';

// Clean up test files after tests
afterAll(() => {
  // Add any global cleanup here if needed
});