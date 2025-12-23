/**
 * Get Server Wallet Address
 * GET /api/server-wallet/address
 *
 * Returns the server's smart account address (used as spender in spend permissions)
 * No authentication required - this is public information
 */

import app from '../../src/app.js';

export default function handler(req, res) {
  req.url = '/server-wallet/address';
  req.method = 'GET';
  return app(req, res);
}
