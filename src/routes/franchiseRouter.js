const express = require('express');
const { DB, Role } = require('../database/database.js');
const { authRouter } = require('./authRouter.js');
const { StatusCodeError, asyncHandler } = require('../endpointHelper.js');

const franchiseRouter = express.Router();

franchiseRouter.endpoints = [
  {
    method: 'GET',
    path: '/api/franchise',
    description: 'List all the franchises',
    example: `curl localhost:3000/api/franchise`,
    response: [{ id: 1, name: 'pizzaPocket', admins: [{ id: 4, name: 'pizza franchisee', email: 'f@jwt.com' }], stores: [{ id: 1, name: 'SLC', totalRevenue: 0 }] }],
  },
  {
    method: 'GET',
    path: '/api/franchise/:userId',
    requiresAuth: true,
    description: `List a user's franchises`,
    example: `curl localhost:3000/api/franchise/4  -H 'Authorization: Bearer tttttt'`,
    response: [{ id: 2, name: 'pizzaPocket', admins: [{ id: 4, name: 'pizza franchisee', email: 'f@jwt.com' }], stores: [{ id: 4, name: 'SLC', totalRevenue: 0 }] }],
  },
  {
    method: 'POST',
    path: '/api/franchise',
    requiresAuth: true,
    description: 'Create a new franchise',
    example: `curl -X POST localhost:3000/api/franchise -H 'Content-Type: application/json' -H 'Authorization: Bearer tttttt' -d '{"name": "pizzaPocket", "admins": [{"email": "f@jwt.com"}]}'`,
    response: { name: 'pizzaPocket', admins: [{ email: 'f@jwt.com', id: 4, name: 'pizza franchisee' }], id: 1 },
  },
  {
    method: 'DELETE',
    path: '/api/franchise/:franchiseId',
    requiresAuth: true,
    description: `Delete a franchise`,
    example: `curl -X DELETE localhost:3000/api/franchise/1 -H 'Authorization: Bearer tttttt'`,
    response: { message: 'franchise deleted' },
  },
];

// Define routes
franchiseRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await DB.getFranchises(req.user));
  })
);

franchiseRouter.get(
  '/:userId',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    let result = [];
    if (req.user.id === userId || req.user.isRole(Role.Admin)) {
      result = await DB.getUserFranchises(userId);
    }
    res.json(result);
  })
);

franchiseRouter.post(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      throw new StatusCodeError('unable to create a franchise', 403);
    }
    const franchise = req.body;
    res.send(await DB.createFranchise(franchise));
  })
);

franchiseRouter.delete(
  '/:franchiseId',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      throw new StatusCodeError('unable to delete a franchise', 403);
    }
    const franchiseId = Number(req.params.franchiseId);
    await DB.deleteFranchise(franchiseId);
    res.json({ message: 'franchise deleted' });
  })
);

module.exports = franchiseRouter; // Ensure it's exported as a Router
