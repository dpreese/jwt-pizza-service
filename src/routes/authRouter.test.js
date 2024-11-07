/* eslint-env jest */

const jwt = require('jsonwebtoken');
const { authRouter } = require('./authRouter');
const { DB } = require('../database/database.js');

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../config.js', () => ({ jwtSecret: 'testSecret' }));
jest.mock('../database/database.js', () => ({
  DB: {
    isLoggedIn: jest.fn(),
    addUser: jest.fn(),
    getUser: jest.fn(),
    loginUser: jest.fn(),
    logoutUser: jest.fn(),
    updateUser: jest.fn(),
  },
  Role: {
    Admin: 'admin',
    Diner: 'diner',
  }
}));

describe('authRouter', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {}, headers: {} };
    res = {
      status: jest.fn(() => res),
      json: jest.fn(),
      send: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('POST /api/auth (register)', () => {
    it('should return 400 if name, email, or password is missing', async () => {
      const handler = authRouter.stack.find(r => r.route.path === '/' && r.route.methods.post).route.stack[0].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'name, email, and password are required' });
    });

    it('should register a user and return a token', async () => {
      req.body = { name: 'Test User', email: 'test@test.com', password: 'password' };
      const mockUser = { id: 1, name: 'Test User', email: 'test@test.com', roles: [{ role: 'diner' }] };
      const mockToken = 'testToken';
      DB.addUser.mockResolvedValue(mockUser);
      jwt.sign.mockReturnValue(mockToken);
      DB.loginUser.mockResolvedValue();

      const handler = authRouter.stack.find(r => r.route.path === '/' && r.route.methods.post).route.stack[0].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ user: mockUser, token: mockToken });
    });
  });

  describe('PUT /api/auth (login)', () => {
    it('should login an existing user and return a token', async () => {
      req.body = { email: 'test@test.com', password: 'password' };
      const mockUser = { id: 1, name: 'Test User', email: 'test@test.com', roles: [{ role: 'admin' }] };
      const mockToken = 'testToken';
      DB.getUser.mockResolvedValue(mockUser);
      jwt.sign.mockReturnValue(mockToken);
      DB.loginUser.mockResolvedValue();

      const handler = authRouter.stack.find(r => r.route.path === '/' && r.route.methods.put).route.stack[0].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ user: mockUser, token: mockToken });
    });
  });

  describe('DELETE /api/auth (logout)', () => {
    it('should log out a user with a valid token', async () => {
      req.user = { id: 1, roles: [{ role: 'admin' }] };
      DB.logoutUser.mockResolvedValue();

      const handler = authRouter.stack.find(r => r.route.path === '/' && r.route.methods.delete).route.stack[0].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ message: 'logout successful' });
    });
  });

  describe('PUT /api/auth/:userId (update user)', () => {
    it('should update user if authenticated and authorized', async () => {
      req.user = { id: 1, roles: [{ role: 'admin' }] };
      req.params = { userId: '1' };
      req.body = { email: 'newemail@test.com' };

      const updatedUser = { id: 1, email: 'newemail@test.com', roles: [{ role: 'admin' }] };
      DB.updateUser.mockResolvedValue(updatedUser);

      const handler = authRouter.stack.find(r => r.route.path === '/:userId' && r.route.methods.put).route.stack[0].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });
  });
});
