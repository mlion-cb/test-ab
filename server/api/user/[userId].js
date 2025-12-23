/**
 * User Data Fetch Endpoint
 * GET /api/user/:userId
 *
 * Returns user's wallet address and SP hash from Redis
 */

import app from '../../src/app.js';

export default function handler(req, res) {
  // Extract userId from query params (Vercel serverless pattern)
  const { userId } = req.query;
  req.url = `/user/${userId}`;
  req.method = 'GET';
  return app(req, res);
}
