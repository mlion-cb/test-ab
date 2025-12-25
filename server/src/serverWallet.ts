/**
 * Server Wallet Management - REST API Version
 *
 * Demonstrates how to interact with CDP Smart Accounts using REST API only.
 * No SDK wallet methods required - works with any backend language (Java, Python, etc.)
 *
 * All operations use:
 * - Pure fetch() calls
 * - JWT authentication via generateJwt helper
 * - CDP REST API endpoints
 *
 * Setup:
 * 1. Create wallet once via CDP dashboard or script
 * 2. Add to .env:
 *    - SERVER_WALLET_NAME=server-spender-wallet-v2
 *    - CDP_API_KEY_ID=your-key-id
 *    - CDP_API_KEY_SECRET=your-key-secret
 */

import { generateJwt } from '@coinbase/cdp-sdk/auth';

const SERVER_WALLET_NAME = process.env.SERVER_WALLET_NAME || 'server-spender-wallet-v2';
const CDP_API_BASE_URL = 'https://api.cdp.coinbase.com/platform';

let serverWalletData: any = null;

/**
 * Load Smart Account by name using REST API
 * GET /v2/evm/smart-accounts/by-name/{name}
 */
export async function initializeServerWallet(): Promise<string> {
  try {
    if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
      throw new Error('CDP_API_KEY_ID and CDP_API_KEY_SECRET required in environment variables');
    }

    console.log('🔄 [SERVER WALLET] Loading wallet by name via REST API:', SERVER_WALLET_NAME);

    const requestPath = `/v2/evm/smart-accounts/by-name/${SERVER_WALLET_NAME}`;

    // Generate JWT for authentication
    const authToken = await generateJwt({
      apiKeyId: process.env.CDP_API_KEY_ID!,
      apiKeySecret: process.env.CDP_API_KEY_SECRET!,
      requestMethod: 'GET',
      requestHost: 'api.cdp.coinbase.com',
      requestPath: requestPath,
      expiresIn: 120
    });

    // REST API call - works in any language!
    const response = await fetch(`${CDP_API_BASE_URL}${requestPath}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to load smart account: ${response.status} ${errorText}`);
    }

    serverWalletData = await response.json();

    console.log('✅ [SERVER WALLET] Server wallet loaded:', serverWalletData.address);
    console.log('👥 [SERVER WALLET] Owners:', serverWalletData.owners);

    return serverWalletData.address;

  } catch (error) {
    console.error('❌ [SERVER WALLET] Error loading server wallet:', error);
    throw error;
  }
}

/**
 * Use Spend Permission - REST API call
 * POST /v2/evm/smart-accounts/{address}/use-spend-permission
 *
 * For Java implementation:
 * - Generate JWT using your JWT library (e.g., jjwt, auth0)
 * - POST to this endpoint with Bearer token
 * - Body: { spendPermission, value, network, paymasterUrl }
 */
export async function useSpendPermissionAPI(params: {
  spendPermission: any;
  value: bigint;
  network: string;
  paymasterUrl: string;
}): Promise<any> {
  console.log('🔄 [SERVER WALLET API] Calling useSpendPermission via REST API...');

  if (!serverWalletData) {
    throw new Error('Server wallet not initialized. Call initializeServerWallet() first.');
  }

  const requestPath = `/v2/evm/smart-accounts/${serverWalletData.address}/use-spend-permission`;

  // Generate JWT for authentication
  const authToken = await generateJwt({
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    requestMethod: 'POST',
    requestHost: 'api.cdp.coinbase.com',
    requestPath: requestPath,
    expiresIn: 120
  });

  const response = await fetch(`${CDP_API_BASE_URL}${requestPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      spendPermission: params.spendPermission,
      value: params.value.toString(),
      network: params.network,
      paymasterUrl: params.paymasterUrl
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to use spend permission: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ [SERVER WALLET API] useSpendPermission result:', result.userOpHash);

  return result;
}

/**
 * Send User Operation - REST API call
 * POST /v2/evm/smart-accounts/{address}/user-operations
 *
 * For Java implementation:
 * - Generate JWT using your JWT library
 * - POST to this endpoint with Bearer token
 * - Body: { to, value, data, network, paymasterUrl }
 */
export async function sendUserOperationAPI(params: {
  to: string;
  value: bigint;
  data: string;
  network: string;
  paymasterUrl: string;
}): Promise<any> {
  console.log('🔄 [SERVER WALLET API] Calling sendUserOperation via REST API...');

  if (!serverWalletData) {
    throw new Error('Server wallet not initialized. Call initializeServerWallet() first.');
  }

  const requestPath = `/v2/evm/smart-accounts/${serverWalletData.address}/user-operations`;

  // Generate JWT for authentication
  const authToken = await generateJwt({
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    requestMethod: 'POST',
    requestHost: 'api.cdp.coinbase.com',
    requestPath: requestPath,
    expiresIn: 120
  });

  const response = await fetch(`${CDP_API_BASE_URL}${requestPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: params.to,
      value: params.value.toString(),
      data: params.data,
      network: params.network,
      paymasterUrl: params.paymasterUrl
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send user operation: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ [SERVER WALLET API] sendUserOperation result:', result.userOpHash);

  return result;
}

/**
 * Wait for User Operation - REST API polling
 * GET /v2/evm/user-operations/{userOpHash}?network={network}
 *
 * For Java implementation:
 * - Poll this endpoint every 2 seconds
 * - Check for status === 'confirmed' or transactionHash present
 */
export async function waitForUserOperationAPI(result: any): Promise<any> {
  const { userOpHash, network } = result;

  console.log('⏳ [SERVER WALLET API] Waiting for user operation via REST API:', userOpHash);

  // Poll until confirmed
  let attempts = 0;
  const maxAttempts = 60; // 2 minutes max

  while (attempts < maxAttempts) {
    const requestPath = `/v2/evm/user-operations/${userOpHash}?network=${network}`;

    // Generate JWT for authentication
    const authToken = await generateJwt({
      apiKeyId: process.env.CDP_API_KEY_ID!,
      apiKeySecret: process.env.CDP_API_KEY_SECRET!,
      requestMethod: 'GET',
      requestHost: 'api.cdp.coinbase.com',
      requestPath: `/v2/evm/user-operations/${userOpHash}`, // Don't include query params in JWT path
      expiresIn: 120
    });

    const response = await fetch(`${CDP_API_BASE_URL}${requestPath}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to check user operation: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'confirmed' || data.transactionHash) {
      console.log('✅ [SERVER WALLET API] User operation confirmed:', {
        userOpHash: data.userOpHash,
        transactionHash: data.transactionHash
      });
      return data;
    }

    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }

  throw new Error('User operation confirmation timeout');
}

/**
 * Get server wallet address
 */
export function getServerWalletAddress(): string {
  if (!serverWalletData) {
    throw new Error('Server wallet not initialized. Call initializeServerWallet() first.');
  }
  return serverWalletData.address;
}

/**
 * Legacy SDK-compatible wrapper
 * Returns object that works with existing sweepFunds.ts code
 */
export function getServerWallet(): any {
  if (!serverWalletData) {
    throw new Error('Server wallet not initialized. Call initializeServerWallet() first.');
  }

  // Return an object that mimics SDK interface but uses REST API
  return {
    address: serverWalletData.address,
    useSpendPermission: useSpendPermissionAPI,
    sendUserOperation: sendUserOperationAPI,
    waitForUserOperation: waitForUserOperationAPI
  };
}

export async function loadServerWallet(): Promise<any> {
  if (!serverWalletData) {
    await initializeServerWallet();
  }
  return getServerWallet();
}
