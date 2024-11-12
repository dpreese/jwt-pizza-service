const request = require('supertest');
const app = require('../service');
const jwt = require('jsonwebtoken');
const config = require('../config.js');
const { Role, DB } = require('../database/database.js');

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + '@admin.com';

  user = await DB.addUser(user);
  return { ...user, password: 'toomanysecrets' };
}

let adminToken;
let franchiseeToken;
let createdFranchisee;

// Helper function to execute queries
async function executeQuery(sql, params = []) {
  const connection = await DB.getConnection();
  try {
    const [results] = await connection.execute(sql, params);
    return results;
  } finally {
    connection.end();
  }
}

// Clean up the database before all tests
beforeAll(async () => {
  await executeQuery('DELETE FROM orderItem');
  await executeQuery('DELETE FROM dinerOrder');
  await executeQuery('DELETE FROM store');
  await executeQuery('DELETE FROM franchise');
  await executeQuery('DELETE FROM userRole');
  await executeQuery('DELETE FROM user WHERE email LIKE \'%@admin.com\' OR email LIKE \'%@diner.com\'');
  await executeQuery('DELETE FROM auth');
});

beforeEach(async () => {
  jest.restoreAllMocks();

  // Create an admin user and generate token
  const adminUser = await createAdminUser();
  adminToken = jwt.sign({ id: adminUser.id, roles: adminUser.roles }, config.jwtSecret);
  await DB.loginUser(adminUser.id, adminToken); // Log in admin user

  // Create a franchisee user and generate token
  const franchiseeUser = {
    name: randomName(),
    email: randomName() + '@diner.com',
    password: 'password',
    roles: [{ role: Role.Diner }],
  };
  createdFranchisee = await DB.addUser(franchiseeUser);
  franchiseeToken = jwt.sign({ id: createdFranchisee.id, roles: createdFranchisee.roles }, config.jwtSecret);
  await DB.loginUser(createdFranchisee.id, franchiseeToken); // Log in franchisee user
});

// Clean up the database after each test
afterEach(async () => {
  await executeQuery('DELETE FROM orderItem');
  await executeQuery('DELETE FROM dinerOrder');
  await executeQuery('DELETE FROM store');
  await executeQuery('DELETE FROM franchise');
  await executeQuery('DELETE FROM userRole');
  await executeQuery('DELETE FROM user WHERE email LIKE \'%@admin.com\' OR email LIKE \'%@diner.com\'');
  await executeQuery('DELETE FROM auth');
});

// Increase Jest timeout for debugging
if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

// Test for listing all franchises
test('GET /api/franchise - list all franchises', async () => {
  // First, create some franchises in the database
  const franchise1 = await DB.createFranchise({ name: 'Franchise One', admins: [] });
  const franchise2 = await DB.createFranchise({ name: 'Franchise Two', admins: [] });

  const res = await request(app).get('/api/franchise');

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  
  // Since we did not set an auth user, the franchises will not include 'admins' and 'stores' data.
  expect(res.body.length).toBeGreaterThanOrEqual(2);
  expect(res.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: franchise1.id, name: 'Franchise One' }),
      expect.objectContaining({ id: franchise2.id, name: 'Franchise Two' }),
    ])
  );
});

test('GET /api/franchise/:userId - list user franchises as the user', async () => {
  // Create a franchise and assign it to the franchisee user
  const franchise = await DB.createFranchise({
    name: 'User Franchise',
    admins: [{ email: createdFranchisee.email }],
  });

  const res = await request(app)
    .get(`/api/franchise/${createdFranchisee.id}`)
    .set('Authorization', `Bearer ${franchiseeToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);

  // The response should include the franchise with 'admins' and 'stores' data
  expect(res.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: franchise.id,
        name: 'User Franchise',
        admins: expect.arrayContaining([
          expect.objectContaining({ id: createdFranchisee.id, email: createdFranchisee.email }),
        ]),
        stores: expect.any(Array), // Might be empty
      }),
    ])
  );
});

test('GET /api/franchise/:userId - list user franchises as admin', async () => {
  // Create a franchise and assign it to the franchisee user
  const franchise = await DB.createFranchise({
    name: 'User Franchise',
    admins: [{ email: createdFranchisee.email }],
  });

  const res = await request(app)
    .get(`/api/franchise/${createdFranchisee.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);

  expect(res.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: franchise.id,
        name: 'User Franchise',
        admins: expect.arrayContaining([
          expect.objectContaining({ id: createdFranchisee.id, email: createdFranchisee.email }),
        ]),
        stores: expect.any(Array),
      }),
    ])
  );
});

// test('POST /api/franchise - create a new franchise as admin', async () => {
//   const franchiseData = {
//     name: 'New Franchise',
//     admins: [{ email: createdFranchisee.email }],
//   };

//   const res = await request(app)
//     .post('/api/franchise')
//     .set('Authorization', `Bearer ${adminToken}`)
//     .send(franchiseData);

//   expect(res.status).toBe(200);
//   expect(res.body).toEqual(
//     expect.objectContaining({
//       id: expect.any(Number),
//       name: 'New Franchise',
//       admins: expect.arrayContaining([
//         expect.objectContaining({
//           id: createdFranchisee.id,
//           name: createdFranchisee.name,
//           email: createdFranchisee.email,
//         }),
//       ]),
//     })
//   );

  // Verify that the franchise exists in the database
//   const franchises = await DB.getFranchises();
//   expect(franchises).toEqual(
//     expect.arrayContaining([
//       expect.objectContaining({ name: 'New Franchise' }),
//     ])
//   );
// });

test('POST /api/franchise - create a new franchise as non-admin', async () => {
  const franchiseData = {
    name: 'Unauthorized Franchise',
    admins: [{ email: createdFranchisee.email }],
  };

  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${franchiseeToken}`) // Non-admin user
    .send(franchiseData);

  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({ message: 'unable to create a franchise' });
  // Alternatively, check the message directly
  // expect(res.body.message).toBe('unable to create a franchise');
});

test('DELETE /api/franchise/:franchiseId - delete a franchise as admin', async () => {
  // First, create a franchise to delete
  const franchise = await DB.createFranchise({
    name: 'Franchise To Delete',
    admins: [],
  });

  const res = await request(app)
    .delete(`/api/franchise/${franchise.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'franchise deleted' });

  // Verify that the franchise no longer exists in the database
  const franchises = await DB.getFranchises();
  expect(franchises).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: franchise.id }),
    ])
  );
});

test('DELETE /api/franchise/:franchiseId - delete a franchise as non-admin', async () => {
  // First, create a franchise to attempt to delete
  const franchise = await DB.createFranchise({
    name: 'Franchise Not Deletable',
    admins: [],
  });

  const res = await request(app)
    .delete(`/api/franchise/${franchise.id}`)
    .set('Authorization', `Bearer ${franchiseeToken}`) // Non-admin user

  expect(res.status).toBe(403);
  
  // Use toMatchObject or check the message directly to handle any additional properties like 'stack'
  expect(res.body).toMatchObject({ message: 'unable to delete a franchise' });
  // Alternatively:
  // expect(res.body.message).toBe('unable to delete a franchise');
});