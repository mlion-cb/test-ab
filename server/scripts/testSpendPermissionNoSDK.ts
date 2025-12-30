/**
 * Test Spend Permission WITHOUT SDK
 *
 * This script demonstrates how to use spend permissions with ZERO CDP SDK usage.
 * Perfect reference for Java/Python partners who need to implement this.
 *
 * What this does:
 * 1. Fetches spend permissions via REST API (no SDK)
 * 2. Filters and sorts permissions (most recent first)
 * 3. Encodes smart contract call data manually (ABI encoding like Java's web3j)
 * 4. Prepares user operation via REST API
 * 5. Signs the user operation hash via REST API (using Wallet Secret)
 * 6. Sends the signed user operation via REST API
 * 7. Polls for confirmation via REST API (no SDK)
 *
 * Key Implementation Details:
 * - Uses 3-step flow: prepare -> sign -> send (same as CDP SDK does internally)
 * - Requires Authorization (API Key JWT) for all requests
 * - Requires X-Wallet-Auth (Wallet Secret JWT) for signing endpoint
 * - ABI encoding done manually to show exact byte layout
 * - Tries multiple permissions in case earlier ones have on-chain issues
 *
 * Usage:
 *   npx tsx scripts/testSpendPermissionNoSDK.ts
 *
 * Note: Only one SDK import remains (generateJwt) for convenience.
 * In Java/Python, partners would implement JWT generation themselves using
 * standard libraries (java.util.jwt / PyJWT).
 */

import { generateJwt } from '@coinbase/cdp-sdk/auth'; // Only using this for JWT - could replace with jose
import * as crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables - works from both root and server directory
// Try server/.env.local first (most specific), then .env.local (root)
dotenv.config({ path: path.join(process.cwd(), 'server/.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Configuration
const CDP_API_BASE_URL = 'https://api.cdp.coinbase.com';
const SPEND_PERMISSION_MANAGER_ADDRESS = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad'; // Correct address per CDP docs
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base mainnet
const NETWORK = 'base';

// Server wallet config
const SERVER_WALLET_ADDRESS = process.env.SERVER_WALLET_ADDRESS!;
const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID!;
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET!;
const CDP_WALLET_SECRET = process.env.CDP_WALLET_SECRET!;

// Owner address (from SDK debug output: 0x9953111aeb97A7ff036035A5B2b935c55428e495)
// This is the address that signs user operations for the smart account
const SERVER_WALLET_OWNER_ADDRESS = '0x9953111aeb97A7ff036035A5B2b935c55428e495';

// IMPORTANT: For listing spend permissions, you can only list permissions for wallets
// that either:
// 1. Belong to your CDP project (your own smart accounts)
// 2. Are publicly readable (which most aren't for security)
//
// In production, you would get this address from your user after they complete onramp
// For this demo, we'll use a wallet address that has granted permissions to our server
const USER_WALLET_ADDRESS = process.env.TEST_USER_WALLET_ADDRESS || '0x9ac3188dE7B2f69Af9A107d4B278e794606781A8';

/**
 * Generate Wallet Authentication JWT (ES256 with Wallet Secret)
 */
async function generateWalletAuthJwt(params: {
  requestMethod: string;
  requestHost: string;
  requestPath: string;
  requestBody?: any;
}): Promise<string> {
  const walletSecret = CDP_WALLET_SECRET;
  if (!walletSecret) {
    throw new Error('CDP_WALLET_SECRET not found');
  }

  const jose = await import('jose');

  // Create EC private key from DER-encoded wallet secret
  const ecKey = crypto.createPrivateKey({
    key: walletSecret,
    format: 'der',
    type: 'pkcs8',
    encoding: 'base64'
  });

  const uri = `${params.requestMethod} ${params.requestHost}${params.requestPath}`;

  const now = Math.floor(Date.now() / 1000);
  const payload: any = {
    iat: now,
    nbf: now,
    jti: crypto.randomBytes(16).toString('hex'),
    uris: [uri]
  };

  // Add request body hash if present
  if (params.requestBody) {
    const sortedBody = sortKeys(params.requestBody);
    const canonicalJson = JSON.stringify(sortedBody);
    const hash = crypto.createHash('sha256').update(canonicalJson).digest('hex');
    payload.reqHash = hash;
  }

  const jwt = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .sign(ecKey);

  return jwt;
}

function sortKeys(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  return Object.keys(obj)
    .sort()
    .reduce((acc: any, key) => {
      acc[key] = sortKeys(obj[key]);
      return acc;
    }, {});
}

/**
 * Step 1: List spend permissions via REST API
 */
async function listSpendPermissions(userAddress: string): Promise<any[]> {
  console.log('\n📋 [STEP 1] Listing spend permissions via REST API...');
  console.log('User address:', userAddress);

  // IMPORTANT: The requestPath for JWT must match the ACTUAL request path INCLUDING /platform
  const requestPath = `/platform/v2/evm/smart-accounts/${userAddress}/spend-permissions/list`;
  const requestUrl = `${CDP_API_BASE_URL}${requestPath}`;

  console.log('🔍 DEBUG: Request path for JWT:', requestPath);
  console.log('🔍 DEBUG: Full request URL:', requestUrl);

  // The JWT uris field will be: "GET api.cdp.coinbase.com/platform/v2/evm/smart-accounts/{address}/spend-permissions/list"
  const authToken = await generateJwt({
    apiKeyId: CDP_API_KEY_ID,
    apiKeySecret: CDP_API_KEY_SECRET,
    requestMethod: 'GET',
    requestHost: 'api.cdp.coinbase.com',
    requestPath: requestPath, // Must include /platform to match actual URL
    expiresIn: 120
  });

  console.log('🔍 DEBUG: Auth token (first 50 chars):', authToken.substring(0, 50));

  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list spend permissions: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log(`✅ Found ${result.spendPermissions.length} spend permissions`);

  // Filter for valid permissions
  const validPermissions = result.spendPermissions.filter((p: any) => {
    const isCorrectSpender = p.permission.spender.toLowerCase() === SERVER_WALLET_ADDRESS.toLowerCase();
    const isCorrectToken = p.permission.token.toLowerCase() === USDC_ADDRESS.toLowerCase();
    const isNotRevoked = !p.revoked;
    const isActive = parseInt(p.permission.start) <= Math.floor(Date.now() / 1000);

    return isCorrectSpender && isCorrectToken && isNotRevoked && isActive;
  });

  console.log(`✅ Found ${validPermissions.length} VALID permissions for our server wallet`);

  // Sort by start time descending (most recent first)
  // This is important because earlier permissions may have failed on-chain
  validPermissions.sort((a: any, b: any) => {
    return parseInt(b.permission.start) - parseInt(a.permission.start);
  });

  console.log(`✅ Sorted by most recent (newest first):`);
  validPermissions.forEach((p: any, index: number) => {
    const startDate = new Date(parseInt(p.permission.start) * 1000).toISOString();
    console.log(`   ${index + 1}. ${p.permissionHash.substring(0, 20)}... (start: ${startDate})`);
  });

  return validPermissions;
}

/**
 * Step 2: Encode contract call data (ABI encoding)
 *
 * This is the equivalent of web3j's FunctionEncoder.encode() in Java
 * Function signature: spend(SpendPermission,uint160)
 * Where SpendPermission is: (address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData)
 */
function encodeSpendCall(spendPermission: any, value: bigint): string {
  console.log('\n🔨 [STEP 2] Encoding contract call data (ABI)...');
  console.log('Permission hash:', spendPermission.permissionHash);
  console.log('Amount to spend:', value.toString());

  // Function selector for: spend((address,address,address,uint160,uint48,uint48,uint48,uint256,bytes),uint160)
  // keccak256("spend((address,address,address,uint160,uint48,uint48,uint48,uint256,bytes),uint160)") = 0x415a9735
  const functionSelector = '0x415a9735';

  // Encode the struct (SpendPermission)
  const p = spendPermission.permission;

  // Pad address to 32 bytes
  const padAddress = (addr: string) => addr.slice(2).padStart(64, '0');
  // Pad uint to 32 bytes
  const padUint = (num: string | bigint | number) => {
    const hex = typeof num === 'bigint' ? num.toString(16) : BigInt(num).toString(16);
    return hex.padStart(64, '0');
  };

  // Offset to tuple (0x40 = 64 bytes)
  const tupleOffset = padUint(0x40);

  // Value (uint160)
  const valueEncoded = padUint(value);

  // Tuple elements
  const account = padAddress(p.account);
  const spender = padAddress(p.spender);
  const token = padAddress(p.token);
  const allowance = padUint(p.allowance);
  const period = padUint(p.period);
  const start = padUint(p.start);
  const end = padUint(p.end);
  const salt = padUint(p.salt);

  // ExtraData offset (points to after all fixed-size fields)
  const extraDataOffset = padUint(0x120); // 9 * 32 = 288 = 0x120

  // ExtraData encoding
  let extraDataEncoded = '';
  if (p.extraData && p.extraData !== '0x') {
    const extraDataBytes = p.extraData.slice(2); // Remove 0x
    const extraDataLength = padUint(extraDataBytes.length / 2);
    extraDataEncoded = extraDataLength + extraDataBytes.padEnd(Math.ceil(extraDataBytes.length / 64) * 64, '0');
  } else {
    extraDataEncoded = padUint(0); // Empty bytes
  }

  // Combine everything
  const callData = functionSelector +
    tupleOffset +
    valueEncoded +
    account +
    spender +
    token +
    allowance +
    period +
    start +
    end +
    salt +
    extraDataOffset +
    extraDataEncoded;

  console.log('✅ Encoded call data:', callData.substring(0, 66) + '...');
  console.log('   Total length:', callData.length, 'characters');

  return callData;
}

/**
 * Step 3a: Prepare user operation via REST API
 */
async function prepareUserOperation(callData: string): Promise<any> {
  console.log('\n🚀 [STEP 3a] Preparing user operation via REST API...');

  const requestPath = `/platform/v2/evm/smart-accounts/${SERVER_WALLET_ADDRESS}/user-operations`;

  const requestBodyObj = {
    calls: [{
      to: SPEND_PERMISSION_MANAGER_ADDRESS,
      value: '0',
      data: callData
    }],
    network: NETWORK,
    paymasterUrl: 'https://api.developer.coinbase.com/rpc/v1/base/6DmPQTz8egifUIDdGm3wl4aoXAdYWw5H'
  };

  const authToken = await generateJwt({
    apiKeyId: CDP_API_KEY_ID,
    apiKeySecret: CDP_API_KEY_SECRET,
    requestMethod: 'POST',
    requestHost: 'api.cdp.coinbase.com',
    requestPath: requestPath,
    expiresIn: 120
  });

  console.log('🔍 DEBUG: Request body:', JSON.stringify(requestBodyObj, null, 2));

  const response = await fetch(`${CDP_API_BASE_URL}${requestPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBodyObj)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to prepare user operation: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ User operation prepared:', result.userOpHash);

  return result;
}

/**
 * Step 3b: Sign the user operation hash via REST API
 */
async function signUserOperationHash(userOpHash: string, ownerAddress: string): Promise<string> {
  console.log('\n🖊️  [STEP 3b] Signing user operation hash via REST API...');
  console.log('UserOpHash to sign:', userOpHash);
  console.log('Owner address:', ownerAddress);

  const requestPath = `/platform/v2/evm/accounts/${ownerAddress}/sign`;

  const requestBodyObj = {
    hash: userOpHash
  };

  const authToken = await generateJwt({
    apiKeyId: CDP_API_KEY_ID,
    apiKeySecret: CDP_API_KEY_SECRET,
    requestMethod: 'POST',
    requestHost: 'api.cdp.coinbase.com',
    requestPath: requestPath,
    expiresIn: 120
  });

  // Generate Wallet Auth JWT for signing
  const walletAuthToken = await generateWalletAuthJwt({
    requestMethod: 'POST',
    requestHost: 'api.cdp.coinbase.com',
    requestPath: requestPath,
    requestBody: requestBodyObj
  });

  const response = await fetch(`${CDP_API_BASE_URL}${requestPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'X-Wallet-Auth': walletAuthToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBodyObj)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to sign user operation: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ Signature generated:', result.signature.substring(0, 20) + '...');

  return result.signature;
}

/**
 * Step 3c: Send the signed user operation via REST API
 */
async function sendSignedUserOperation(userOpHash: string, signature: string): Promise<any> {
  console.log('\n📤 [STEP 3c] Sending signed user operation via REST API...');

  const requestPath = `/platform/v2/evm/smart-accounts/${SERVER_WALLET_ADDRESS}/user-operations/${userOpHash}/send`;

  const requestBodyObj = {
    signature: signature
  };

  const authToken = await generateJwt({
    apiKeyId: CDP_API_KEY_ID,
    apiKeySecret: CDP_API_KEY_SECRET,
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
    body: JSON.stringify(requestBodyObj)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send signed user operation: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ User operation sent successfully!');

  return result;
}

/**
 * Step 4: Wait for user operation confirmation
 */
async function waitForUserOperation(userOpHash: string, network: string): Promise<any> {
  console.log('\n⏳ [STEP 4] Waiting for user operation confirmation...');
  console.log('UserOpHash:', userOpHash);

  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    const requestPath = `/platform/v2/evm/user-operations/${userOpHash}?network=${network}`;

    const authToken = await generateJwt({
      apiKeyId: CDP_API_KEY_ID,
      apiKeySecret: CDP_API_KEY_SECRET,
      requestMethod: 'GET',
      requestHost: 'api.cdp.coinbase.com',
      requestPath: `/platform/v2/evm/user-operations/${userOpHash}`,
      expiresIn: 120
    });

    const response = await fetch(`${CDP_API_BASE_URL}${requestPath}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    // 404 means not indexed yet, keep polling
    if (response.status === 404) {
      process.stdout.write('.');
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Failed to check user operation: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'confirmed' || data.transactionHash) {
      console.log('✅ User operation confirmed!');
      console.log('   Transaction hash:', data.transactionHash);
      console.log('   View on BaseScan: https://basescan.org/tx/' + data.transactionHash);
      return data;
    }

    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }

  throw new Error('User operation confirmation timeout');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🧪 Testing Spend Permission WITHOUT SDK');
    console.log('=========================================');
    console.log('Server wallet:', SERVER_WALLET_ADDRESS);
    console.log('User wallet:', USER_WALLET_ADDRESS);
    console.log('Network:', NETWORK);

    // Step 1: List spend permissions
    const permissions = await listSpendPermissions(USER_WALLET_ADDRESS);

    if (permissions.length === 0) {
      console.error('❌ No valid spend permissions found!');
      console.error('   User needs to create a spend permission first.');
      process.exit(1);
    }

    // Try each valid spend permission until one succeeds (like sweepFunds.ts does)
    const amount = BigInt(500000); // 0.5 USDC (6 decimals)

    let userOp = null;
    let successfulPermission = null;

    for (let i = 0; i < permissions.length; i++) {
      const permission = permissions[i];
      console.log(`\n🔄 [ATTEMPT ${i + 1}/${permissions.length}] Trying permission:`, permission.permissionHash);

      try {
        // Step 2: Encode contract call
        const callData = encodeSpendCall(permission, amount);

        // Step 3a: Prepare user operation
        const preparedOp = await prepareUserOperation(callData);

        // Step 3b: Sign the user operation hash
        const signature = await signUserOperationHash(preparedOp.userOpHash, SERVER_WALLET_OWNER_ADDRESS);

        // Step 3c: Send the signed user operation
        userOp = await sendSignedUserOperation(preparedOp.userOpHash, signature);
        userOp.userOpHash = preparedOp.userOpHash; // Make sure we have the hash for confirmation

        successfulPermission = permission;
        console.log(`✅ SUCCESS with permission ${i + 1}!`);
        break; // Stop trying once we succeed
      } catch (error: any) {
        console.error(`❌ FAILED with permission ${i + 1}:`, error.message);

        if (i < permissions.length - 1) {
          console.log(`🔄 Trying next permission...`);
        } else {
          console.error(`❌ All ${permissions.length} permissions failed!`);
          throw new Error(`All valid spend permissions failed. Last error: ${error.message}`);
        }
      }
    }

    if (!userOp || !successfulPermission) {
      throw new Error('Failed to use any valid spend permission');
    }

    console.log('\n🎉 SUCCESS! Spend permission used without SDK!');
    console.log('   UserOpHash:', userOp.userOpHash);
    console.log('   Amount:', (Number(amount) / 1_000_000).toFixed(6), 'USDC');
    console.log('   From:', USER_WALLET_ADDRESS);
    console.log('   To:', SERVER_WALLET_ADDRESS);

    // Step 4: Wait for confirmation (optional)
    try {
      console.log('\n⏳ Waiting for confirmation...');
      const confirmed = await waitForUserOperation(userOp.userOpHash, NETWORK);
      console.log('✅ Transaction confirmed:', confirmed.transactionHash);
    } catch (error: any) {
      console.log('\n⚠️  Could not wait for confirmation:', error.message);
      console.log('   The transaction may still be processing.');
      console.log('   Check status manually or wait a few minutes.');
    }

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run it
main();
