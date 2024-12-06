const express = require('express');
const config = require('../config.js');
const { Role, DB } = require('../database/database.js');
const { authRouter } = require('./authRouter.js');
const { asyncHandler, StatusCodeError } = require('../endpointHelper.js');
const metrics = require('../metrics.js'); // Import the metrics module
const logger = require('../logger.js'); // Import the logger module

const orderRouter = express.Router();

orderRouter.endpoints = [
  {
    method: 'GET',
    path: '/api/order/menu',
    description: 'Get the pizza menu',
    example: `curl localhost:3000/api/order/menu`,
    response: [{ id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' }],
  },
  {
    method: 'PUT',
    path: '/api/order/menu',
    requiresAuth: true,
    description: 'Add an item to the menu',
    example: `curl -X PUT localhost:3000/api/order/menu -H 'Content-Type: application/json' -d '{ "title":"Student", "description": "No topping, no sauce, just carbs", "image":"pizza9.png", "price": 0.0001 }'  -H 'Authorization: Bearer tttttt'`,
    response: [{ id: 1, title: 'Student', description: 'No topping, no sauce, just carbs', image: 'pizza9.png', price: 0.0001 }],
  },
  {
    method: 'GET',
    path: '/api/order',
    requiresAuth: true,
    description: 'Get the orders for the authenticated user',
    example: `curl -X GET localhost:3000/api/order  -H 'Authorization: Bearer tttttt'`,
    response: { dinerId: 4, orders: [{ id: 1, franchiseId: 1, storeId: 1, date: '2024-06-05T05:14:40.000Z', items: [{ id: 1, menuId: 1, description: 'Veggie', price: 0.05 }] }], page: 1 },
  },
  {
    method: 'POST',
    path: '/api/order',
    requiresAuth: true,
    description: 'Create an order for the authenticated user',
    example: `curl -X POST localhost:3000/api/order -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}'  -H 'Authorization: Bearer tttttt'`,
    response: { order: { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Veggie', price: 0.05 }], id: 1 }, jwt: '1111111111' },
  },
];

// getMenu
orderRouter.get(
  '/menu',
  asyncHandler(async (req, res) => {
    const menu = await DB.getMenu();
    logger.logDbQuery('getMenu'); // Log the database request
    res.send(menu);
  })
);

// addMenuItem
orderRouter.put(
  '/menu',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      throw new StatusCodeError('unable to add menu item', 403);
    }

    const addMenuItemReq = req.body;
    await DB.addMenuItem(addMenuItemReq);
    logger.logDbQuery('addMenuItem'); // Log the database request

    const updatedMenu = await DB.getMenu();
    logger.logDbQuery('getMenu'); // Log the database request again after retrieving menu
    res.send(updatedMenu);
  })
);

// getOrders
orderRouter.get(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const orders = await DB.getOrders(req.user, req.query.page);
    logger.logDbQuery('getOrders'); // Log the database request
    res.json(orders);
  })
);

// createOrder
orderRouter.post(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const orderReq = req.body;
    metrics.totalOrders++;

    // Record the start time for latency measurement
    const start = Date.now();

    const order = await DB.addDinerOrder(req.user, orderReq);
    logger.logDbQuery('addDinerOrder'); // Log the database request

    // On success:
    const latencyMs = Date.now() - start;
    metrics.sendMetricToGrafana(`request,source=${config.metrics.source},method=postPizza pizzaCreationLatency=${latencyMs}`);

    // Count pizzas sold
    const numPizzas = orderReq.items.length;
    metrics.successfulOrders += numPizzas;

    // Add revenue
    const revenue = orderReq.items.reduce((sum, item) => sum + item.price, 0);
    metrics.revenue += revenue;

    // Send order to the factory
    const factoryUrl = `${config.factory.url}/api/order`;
    const factoryReqBody = { diner: { id: req.user.id, name: req.user.name, email: req.user.email }, order };
    const r = await fetch(factoryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${config.factory.apiKey}` },
      body: JSON.stringify(factoryReqBody),
    });
    const j = await r.json();

    // Log the factory request
    logger.logFactoryRequest(factoryUrl, 'POST', factoryReqBody, r.status, j);

    if (r.ok) {
      res.send({ order, jwt: j.jwt, reportUrl: j.reportUrl });
    } else {
      res.status(500).send({ message: 'Failed to fulfill order at factory', reportUrl: j.reportUrl });
    }
  })
);

module.exports = orderRouter;
