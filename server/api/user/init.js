/**
 * User Initialization Endpoint
 * POST /api/user/init
 *
 * Flow:
 * 1. Check if user exists in Redis
 * 2. If exists → return existing wallet address
 * 3. If not exists → create wallet + spend permission → store in Redis
 *
 * This endpoint is called from client AFTER user gives consent.
 * If user declines consent, this endpoint is never called.
 */

import app from '../../src/app.js';

export default function handler(req, res) {
  req.url = '/user/init';
  req.method = 'POST';
  return app(req, res);
}
