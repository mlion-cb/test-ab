/**
 * Test Sweep Endpoint
 * POST /api/test/sweep
 *
 * Manual trigger for testing sweep functionality
 */

import app from '../../src/app.js';

export default function handler(req, res) {
  req.url = '/test/sweep';
  req.method = 'POST';
  return app(req, res);
}
