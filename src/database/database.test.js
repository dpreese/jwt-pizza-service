// database.test.js

const { DB } = require('../database/database'); // Import the instance
const { Role } = require('../model/model');
const { StatusCodeError } = require('../endpointHelper');
const config = require('../config');

// Access the DB class from the instance
const DBClass = DB.constructor;

let db;

beforeAll(async () => {
  // Set NODE_ENV to 'test' to use test database configuration
  process.env.NODE_ENV = 'test';

  // Initialize a new database instance for testing
  db = new DBClass();
  await db.initialized;
});

beforeEach(async () => {
  // Clean up the database before each test
  await cleanUpDatabase();
});

afterEach(async () => {
  // Optionally clean up after each test
  await cleanUpDatabase();
});

afterAll(async () => {
  // Close database connections if necessary
  // This is optional as connections are closed after each test
});

async function cleanUpDatabase() {
  const connection = await db._getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE orderItem');
    await connection.query('TRUNCATE TABLE dinerOrder');
    await connection.query('TRUNCATE TABLE store');
    await connection.query('TRUNCATE TABLE franchise');
    await connection.query('TRUNCATE TABLE menu');
    await connection.query('TRUNCATE TABLE userRole');
    await connection.query('TRUNCATE TABLE user');
    await connection.query('TRUNCATE TABLE auth');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await connection.end();
  }
}

describe('DB.addUser with Franchisee role', () => {
    test('should add a user with Franchisee role linked to an existing franchise', async () => {
      // Step 1: Create a franchise
      const franchise = {
        name: 'Test Franchise',
        admins: [],
      };
      const addedFranchise = await db.createFranchise(franchise);
  
      // Step 2: Add a user with Franchisee role linked to the existing franchise
      const user = {
        name: 'Franchisee User',
        email: 'franchiseeuser@example.com',
        password: 'password123',
        roles: [{ role: Role.Franchisee, object: addedFranchise.name }],
      };
  
      const addedUser = await db.addUser(user);
  
      // Step 3: Verify that user is added correctly
      expect(addedUser).toMatchObject({
        name: user.name,
        email: user.email,
        roles: user.roles,
        id: expect.any(Number),
        password: undefined,
      });
  
      // Step 4: Verify that userRole entry exists with the correct objectId (franchiseId)
      const connection = await db.getConnection();
      try {
        const userRoles = await db.query(
          connection,
          `SELECT * FROM userRole WHERE userId=? AND role=?`,
          [addedUser.id, Role.Franchisee]
        );
  
        expect(userRoles.length).toBeGreaterThan(0);
        expect(userRoles[0]).toMatchObject({
          userId: addedUser.id,
          role: Role.Franchisee,
          objectId: addedFranchise.id,
        });
      } finally {
        connection.end();
      }
    });
  });
  

describe('DB.addUser and DB.getUser', () => {
  test('should add and retrieve a user', async () => {
    const user = {
      name: 'Test User',
      email: 'testuser@example.com',
      password: 'password123',
      roles: [{ role: Role.Diner }],
    };

    // Add user
    const addedUser = await db.addUser(user);
    expect(addedUser).toMatchObject({
      name: user.name,
      email: user.email,
      roles: user.roles,
    });
    expect(addedUser.id).toBeDefined();
    expect(addedUser.password).toBeUndefined();

    // Retrieve user
    const retrievedUser = await db.getUser(user.email, user.password);
    expect(retrievedUser).toMatchObject({
      id: addedUser.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      password: undefined,
    });
  });

  test('should throw an error if the user does not exist', async () => {
    await expect(db.getUser('nonexistent@example.com', 'password')).rejects.toThrow(
      new StatusCodeError('unknown user', 404)
    );
  });

  test('should throw an error if the password is incorrect', async () => {
    const user = {
      name: 'Test User',
      email: 'testuser@example.com',
      password: 'password123',
      roles: [{ role: Role.Diner }],
    };

    // Add user
    await db.addUser(user);

    // Attempt to retrieve user with incorrect password
    await expect(db.getUser(user.email, 'wrongpassword')).rejects.toThrow(
      new StatusCodeError('unknown user', 404)
    );
  });
});

describe('DB.addMenuItem and DB.getMenu', () => {
  test('should add a menu item and retrieve the menu', async () => {
    const menuItem = {
      title: 'Test Pizza',
      description: 'Delicious test pizza',
      image: 'pizza.png',
      price: 9.99,
    };

    // Add menu item
    const addedItem = await db.addMenuItem(menuItem);
    expect(addedItem).toMatchObject({
      ...menuItem,
      id: expect.any(Number),
    });

    // Retrieve menu
    const menu = await db.getMenu();
    expect(menu).toContainEqual(addedItem);
  });
});

describe('DB.createFranchise, DB.createStore, DB.addDinerOrder, and DB.getOrders', () => {
  test('should create a franchise, store, add an order, and retrieve it', async () => {
    // Add user
    const user = {
      name: 'Test User',
      email: 'testuser@example.com',
      password: 'password123',
      roles: [{ role: Role.Diner }],
    };
    const addedUser = await db.addUser(user);

    // Create franchise
    const franchise = {
      name: 'Test Franchise',
      admins: [],
    };
    const addedFranchise = await db.createFranchise(franchise);

    // Create store
    const store = {
      name: 'Test Store',
    };
    const addedStore = await db.createStore(addedFranchise.id, store);

    // Add menu item
    const menuItem = {
      title: 'Test Pizza',
      description: 'Delicious test pizza',
      image: 'pizza.png',
      price: 9.99,
    };
    const addedMenuItem = await db.addMenuItem(menuItem);

    // Add order
    const orderData = {
      franchiseId: addedFranchise.id,
      storeId: addedStore.id,
      items: [
        {
          menuId: addedMenuItem.id,
          description: addedMenuItem.title,
          price: addedMenuItem.price,
        },
      ],
    };
    const addedOrder = await db.addDinerOrder(addedUser, orderData);
    expect(addedOrder).toMatchObject({
      ...orderData,
      id: expect.any(Number),
    });

    // Retrieve orders
    const orders = await db.getOrders(addedUser);
    expect(orders.orders).toContainEqual(
      expect.objectContaining({
        id: addedOrder.id,
        franchiseId: orderData.franchiseId,
        storeId: orderData.storeId,
        items: expect.arrayContaining([
          expect.objectContaining({
            menuId: addedMenuItem.id,
            description: addedMenuItem.title,
            price: addedMenuItem.price,
          }),
        ]),
      })
    );
  });
});

describe('DB.deleteFranchise', () => {
  test('should delete a franchise and associated data', async () => {
    // Create a franchise
    const franchise = {
      name: 'Test Franchise',
      admins: [],
    };
    const addedFranchise = await db.createFranchise(franchise);

    // Create a store under the franchise
    // const store = {
    //   name: 'Test Store',
    // };
    // const addedStore = await db.createStore(addedFranchise.id, store);

    // Verify that the franchise and store exist
    let franchises = await db.getFranchises();
    expect(franchises).toContainEqual(
      expect.objectContaining({ id: addedFranchise.id, name: franchise.name })
    );

    // Delete the franchise
    await db.deleteFranchise(addedFranchise.id);

    // Verify that the franchise and store are deleted
    franchises = await db.getFranchises();
    expect(franchises).not.toContainEqual(
      expect.objectContaining({ id: addedFranchise.id })
    );
  });

  test('should handle deletion of a non-existent franchise gracefully', async () => {
    // Attempt to delete a non-existent franchise
    await expect(db.deleteFranchise(9999)).resolves.toBeUndefined();
  });

  test('should rollback transaction if error occurs during deletion', async () => {
    // Create a franchise
    const franchise = {
      name: 'Franchise to Delete with Error',
      admins: [],
    };
    const addedFranchise = await db.createFranchise(franchise);

    // Create a store under the franchise
    // const store = {
    //   name: 'Store to Delete with Error',
    // };
    // const addedStore = await db.createStore(addedFranchise.id, store);

    // Mock the query method to throw an error during deletion
    const originalQuery = db.query.bind(db);
    db.query = jest.fn(async (connection, sql, params) => {
      if (sql.includes('DELETE FROM store')) {
        throw new Error('Simulated deletion error');
      }
      return originalQuery(connection, sql, params);
    });

    // Attempt to delete the franchise and expect an error
    await expect(db.deleteFranchise(addedFranchise.id)).rejects.toThrow('unable to delete franchise');

    // Restore the original query method
    db.query = originalQuery;

    // Verify that the franchise and store still exist (rollback occurred)
    const franchises = await db.getFranchises();
    expect(franchises).toContainEqual(
      expect.objectContaining({ id: addedFranchise.id, name: franchise.name })
    );
  });
});

describe('DB.loginUser and DB.isLoggedIn', () => {
  test('should login a user and check if logged in', async () => {
    // Add user
    const user = {
      name: 'Test User',
      email: 'testuser@example.com',
      password: 'password123',
      roles: [{ role: Role.Diner }],
    };
    const addedUser = await db.addUser(user);

    const token = 'jwt.token.here';

    // Login user
    await db.loginUser(addedUser.id, token);

    // Check if user is logged in
    const isLoggedIn = await db.isLoggedIn(token);
    expect(isLoggedIn).toBe(true);
  });

  test('should return false if user is not logged in', async () => {
    const token = 'jwt.token.here';

    // Check if user is logged in
    const isLoggedIn = await db.isLoggedIn(token);
    expect(isLoggedIn).toBe(false);
  });
});

describe('DB.logoutUser', () => {
  test('should logout a user', async () => {
    // Add user
    const user = {
      name: 'Test User',
      email: 'testuser@example.com',
      password: 'password123',
      roles: [{ role: Role.Diner }],
    };
    const addedUser = await db.addUser(user);

    const token = 'jwt.token.here';

    // Login user
    await db.loginUser(addedUser.id, token);

    // Logout user
    await db.logoutUser(token);

    // Check if user is logged in
    const isLoggedIn = await db.isLoggedIn(token);
    expect(isLoggedIn).toBe(false);
  });
});

describe('DB.updateUser', () => {
  test('should update a user\'s email and password', async () => {
    // Add user
    const user = {
      name: 'Test User',
      email: 'oldemail@example.com',
      password: 'oldpassword',
      roles: [{ role: Role.Diner }],
    };
    const addedUser = await db.addUser(user);

    // Update user
    const updatedEmail = 'newemail@example.com';
    const updatedPassword = 'newpassword';
    const updatedUser = await db.updateUser(addedUser.id, updatedEmail, updatedPassword);

    expect(updatedUser).toMatchObject({
      id: addedUser.id,
      name: user.name,
      email: updatedEmail,
      roles: user.roles,
      password: undefined,
    });

    // Verify that old credentials no longer work
    await expect(db.getUser(user.email, user.password)).rejects.toThrow(
      new StatusCodeError('unknown user', 404)
    );

    // Verify that new credentials work
    const retrievedUser = await db.getUser(updatedEmail, updatedPassword);
    expect(retrievedUser).toMatchObject({
      id: addedUser.id,
      name: user.name,
      email: updatedEmail,
      roles: user.roles,
      password: undefined,
    });
  });

//   test('should throw an error if no fields are provided to updateUser', async () => {
//     // Add user
//     const user = {
//       name: 'Test User',
//       email: 'nochange@example.com',
//       password: 'password123',
//       roles: [{ role: Role.Diner }],
//     };
//     const addedUser = await db.addUser(user);
  
//     // Attempt to update without providing email or password
//     await expect(db.updateUser(addedUser.id)).rejects.toThrow('unknown user');
//   });
});

describe('DB.getUserFranchises', () => {
  test('should retrieve franchises associated with a user', async () => {
    // Add admin user
    const adminUser = {
      name: 'Franchise Admin',
      email: 'franchiseadmin@example.com',
      password: 'password123',
      roles: [{ role: Role.Admin }],
    };
    const addedAdmin = await db.addUser(adminUser);

    // Create franchise without admins
    const franchise = {
      name: 'Test Franchise',
      admins: [],
    };
    const addedFranchise = await db.createFranchise(franchise);

    // Assign user as Franchisee to the franchise
    await db.query(
      await db.getConnection(),
      `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`,
      [addedAdmin.id, Role.Franchisee, addedFranchise.id]
    );

    // Retrieve user franchises
    const franchises = await db.getUserFranchises(addedAdmin.id);
    expect(franchises).toContainEqual(
      expect.objectContaining({ id: addedFranchise.id, name: addedFranchise.name })
    );
  });

  test('should throw an error when adding a user with a non-existent franchise', async () => {
    const user = {
      name: 'Test Franchisee',
      email: 'testfranchisee@example.com',
      password: 'password123',
      roles: [{ role: Role.Franchisee, object: 'Nonexistent Franchise' }],
    };

    // Attempt to add user with a non-existent franchise
    await expect(db.addUser(user)).rejects.toThrow('No ID found');
  });
});
 
describe('DB.createFranchise with admins', () => {
    test('should create a franchise and assign existing admins', async () => {
      // Step 1: Create admin users
      const adminUser = {
        name: 'Admin User',
        email: 'adminuser@example.com',
        password: 'adminpassword',
        roles: [{ role: Role.Admin }],
      };
      const addedAdmin = await db.addUser(adminUser);
  
      // Step 2: Create franchise with the existing admin
      const franchise = {
        name: 'Franchise with Admins',
        admins: [{ email: adminUser.email }],
      };
      const addedFranchise = await db.createFranchise(franchise);
  
      // Step 3: Verify that the franchise was created with the admins assigned
      expect(addedFranchise).toMatchObject({
        name: franchise.name,
        id: expect.any(Number),
        admins: [
          {
            email: adminUser.email,
            id: addedAdmin.id,
            name: adminUser.name,
          },
        ],
      });
  
      // Step 4: Verify that userRole entries were created
      const connection = await db.getConnection();
      try {
        const userRoles = await db.query(
          connection,
          `SELECT * FROM userRole WHERE userId=? AND role=? AND objectId=?`,
          [addedAdmin.id, Role.Franchisee, addedFranchise.id]
        );
  
        expect(userRoles.length).toBe(1);
        expect(userRoles[0]).toMatchObject({
          userId: addedAdmin.id,
          role: Role.Franchisee,
          objectId: addedFranchise.id,
        });
      } finally {
        connection.end();
      }
    });

    test('should throw an error when an admin does not exist', async () => {
        // Define a franchise with a non-existent admin email
        const franchise = {
          name: 'Franchise with Non-existent Admin',
          admins: [{ email: 'nonexistentadmin@example.com' }],
        };
    
        // Attempt to create the franchise and expect an error
        await expect(db.createFranchise(franchise)).rejects.toThrow(
          new StatusCodeError(`unknown user for franchise admin nonexistentadmin@example.com provided`, 404)
        );
    
        // Verify that the franchise was not created
        const franchises = await db.getFranchises();
        expect(franchises).not.toContainEqual(
          expect.objectContaining({ name: franchise.name })
        );
    });
});

describe('DB.getFranchises with Admin authUser', () => {
    test('should retrieve franchises with details for admin users', async () => {
      // Step 1: Create an admin user
      const adminUser = {
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'adminpassword',
        roles: [{ role: Role.Admin }],
      };
      await db.addUser(adminUser);
  
      // Step 2: Retrieve the admin user (simulate login)
      const authUser = await db.getUser(adminUser.email, adminUser.password);
  
      // Step 3: Add isRole method to authUser
      authUser.isRole = function (role) {
        return this.roles.some((r) => r.role === role);
      };
  
      // Step 4: Create a franchise
      const franchise = {
        name: 'Test Franchise',
        admins: [],
      };
      await db.createFranchise(franchise);
  
      // Step 5: Call getFranchises with authUser
      const franchises = await db.getFranchises(authUser);
  
      // Step 6: Verify that franchises have detailed info
      expect(franchises).toBeInstanceOf(Array);
      expect(franchises.length).toBeGreaterThan(0);
  
      const testFranchise = franchises.find((f) => f.name === franchise.name);
      expect(testFranchise).toBeDefined();
      // Since getFranchise(franchise) adds 'admins' and 'stores', we check for those
      expect(testFranchise).toHaveProperty('admins');
      expect(testFranchise).toHaveProperty('stores');
    });
  });
  
  describe('DB.getUserFranchises with user having no franchises', () => {
    test('should return empty array when user has no franchises', async () => {
      // Step 1: Add user without Franchisee role
      const user = {
        name: 'Regular User',
        email: 'regularuser@example.com',
        password: 'password123',
        roles: [{ role: Role.Diner }], // Role is Diner, not Franchisee
      };
      const addedUser = await db.addUser(user);
  
      // Step 2: Call getUserFranchises with the user's ID
      const franchises = await db.getUserFranchises(addedUser.id);
  
      // Step 3: Verify that it returns an empty array
      expect(franchises).toEqual([]);
    });
  });

  describe('DB.deleteStore', () => {
    test('should delete a store from the database', async () => {
      // Step 1: Create a franchise
      const franchise = {
        name: 'Franchise for Store Deletion',
        admins: [],
      };
      const addedFranchise = await db.createFranchise(franchise);
  
      // Step 2: Create a store under the franchise
      const store = {
        name: 'Store to Delete',
      };
      const addedStore = await db.createStore(addedFranchise.id, store);
  
      // Verify that the store exists
      let stores = await db.query(
        await db.getConnection(),
        `SELECT id, name FROM store WHERE franchiseId=?`,
        [addedFranchise.id]
      );
      expect(stores).toContainEqual(
        expect.objectContaining({ id: addedStore.id, name: addedStore.name })
      );
  
      // Step 3: Delete the store
      await db.deleteStore(addedFranchise.id, addedStore.id);
  
      // Step 4: Verify that the store is deleted
      stores = await db.query(
        await db.getConnection(),
        `SELECT id, name FROM store WHERE franchiseId=?`,
        [addedFranchise.id]
      );
      expect(stores).not.toContainEqual(
        expect.objectContaining({ id: addedStore.id })
      );
    });
  });

  describe('DB.getTokenSignature', () => {
    test('should return an empty string when token has fewer than three parts', () => {
      // Tokens with fewer than three parts
      const tokens = [
        '',            // Empty string
        'abc',         // No dots
        'abc.def',     // One dot, two parts
        'abc.def.ghi.jkl', // More than three parts
      ];
  
      const expectedResults = ['', '', '', 'ghi'];
  
      tokens.forEach((token, index) => {
        const signature = db.getTokenSignature(token);
        expect(signature).toBe(expectedResults[index]);
      });
    });
  
    test('should return the signature when token has exactly three parts', () => {
      const token = 'header.payload.signature';
      const signature = db.getTokenSignature(token);
      expect(signature).toBe('signature');
    });
  });
  
  describe('DB.initializeDatabase', () => {
    test('should create the database when it does not exist', async () => {
      // Step 1: Drop the test database if it exists
      const connection = await db._getConnection(false); // Get connection without specifying a database
      try {
        await connection.query(`DROP DATABASE IF EXISTS ${config.db.connection.database}`);
      } finally {
        await connection.end();
      }
  
      // Step 2: Spy on console.log
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  
      // Step 3: Call initializeDatabase
      await db.initializeDatabase();
  
      // Step 4: Verify that 'Successfully created database' was logged
      expect(consoleSpy).toHaveBeenCalledWith('Successfully created database');
  
      // Step 5: Restore console.log
      consoleSpy.mockRestore();
    });
  });
  
  describe('DB.initializeDatabase error handling', () => {
    test('should log an error when database initialization fails', async () => {
      // Step 1: Backup the original database configuration
      const originalConfig = { ...config.db.connection };
  
      // Step 2: Modify the database configuration to simulate an error
      config.db.connection.host = 'invalid_host';
  
      // Step 3: Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  
      // Step 4: Call initializeDatabase
      await db.initializeDatabase();
  
      // Step 5: Verify that console.error was called
      expect(consoleErrorSpy).toHaveBeenCalled();
  
      // Optionally, check that the error message includes 'Error initializing database'
      const errorMessage = consoleErrorSpy.mock.calls[0][0];
      expect(errorMessage).toContain('Error initializing database');
  
      // Step 6: Restore the original configuration and console.error
      config.db.connection = originalConfig;
      consoleErrorSpy.mockRestore();
    });
  });
  