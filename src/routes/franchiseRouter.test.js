const request = require('supertest');
const app = require('../service');
const jwt = require('jsonwebtoken');
// const config = require('../config.js');
// const { Role, DB } = require('../database/database.js');

// function randomName() {
//   return Math.random().toString(36).substring(2, 12);
// }

// async function createAdminUser() {
//   let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
//   user.name = randomName();
//   user.email = user.name + '@admin.com';

//   user = await DB.addUser(user);
//   return { ...user, password: 'toomanysecrets' };
// }

// let adminToken;
// let franchiseeToken;

beforeEach(async () => {
  jest.restoreAllMocks(); // Restore mocks before each test to prevent test interference

  // Create an admin user and generate token
  // const adminUser = await createAdminUser();
  // adminToken = jwt.sign({ id: adminUser.id, roles: adminUser.roles }, config.jwtSecret);

  // // Create a franchisee user and generate token
  // const franchiseeUser = { name: randomName(), email: randomName() + '@diner.com', password: 'password', roles: [{ role: Role.Diner }] };
  // const createdFranchisee = await DB.addUser(franchiseeUser);
  // franchiseeToken = jwt.sign({ id: createdFranchisee.id, roles: createdFranchisee.roles }, config.jwtSecret);

  // Mock jwt.verify to always succeed and set req.user
  jest.spyOn(jwt, 'verify').mockImplementation((token, secret, callback) => {
    const decoded = jwt.decode(token);
    callback(null, { id: decoded.id, roles: decoded.roles });
  });
});

// Increase Jest timeout for debugging
if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

// Test for listing all franchises

test('GET /api/franchise - list all franchises', async () => {
  const res = await request(app).get('/api/franchise');
  expect(res.status).toBe(200);
});

