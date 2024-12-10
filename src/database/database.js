const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const config = require('../config.js');
const { StatusCodeError } = require('../endpointHelper.js');
const { Role } = require('../model/model.js');
const dbModel = require('./dbModel.js');
const logger = require('../logger.js'); // Add logger import
// const { stack } = require('../service.js');

class DB {
  constructor() {
    this.initialized = this.initializeDatabase();
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
    // Close any other connections if necessary
  }

  async getMenu() {
    const connection = await this.getConnection();
    try {
      const rows = await this.query(connection, `SELECT * FROM menu`);
      logger.logDbQuery('SELECT * FROM menu');
      return rows;
    } finally {
      connection.end();
    }
  }

  async addMenuItem(item) {
    const connection = await this.getConnection();
    try {
      const addResult = await this.query(connection, `INSERT INTO menu (title, description, image, price) VALUES (?, ?, ?, ?)`, [item.title, item.description, item.image, item.price]);
      logger.logDbQuery('INSERT INTO menu (title, description, image, price) VALUES (?, ?, ?, ?)');
      return { ...item, id: addResult.insertId };
    } finally {
      connection.end();
    }
  }

  async addUser(user) {
    const connection = await this.getConnection();
    try {
      const hashedPassword = await bcrypt.hash(user.password, 10);

      const userResult = await this.query(connection, `INSERT INTO user (name, email, password) VALUES (?, ?, ?)`, [user.name, user.email, hashedPassword]);
      logger.logDbQuery('INSERT INTO user (name, email, password) VALUES (?, ?, ?)');

      const userId = userResult.insertId;
      for (const role of user.roles) {
        switch (role.role) {
          case Role.Franchisee: {
            const franchiseId = await this.getID(connection, 'name', role.object, 'franchise');
            await this.query(connection, `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`, [userId, role.role, franchiseId]);
            logger.logDbQuery('INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)');
            break;
          }
          default: {
            await this.query(connection, `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`, [userId, role.role, 0]);
            logger.logDbQuery('INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)');
            break;
          }
        }
      }
      return { ...user, id: userId, password: undefined };
    } finally {
      connection.end();
    }
  }

  async getUser(email, password) {
    const connection = await this.getConnection();
    try {
      const userResult = await this.query(connection, `SELECT * FROM user WHERE email=?`, [email]);
      logger.logDbQuery('SELECT * FROM user WHERE email=?');
      const user = userResult[0];
      if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new StatusCodeError('unknown user', 404);
      }

      const roleResult = await this.query(connection, `SELECT * FROM userRole WHERE userId=?`, [user.id]);
      logger.logDbQuery('SELECT * FROM userRole WHERE userId=?');
      const roles = roleResult.map((r) => {
        return { objectId: r.objectId || undefined, role: r.role };
      });

      return { ...user, roles: roles, password: undefined };
    } finally {
      connection.end();
    }
  }

  async updateUser(userId, email, password) {
    const connection = await this.getConnection();
    try {
      // const params = [];
      let updateSql = 'UPDATE user SET ';
      const updates = [];
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        updates.push(`password='${hashedPassword}'`);
      }
      if (email) {
        updates.push(`email='${email}'`);
      }
      if (updates.length > 0) {
        updateSql += updates.join(', ') + ` WHERE id=${userId}`;
        await this.query(connection, updateSql);
        logger.logDbQuery('UPDATE user SET ... WHERE id=?');
      }
      return this.getUser(email, password);
    } finally {
      connection.end();
    }
  }

  async loginUser(userId, token) {
    const connection = await this.getConnection();
    try {
      await this.query(connection, `INSERT INTO auth (token, userId) VALUES (?, ?)`, [token, userId]);
      logger.logDbQuery('INSERT INTO auth (token, userId) VALUES (?, ?)');
    } finally {
      connection.end();
    }
  }

  async isLoggedIn(token) {
    const connection = await this.getConnection();
    try {
      const authResult = await this.query(connection, `SELECT userId FROM auth WHERE token=?`, [token]);
      logger.logDbQuery('SELECT userId FROM auth WHERE token=?');
      return authResult.length > 0;
    } finally {
      connection.end();
    }
  }

  async logoutUser(token) {
    const connection = await this.getConnection();
    try {
      logger.logDbQuery('DELETE FROM auth WHERE token=?');
      await this.query(connection, `DELETE FROM auth WHERE token=?`, [token]);
    } finally {
      connection.end();
    }
  }

  async getOrders(user, page = 1) {
    const connection = await this.getConnection();
    try {
      const offset = this.getOffset(page, config.db.listPerPage);
      const orders = await this.query(connection, `SELECT id, franchiseId, storeId, date FROM dinerOrder WHERE dinerId=? LIMIT ${offset},${config.db.listPerPage}`, [user.id]);
      logger.logDbQuery('SELECT id, franchiseId, storeId, date FROM dinerOrder WHERE dinerId=? LIMIT offset,listPerPage');
      for (const order of orders) {
        let items = await this.query(connection, `SELECT id, menuId, description, price FROM orderItem WHERE orderId=?`, [order.id]);
        logger.logDbQuery('SELECT id, menuId, description, price FROM orderItem WHERE orderId=?');
        order.items = items;
      }
      return { dinerId: user.id, orders: orders, page };
    } finally {
      connection.end();
    }
  }

  async addDinerOrder(user, order) {
    const connection = await this.getConnection();
    try {
      const orderResult = await this.query(connection, `INSERT INTO dinerOrder (dinerId, franchiseId, storeId, date) VALUES (?, ?, ?, now())`, [user.id, order.franchiseId, order.storeId]);
      logger.logDbQuery('INSERT INTO dinerOrder (dinerId, franchiseId, storeId, date) VALUES (?, ?, ?, now())');
      const orderId = orderResult.insertId;
      for (const item of order.items) {
        const menuId = await this.getID(connection, 'id', item.menuId, 'menu');
        await this.query(connection, `INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?, ?, ?, ?)`, [orderId, menuId, item.description, item.price]);
        logger.logDbQuery('INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?, ?, ?, ?)');
      }
      return { ...order, id: orderId };
    } finally {
      connection.end();
    }
  }

  async createFranchise(franchise) {
    const connection = await this.getConnection();
    try {
      for (const admin of franchise.admins) {
        const adminUser = await this.query(connection, `SELECT id, name FROM user WHERE email=?`, [admin.email]);
        logger.logDbQuery('SELECT id, name FROM user WHERE email=?');
        if (adminUser.length == 0) {
          throw new StatusCodeError(`unknown user for franchise admin ${admin.email} provided`, 404);
        }
        admin.id = adminUser[0].id;
        admin.name = adminUser[0].name;
      }

      const franchiseResult = await this.query(connection, `INSERT INTO franchise (name) VALUES (?)`, [franchise.name]);
      logger.logDbQuery('INSERT INTO franchise (name) VALUES (?)');
      franchise.id = franchiseResult.insertId;

      for (const admin of franchise.admins) {
        await this.query(connection, `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`, [admin.id, Role.Franchisee, franchise.id]);
        logger.logDbQuery('INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)');
      }

      return franchise;
    } finally {
      connection.end();
    }
  }

  async deleteFranchise(franchiseId) {
    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();
      try {
        await this.query(connection, `DELETE FROM store WHERE franchiseId=?`, [franchiseId]);
        logger.logDbQuery('DELETE FROM store WHERE franchiseId=?');

        await this.query(connection, `DELETE FROM userRole WHERE objectId=?`, [franchiseId]);
        logger.logDbQuery('DELETE FROM userRole WHERE objectId=?');

        await this.query(connection, `DELETE FROM franchise WHERE id=?`, [franchiseId]);
        logger.logDbQuery('DELETE FROM franchise WHERE id=?');

        await connection.commit();
      } catch {
        await connection.rollback();
        throw new StatusCodeError('unable to delete franchise', 500);
      }
    } finally {
      connection.end();
    }
  }

  async getFranchises(authUser) {
    const connection = await this.getConnection();
    try {
      const franchises = await this.query(connection, `SELECT id, name FROM franchise`);
      logger.logDbQuery('SELECT id, name FROM franchise');
      for (const franchise of franchises) {
        if (authUser?.isRole(Role.Admin)) {
          await this.getFranchise(franchise);
          // getFranchise calls query internally and logs them
        } else {
          franchise.stores = await this.query(connection, `SELECT id, name FROM store WHERE franchiseId=?`, [franchise.id]);
          logger.logDbQuery('SELECT id, name FROM store WHERE franchiseId=?');
        }
      }
      return franchises;
    } finally {
      connection.end();
    }
  }

  async getUserFranchises(userId) {
    const connection = await this.getConnection();
    try {
      let franchiseIds = await this.query(connection, `SELECT objectId FROM userRole WHERE role='franchisee' AND userId=?`, [userId]);
      logger.logDbQuery('SELECT objectId FROM userRole WHERE role=\'franchisee\' AND userId=?');
      if (franchiseIds.length === 0) {
        return [];
      }

      franchiseIds = franchiseIds.map((v) => v.objectId);
      const queryStr = `SELECT id, name FROM franchise WHERE id in (${franchiseIds.join(',')})`;
      const franchises = await this.query(connection, queryStr);
      logger.logDbQuery('SELECT id, name FROM franchise WHERE id in (...)');
      for (const franchise of franchises) {
        await this.getFranchise(franchise);
        // getFranchise logs queries internally
      }
      return franchises;
    } finally {
      connection.end();
    }
  }

  async getFranchise(franchise) {
    const connection = await this.getConnection();
    try {
      franchise.admins = await this.query(connection, `SELECT u.id, u.name, u.email FROM userRole AS ur JOIN user AS u ON u.id=ur.userId WHERE ur.objectId=? AND ur.role='franchisee'`, [franchise.id]);
      logger.logDbQuery('SELECT u.id, u.name, u.email FROM userRole AS ur JOIN user AS u ON u.id=ur.userId WHERE ur.objectId=? AND ur.role=\'franchisee\'');

      franchise.stores = await this.query(
        connection,
        `SELECT s.id, s.name, COALESCE(SUM(oi.price), 0) AS totalRevenue FROM dinerOrder AS do JOIN orderItem AS oi ON do.id=oi.orderId RIGHT JOIN store AS s ON s.id=do.storeId WHERE s.franchiseId=? GROUP BY s.id`,
        [franchise.id]
      );
      logger.logDbQuery('SELECT s.id, s.name, COALESCE(SUM(oi.price), 0) AS totalRevenue FROM dinerOrder ... WHERE s.franchiseId=? GROUP BY s.id');

      return franchise;
    } finally {
      connection.end();
    }
  }

  async createStore(franchiseId, store) {
    const connection = await this.getConnection();
    try {
      const insertResult = await this.query(connection, `INSERT INTO store (franchiseId, name) VALUES (?, ?)`, [franchiseId, store.name]);
      logger.logDbQuery('INSERT INTO store (franchiseId, name) VALUES (?, ?)');
      return { id: insertResult.insertId, franchiseId, name: store.name };
    } finally {
      connection.end();
    }
  }

  async deleteStore(franchiseId, storeId) {
    const connection = await this.getConnection();
    try {
      await this.query(connection, `DELETE FROM store WHERE franchiseId=? AND id=?`, [franchiseId, storeId]);
      logger.logDbQuery('DELETE FROM store WHERE franchiseId=? AND id=?');
    } finally {
      connection.end();
    }
  }

  getOffset(currentPage = 1, listPerPage) {
    return (currentPage - 1) * [listPerPage];
  }

  getTokenSignature(token) {
    const parts = token.split('.');
    if (parts.length > 2) {
      return parts[2];
    }
    return '';
  }

  async query(connection, sql, params) {
    const [results] = await connection.execute(sql, params);
    return results;
  }

  async getID(connection, key, value, table) {
    const queryStr = `SELECT id FROM ${table} WHERE ${key}=?`;
    const [rows] = await connection.execute(queryStr, [value]);
    logger.logDbQuery(`SELECT id FROM ${table} WHERE ${key}=?`);
    if (rows.length > 0) {
      return rows[0].id;
    }
    throw new Error('No ID found');
  }

  async getConnection() {
    // Make sure the database is initialized before trying to get a connection.
    await this.initialized;
    return this._getConnection();
  }

  async _getConnection(setUse = true) {
    const connection = await mysql.createConnection({
      host: config.db.connection.host,
      user: config.db.connection.user,
      password: config.db.connection.password,
      connectTimeout: config.db.connection.connectTimeout,
      decimalNumbers: true,
    });
    if (setUse) {
      await connection.query(`USE ${config.db.connection.database}`);
      logger.logDbQuery(`USE ${config.db.connection.database}`);
    }
    return connection;
  }

  async initializeDatabase() {
    try {
      const connection = await this._getConnection(false);
      try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${config.db.connection.database}`);
        logger.logDbQuery(`CREATE DATABASE IF NOT EXISTS ${config.db.connection.database}`);
        await connection.query(`USE ${config.db.connection.database}`);
        logger.logDbQuery(`USE ${config.db.connection.database}`);
        for (const statement of dbModel.tableCreateStatements) {
          await connection.query(statement);
        }
      } finally {
        connection.end();
      }
    } catch (err) {
      console.error(JSON.stringify({ message: 'Error initializing database', exception: err.message }));
    }
  }

  async checkDatabaseExists(connection) {
    const [rows] = await connection.execute(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`, [config.db.connection.database]);
    logger.logDbQuery('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?');
    return rows.length > 0;
  }
}

const db = new DB();
module.exports = { Role, DB: db };
