
const fetch = jest.fn();

jest.mock('node-fetch');

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

async function createDinerUser() {
  let user = { password: 'password', roles: [{ role: Role.Diner }] };
  user.name = randomName();
  user.email = user.name + '@diner.com';

  user = await DB.addUser(user);
  return { ...user, password: 'password' };
}

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

let adminToken;
let dinerToken;
let adminUser;
let dinerUser;

// Clean up the database before all tests
beforeAll(async () => {
  await executeQuery('DELETE FROM orderItem');
  await executeQuery('DELETE FROM dinerOrder');
  await executeQuery('DELETE FROM store');
  await executeQuery('DELETE FROM franchise');
  await executeQuery('DELETE FROM menu');
  await executeQuery('DELETE FROM userRole');
  await executeQuery('DELETE FROM user WHERE email LIKE \'%@admin.com\' OR email LIKE \'%@diner.com\'');
  await executeQuery('DELETE FROM auth');
});

beforeEach(async () => {
  // jest.restoreAllMocks();

  // Create an admin user and generate token
  adminUser = await createAdminUser();
  adminToken = jwt.sign({ id: adminUser.id, roles: adminUser.roles }, config.jwtSecret);
  await DB.loginUser(adminUser.id, adminToken); // Log in admin user

  // Create a diner user and generate token
  dinerUser = await createDinerUser();
  dinerToken = jwt.sign({ id: dinerUser.id, roles: dinerUser.roles }, config.jwtSecret);
  await DB.loginUser(dinerUser.id, dinerToken); // Log in diner user
});

afterEach(async () => {
  await executeQuery('DELETE FROM orderItem');
  await executeQuery('DELETE FROM dinerOrder');
  await executeQuery('DELETE FROM store');
  await executeQuery('DELETE FROM franchise');
  await executeQuery('DELETE FROM menu');
  await executeQuery('DELETE FROM userRole');
  await executeQuery('DELETE FROM user WHERE email LIKE \'%@admin.com\' OR email LIKE \'%@diner.com\'');
  await executeQuery('DELETE FROM auth');
  fetch.mockReset();
});

// Increase Jest timeout for debugging
if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

// Tests

test('GET /api/order/menu - retrieve menu items', async () => {
  // Add a menu item to the database
  const menuItem = await DB.addMenuItem({
    title: 'Veggie',
    description: 'A garden of delight',
    image: 'pizza1.png',
    price: 0.0038,
  });

  const res = await request(app).get('/api/order/menu');

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: menuItem.id,
        title: 'Veggie',
        description: 'A garden of delight',
        image: 'pizza1.png',
        price: 0.0038,
      }),
    ])
  );
});

test('PUT /api/order/menu - add a menu item as admin', async () => {
  const menuItemData = {
    title: 'Student',
    description: 'No topping, no sauce, just carbs',
    image: 'pizza9.png',
    price: 0.0001,
  };

  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(menuItemData);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);

  // Verify that the new item is in the menu
  expect(res.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: 'Student',
        description: 'No topping, no sauce, just carbs',
        image: 'pizza9.png',
        price: 0.0001,
      }),
    ])
  );

  // Verify that the menu item exists in the database
  const menu = await DB.getMenu();
  expect(menu).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: 'Student',
        description: 'No topping, no sauce, just carbs',
        image: 'pizza9.png',
        price: 0.0001,
      }),
    ])
  );
});

test('PUT /api/order/menu - add a menu item as non-admin', async () => {
  const menuItemData = {
    title: 'Unauthorized Pizza',
    description: 'Should not be added',
    image: 'pizza0.png',
    price: 0.0005,
  };

  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send(menuItemData);

  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({ message: 'unable to add menu item' });

  // Verify that the menu item does not exist in the database
  const menu = await DB.getMenu();
  expect(menu).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: 'Unauthorized Pizza',
      }),
    ])
  );
});

test('PUT /api/order/menu - add a menu item without authentication', async () => {
  const menuItemData = {
    title: 'No Auth Pizza',
    description: 'Should not be added',
    image: 'pizza0.png',
    price: 0.0005,
  };

  const res = await request(app).put('/api/order/menu').send(menuItemData);

  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ message: 'unauthorized' });
});

test('GET /api/order - retrieve orders as diner', async () => {
  // Create a franchise and store for the order
  const franchise = await DB.createFranchise({
    name: 'Test Franchise',
    admins: [],
  });
  const store = await DB.createStore(franchise.id, { name: 'Test Store' });

  // Add a menu item
  const menuItem = await DB.addMenuItem({
    title: 'Test Pizza',
    description: 'Delicious test pizza',
    image: 'pizza2.png',
    price: 0.005,
  });

  // Create an order for the diner
  const orderData = {
    franchiseId: franchise.id,
    storeId: store.id,
    items: [
      {
        menuId: menuItem.id,
        description: menuItem.title,
        price: menuItem.price,
      },
    ],
  };
  await DB.addDinerOrder(dinerUser, orderData);

  const res = await request(app)
    .get('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    dinerId: dinerUser.id,
    page: 1,
    orders: expect.any(Array),
  });
  expect(res.body.orders.length).toBeGreaterThan(0);
  expect(res.body.orders[0]).toMatchObject({
    franchiseId: franchise.id,
    storeId: store.id,
    items: expect.any(Array),
  });
});

test('GET /api/order - retrieve orders without authentication', async () => {
  const res = await request(app).get('/api/order');

  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ message: 'unauthorized' });
});

test('POST /api/order - create an order successfully', async () => {
  // Mock the external API call
  const mockResponse = {
    jwt: 'fake_jwt_token',
    reportUrl: 'http://example.com/report',
  };

  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => mockResponse,
  });

  // Create a franchise and store for the order
  const franchise = await DB.createFranchise({
    name: 'Test Franchise',
    admins: [],
  });
  const store = await DB.createStore(franchise.id, { name: 'Test Store' });

  // Add a menu item
  const menuItem = await DB.addMenuItem({
    title: 'Test Pizza',
    description: 'Delicious test pizza',
    image: 'pizza2.png',
    price: 0.005,
  });

  const orderData = {
    franchiseId: franchise.id,
    storeId: store.id,
    items: [
      {
        menuId: menuItem.id,
        description: menuItem.title,
        price: menuItem.price,
      },
    ],
  };

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send(orderData);

  expect(res.status).toBe(200);
//   expect(res.body).toMatchObject({
//     order: expect.objectContaining({
//       franchiseId: franchise.id,
//       storeId: store.id,
//       items: expect.any(Array),
//     }),
//     jwt: 'fake_jwt_token',
//     reportUrl: 'http://example.com/report',
//   });

  // Verify that the order exists in the database
  const orders = await DB.getOrders(dinerUser);
  expect(orders.orders.length).toBeGreaterThan(0);
  expect(orders.orders[0]).toMatchObject({
    franchiseId: franchise.id,
    storeId: store.id,
    items: expect.any(Array),
  });
});

// test('POST /api/order - external API call fails', async () => {
//     // Reset fetch mock
//     fetch.mockReset();
  
//     // Mock the external API call to fail
//     const mockResponse = {
//       message: 'Factory error',
//       reportUrl: 'http://example.com/report',
//     };
  
//     fetch.mockImplementationOnce(() => {
//       return Promise.resolve({
//         ok: false,
//         json: async () => mockResponse,
//       });
//     });
  
//     // Create a franchise and store for the order
//     const franchise = await DB.createFranchise({
//       name: 'Test Franchise',
//       admins: [],
//     });
//     const store = await DB.createStore(franchise.id, { name: 'Test Store' });
  
//     // Add a menu item
//     const menuItem = await DB.addMenuItem({
//       title: 'Test Pizza',
//       description: 'Delicious test pizza',
//       image: 'pizza2.png',
//       price: 0.005,
//     });
  
//     const orderData = {
//       franchiseId: franchise.id,
//       storeId: store.id,
//       items: [
//         {
//           menuId: menuItem.id,
//           description: menuItem.title,
//           price: menuItem.price,
//         },
//       ],
//     };
  
//     const res = await request(app)
//       .post('/api/order')
//       .set('Authorization', `Bearer ${dinerToken}`)
//       .send(orderData);
  
//     console.log('Response status:', res.status);
//     console.log('Response body:', res.body);
  
//     expect(fetch).toHaveBeenCalled();
//     expect(res.status).toBe(500);
//     expect(res.body).toMatchObject({
//       message: 'Failed to fulfill order at factory',
//       reportUrl: 'http://example.com/report',
//     });
//   });


test('POST /api/order - create an order without authentication', async () => {
  const res = await request(app).post('/api/order').send({});

  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ message: 'unauthorized' });
});

test('POST /api/order - create an order with invalid menu item ID', async () => {
  // Mock the external API call
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ jwt: 'fake_jwt_token', reportUrl: 'http://example.com/report' }),
  });

  // Create a franchise and store for the order
  const franchise = await DB.createFranchise({
    name: 'Test Franchise',
    admins: [],
  });
  const store = await DB.createStore(franchise.id, { name: 'Test Store' });

  const orderData = {
    franchiseId: franchise.id,
    storeId: store.id,
    items: [
      {
        menuId: 9999, // Invalid menu ID
        description: 'Invalid Pizza',
        price: 0.005,
      },
    ],
  };

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send(orderData);

  expect(res.status).toBe(500);
  expect(res.body).toMatchObject({ message: 'No ID found' });
});

test('POST /api/order - create an order with missing fields', async () => {
  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({}); // Missing order data

  expect(res.status).toBe(500);
  expect(res.body).toMatchObject({ message: expect.any(String) });
});
