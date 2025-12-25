/**
 * Server Wallet Management - Unified Interface
 *
 * Supports two modes via USE_REST_API env var:
 * 1. SDK Mode (default): Reliable, uses CDP SDK directly
 * 2. REST API Mode (USE_REST_API=true): Demo for Java partners, pure REST calls
 *
 * Current: SDK mode (working)
 * Set USE_REST_API=true to test REST API implementation
 */

// Default to SDK mode (working implementation)
export * from './serverWalletSDK.js';

// To use REST API mode (demo for Java partners):
// Set USE_REST_API=true in .env and uncomment below:
// export * from './serverWalletREST.js';
