const request = require('supertest');
const app = require('../service');
const jwt = require('jsonwebtoken');
const config = require('../config.js');

const adminToken = jwt.sign({ id: 1, roles: [{ role: 'Admin' }] }, config.jwtSecret);
const franchiseeToken = jwt.sign({ id: 2, roles: [{ role: 'Diner' }] }, config.jwtSecret);

beforeEach(() => {
  jest.restoreAllMocks(); // Restore mocks before each test to prevent test interference

  // Mock jwt.verify to always succeed and set req.user
  jest.spyOn(jwt, 'verify').mockImplementation((token, secret, callback) => {
    const decoded = jwt.decode(token);
    callback(null, { id: decoded.id, roles: decoded.roles });
  });
});

// Test for listing all franchises

test('GET /api/franchise - list all franchises', async () => {
  const res = await request(app).get('/api/franchise');
  expect(res.status).toBe(200);
});

// Test for listing user-specific franchises

test('GET /api/franchise/:userId - list user-specific franchises', async () => {
  const userId = 2;
  const res = await request(app)
    .get(`/api/franchise/${userId}`)
    .set('Authorization', `Bearer ${franchiseeToken}`);
  expect(res.status).toBe(200);
});

// Test for creating a new franchise

test('POST /api/franchise - create a new franchise', async () => {
  const newFranchise = { name: 'pizzaPocket', admins: [{ email: 'f@jwt.com' }] };
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(newFranchise);
  expect(res.status).toBe(200);
});

// Test for creating a new franchise without admin privileges

test('POST /api/franchise - fail to create a new franchise without admin privileges', async () => {
  const newFranchise = { name: 'pizzaPocket', admins: [{ email: 'f@jwt.com' }] };
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${franchiseeToken}`)
    .send(newFranchise);
  expect(res.status).toBe(403);
});

// Test for deleting a franchise

test('DELETE /api/franchise/:franchiseId - delete a franchise', async () => {
  const franchiseId = 1;
  const res = await request(app)
    .delete(`/api/franchise/${franchiseId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
});

// Test for deleting a franchise without admin privileges

test('DELETE /api/franchise/:franchiseId - fail to delete a franchise without admin privileges', async () => {
  const franchiseId = 1;
  const res = await request(app)
    .delete(`/api/franchise/${franchiseId}`)
    .set('Authorization', `Bearer ${franchiseeToken}`);
  expect(res.status).toBe(403);
});
