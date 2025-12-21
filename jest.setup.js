import '@testing-library/jest-dom'

// Mock window.location properly for all tests
delete window.location;
window.location = {
  origin: 'http://localhost:3000',
  href: 'http://localhost:3000',
  protocol: 'http:',
  host: 'localhost:3000',
  hostname: 'localhost',
  port: '3000',
  pathname: '/',
  search: '',
  hash: '',
  assign: jest.fn(),
  reload: jest.fn(),
  replace: jest.fn(),
};
