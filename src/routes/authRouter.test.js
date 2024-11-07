/* eslint-env jest */

const jwt = require('jsonwebtoken');
const { authRouter, setAuthUser } = require('./authRouter'); // Import setAuthUser
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

  // New tests for setAuthUser
  describe('setAuthUser', () => {
    const mockToken = 'testToken';
    const mockUser = { id: 1, roles: [{ role: 'admin' }] };

    beforeEach(() => {
      req = { headers: {} };
      res = {};
      next = jest.fn();
    });

    it('should call next if token is missing', async () => {
      await setAuthUser(req, res, next);
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should set req.user if token is present and valid', async () => {
      req.headers.authorization = `Bearer ${mockToken}`;
      DB.isLoggedIn.mockResolvedValue(true); // Simulate that the token is logged in
      jwt.verify.mockReturnValue(mockUser); // Simulate a valid token verification

      await setAuthUser(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(req.user.isRole('admin')).toBe(true); // Check role assignment
      expect(next).toHaveBeenCalled();
    });

    it('should leave req.user undefined if token verification fails', async () => {
        req.headers.authorization = `Bearer ${mockToken}`;
        DB.isLoggedIn.mockResolvedValue(false); // Simulate that the token is not logged in
      
        await setAuthUser(req, res, next);
      
        expect(req.user).toBeUndefined(); // Check for undefined instead of null
        expect(next).toHaveBeenCalled();
    });

    it('should set req.user to null if an error occurs in verification', async () => {
      req.headers.authorization = `Bearer ${mockToken}`;
      DB.isLoggedIn.mockRejectedValue(new Error('Database error')); // Simulate a DB error

      await setAuthUser(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });
  });

  // Existing route tests
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
