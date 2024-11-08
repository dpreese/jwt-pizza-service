const request = require('supertest');
const app = require('../service');
const jwt = require('jsonwebtoken');
const config = require('../config.js');
const { DB, Role } = require('../database/database.js');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  
  expectValidJwt(testUserAuthToken);
});

afterEach(() => {
  jest.restoreAllMocks(); // Resets all mocks to avoid interference between tests
});

test('register a new user', async () => {
  const newUser = { name: 'new diner', email: Math.random().toString(36).substring(2, 12) + '@test.com', password: 'password' };
  const registerRes = await request(app).post('/api/auth').send(newUser);
  expect(registerRes.status).toBe(200);
  expectValidJwt(registerRes.body.token);
  expect(registerRes.body.user).toMatchObject({ name: 'new diner', email: newUser.email, roles: [{ role: Role.Diner }] });
});

test('register user with missing fields', async () => {
  const incompleteUser = { name: 'missing fields' }; // Missing email and password
  const registerRes = await request(app).post('/api/auth').send(incompleteUser);
  expect(registerRes.status).toBe(400);
  expect(registerRes.body.message).toBe('name, email, and password are required');
});

test('login existing user', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test('setAuthUser with valid token', async () => {
  const validToken = jwt.sign({ id: 1, roles: [{ role: Role.Diner }] }, config.jwtSecret);
  jest.spyOn(DB, 'isLoggedIn').mockResolvedValue(true);

  const res = await request(app)
    .put('/api/auth/1')
    .set('Authorization', `Bearer ${validToken}`)
    .send({ email: 'updated@test.com', password: 'newpassword' });

  expect(res.status).toBe(200);
  expect(res.body.id).toBe(1);
  expect(res.body.email).toBe('updated@test.com');
  expect(res.body.roles).toContainEqual({ role: Role.Diner });
});

test('setAuthUser with invalid token', async () => {
  const invalidToken = 'invalid.token.here'; //random invalid token string

  // Mock DB to simulate that the token is not logged in
  jest.spyOn(DB, 'isLoggedIn').mockResolvedValue(true);

  // Mock jwt.verify to throw an error, simulating an invalid token
  jest.spyOn(jwt, 'verify').mockImplementation(() => {
    throw new Error('Invalid token');
  });

  const res = await request(app)
    .put('/api/auth/1')
    .set('Authorization', `Bearer ${invalidToken}`)
    .send({ email: 'updated@test.com', password: 'newpassword' });

  expect(res.status).toBe(401);
  expect(res.body.message).toBe('unauthorized');
});


test('logout user', async () => {
  jest.spyOn(DB, 'logoutUser').mockResolvedValue(true);

  const res = await request(app)
    .delete('/api/auth')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body.message).toBe('logout successful');
});

test('update user with admin role', async () => {
  const adminToken = jwt.sign({ id: 1, roles: [{ role: Role.Admin }] }, config.jwtSecret);
  jest.spyOn(DB, 'isLoggedIn').mockResolvedValue(true);
  jest.spyOn(DB, 'updateUser').mockResolvedValue({ id: 1, name: 'admin user', email: 'admin@test.com', roles: [{ role: Role.Admin }] });

  const res = await request(app)
    .put('/api/auth/1')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: 'admin@test.com', password: 'adminpassword' });

  expect(res.status).toBe(200);
  expect(res.body.email).toBe('admin@test.com');
  expect(res.body.roles).toContainEqual({ role: Role.Admin });
});

// Test for unauthorized update attempt

test('update user without admin privileges', async () => {
  const nonAdminToken = jwt.sign({ id: 2, roles: [{ role: Role.Diner }] }, config.jwtSecret);
  jest.spyOn(DB, 'isLoggedIn').mockResolvedValue(true);

  const res = await request(app)
    .put('/api/auth/1') // Attempting to update a different user
    .set('Authorization', `Bearer ${nonAdminToken}`)
    .send({ email: 'unauthorized@test.com', password: 'newpassword' });

  expect(res.status).toBe(403);
  expect(res.body.message).toBe('unauthorized');
});

// Simple test for authenticateToken middleware without user
test('authenticateToken middleware without user', async () => {
  console.log('Running authenticateToken middleware without user test');
  
  // Mock setAuthUser to simulate missing req.user
  jest.spyOn(DB, 'isLoggedIn').mockResolvedValue(false); // Simulate that the user is not logged in

  const invalidToken = jwt.sign({ id: 99 }, config.jwtSecret); // Generate a token that should fail
  jest.spyOn(jwt, 'verify').mockImplementation(() => {
    console.log('Mocking jwt.verify to return an invalid user');
    return { id: 9999 }; // Mock user that does not exist in DB
  });

  const res = await request(app)
    .put('/api/auth/1')
    .set('Authorization', `Bearer ${invalidToken}`); // Provide an invalid token

  console.log('Response status:', res.status);
  console.log('Response body:', res.body);

  expect(res.status).toBe(401);
  expect(res.body.message).toBe('unauthorized');
});


function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}
