/**
 * Sweep Funds Module
 *
 * Complete flow for sweeping USDC from user wallets to admin address:
 * 1. Wait for onramp transaction confirmation
 * 2. List spend permissions on user's wallet
 * 3. Validate SP (spender, token, not revoked)
 * 4. Use SP to sweep USDC to server wallet
 * 5. Transfer from server wallet to admin address
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, http, parseUnits } from 'viem';
import { base } from 'viem/chains';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base mainnet USDC
const ADMIN_WALLET_ADDRESS = process.env.ADMIN_WALLET_ADDRESS!;

interface SweepParams {
  txHash: string;
  destinationAddress: string;
  network: string;
  amount: string;
  currency: string;
  partnerUserRef: string;
}

/**
 * Execute complete sweep flow
 */
export async function executeSweep(params: SweepParams): Promise<void> {
  const { txHash, destinationAddress, network, amount, currency, partnerUserRef } = params;

  // Only sweep on Base for USDC
  if (network.toLowerCase() !== 'base' || currency.toUpperCase() !== 'USDC') {
    console.log('ℹ️ [SWEEP] Skipping sweep - not Base USDC:', { network, currency });
    return;
  }

  console.log('💰 [SWEEP] Using USDC contract:', USDC_ADDRESS, 'on base');

  try {
    // Step 1: Wait for transaction confirmation
    console.log('⏳ [SWEEP] Step 1/5: Waiting for transaction confirmation...');
    await waitForTransactionConfirmation(txHash, network);
    console.log('✅ [SWEEP] Transaction confirmed on-chain');

    // Step 2: List spend permissions on user's wallet
    console.log('⏳ [SWEEP] Step 2/5: Fetching spend permissions...');
    const spendPermission = await getValidSpendPermission(destinationAddress, network);

    if (!spendPermission) {
      // No valid SP found - log and notify user
      console.error('❌ [SWEEP] No valid spend permission found');
      console.error('📋 [SWEEP] User needs to complete consent flow');

      // TODO: Send push notification to user
      await notifyUserMissingSpendPermission(partnerUserRef);

      return; // Cannot sweep without SP
    }

    console.log('✅ [SWEEP] Valid spend permission found');
    console.log('🔐 [SWEEP] Permission details:', {
      spender: spendPermission.permission.spender,
      token: spendPermission.permission.token,
      allowance: spendPermission.permission.allowance
    });

    // Step 3: Use spend permission to sweep to server wallet
    console.log('⏳ [SWEEP] Step 3/5: Sweeping USDC to server wallet...');
    const sweepAmount = parseUnits(amount, 6); // USDC has 6 decimals
    const sweepResult = await useSpendPermissionToSweep(spendPermission, sweepAmount, network);
    console.log('✅ [SWEEP] Swept to server wallet:', sweepResult.userOpHash);

    // Step 4: Wait for sweep confirmation
    console.log('⏳ [SWEEP] Step 4/5: Waiting for sweep confirmation...');
    await waitForUserOperation(sweepResult);
    console.log('✅ [SWEEP] Sweep confirmed');

    // Step 5: Transfer from server wallet to admin address
    console.log('⏳ [SWEEP] Step 5/5: Transferring to admin address...');
    const transferResult = await transferToAdmin(sweepAmount, network);
    console.log('✅ [SWEEP] Transfer initiated:', transferResult.userOpHash);

    // Wait for final transfer
    await waitForUserOperation(transferResult);
    console.log('✅ [SWEEP] Transfer confirmed - sweep complete!');
    console.log('🎉 [SWEEP] Final destination:', ADMIN_WALLET_ADDRESS);

  } catch (error) {
    console.error('❌ [SWEEP] Sweep failed:', error);
    throw error;
  }
}

/**
 * Wait for onramp transaction to be confirmed on-chain
 */
async function waitForTransactionConfirmation(txHash: string, network: string): Promise<void> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http()
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    confirmations: 1
  });

  if (receipt.status !== 'success') {
    throw new Error(`Transaction failed: ${txHash}`);
  }

  console.log('📦 [SWEEP] Transaction receipt:', {
    blockNumber: receipt.blockNumber,
    status: receipt.status
  });
}

/**
 * Get valid spend permission for server wallet
 * Validates: spender, token (USDC), not revoked
 */
async function getValidSpendPermission(userAddress: string, network: string = 'base'): Promise<any | null> {
  // TEMPORARY: Use specific spend permission provided by engineer for testing
  const HARDCODED_TEST_SP = {
    "createdAt": "2025-12-24T04:47:33.878Z",
    "network": "base",
    "permission": {
      "account": "0x9ac3188de7b2f69af9a107d4b278e794606781a8",
      "allowance": "10000000000",
      "end": "281474976710655",
      "extraData": "0x",
      "period": "604800",
      "salt": "48669354071075928928055244610114470151352860184320155939446397737931924134939",
      "spender": "0xf6733167edc02663c562f96612dcf9d98f2c0cdd",
      "start": "1766551652",
      "token": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
    },
    "permissionHash": "0x7fb271efb9caac72878c95929911c48e57a063a36fae75e06e0ed150ae991f43",
    "revoked": false
  };

  console.log('🔐 [SWEEP] Using hardcoded test spend permission');
  console.log('📋 [SWEEP] Permission hash:', HARDCODED_TEST_SP.permissionHash);
  console.log('📋 [SWEEP] Start time:', HARDCODED_TEST_SP.permission.start);
  console.log('📋 [SWEEP] Current time:', Math.floor(Date.now() / 1000));

  return HARDCODED_TEST_SP;

  /* COMMENTED OUT - Using hardcoded SP for now
  const cdp = new CdpClient();

  // List all spend permissions on user's wallet
  const allPermissions = await cdp.evm.listSpendPermissions({
    address: userAddress as `0x${string}`
  });

  console.log('📋 [SWEEP] Found', allPermissions.spendPermissions.length, 'total permissions');

  // Get server wallet address dynamically
  const { getServerWalletAddress, initializeServerWallet } = await import('./serverWallet.js');

  let serverWalletAddress: string;
  try {
    serverWalletAddress = getServerWalletAddress();
  } catch {
    // Initialize if not already initialized
    serverWalletAddress = await initializeServerWallet();
  }

  console.log('🔐 [SWEEP] Looking for SP with server wallet spender:', serverWalletAddress);

  // Find permission matching our criteria (hardcoded for base-sepolia)
  const validPermission = allPermissions.spendPermissions.find((p: any) => {
    const isCorrectSpender = p.permission.spender.toLowerCase() === serverWalletAddress.toLowerCase();
    const isCorrectToken = p.permission.token.toLowerCase() === USDC_ADDRESS.toLowerCase();
    const isNotRevoked = !p.revoked;

    console.log('🔍 [SWEEP] Checking permission:', {
      spender: p.permission.spender,
      isCorrectSpender,
      token: p.permission.token,
      isCorrectToken,
      revoked: p.revoked,
      isNotRevoked
    });

    return isCorrectSpender && isCorrectToken && isNotRevoked;
  });

  return validPermission || null;
  */
}

/**
 * Use spend permission to sweep USDC to server wallet
 */
async function useSpendPermissionToSweep(spendPermission: any, amount: bigint, network: string): Promise<any> {
  // Import and initialize server wallet (lazy loading)
  const { getServerWallet, initializeServerWallet } = await import('./serverWallet.js');

  try {
    const serverWallet = getServerWallet();
  } catch {
    // Wallet not initialized yet - initialize it now
    console.log('🔄 [SWEEP] Initializing server wallet...');
    await initializeServerWallet();
  }

  const serverWallet = getServerWallet();
  console.log('🔄 [SWEEP] Using server wallet to execute spend permission...');
  console.log('🔍 [SWEEP] Full permission object:', JSON.stringify(spendPermission, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2));
  console.log('🔍 [SWEEP] Amount to sweep:', amount.toString(), '(0.5 USDC = 500000 with 6 decimals)');
  console.log('🔍 [SWEEP] Current timestamp:', Math.floor(Date.now() / 1000));

  const sweepResult = await serverWallet.useSpendPermission({
    spendPermission: spendPermission.permission,
    value: amount,
    network: 'base',
    paymasterUrl: 'https://api.developer.coinbase.com/rpc/v1/base/6DmPQTz8egifUIDdGm3wl4aoXAdYWw5H'
  });

  return sweepResult;
}

/**
 * Wait for user operation to be confirmed
 */
async function waitForUserOperation(result: any): Promise<void> {
  const { getServerWallet, initializeServerWallet } = await import('./serverWallet.js');

  try {
    const serverWallet = getServerWallet();
  } catch {
    await initializeServerWallet();
  }

  const serverWallet = getServerWallet();

  console.log('⏳ [SWEEP] Waiting for user operation:', result.userOpHash);

  const receipt = await serverWallet.waitForUserOperation(result);

  console.log('✅ [SWEEP] User operation confirmed:', {
    userOpHash: receipt.userOpHash,
    transactionHash: receipt.transactionHash
  });
}

/**
 * Transfer USDC from server wallet to admin address
 */
async function transferToAdmin(amount: bigint, network: string): Promise<any> {
  const { getServerWallet, initializeServerWallet } = await import('./serverWallet.js');

  try {
    const serverWallet = getServerWallet();
  } catch {
    await initializeServerWallet();
  }

  const serverWallet = getServerWallet();

  console.log('🔄 [SWEEP] Preparing transfer to admin address...');
  console.log('💰 [SWEEP] Amount:', amount.toString());
  console.log('📍 [SWEEP] Destination:', ADMIN_WALLET_ADDRESS);

  // Add delay to allow balance to settle after sweep
  console.log('⏳ [SWEEP] Waiting 5 seconds for balance to be queryable...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Send USDC to admin address
  const transferResult = await serverWallet.sendUserOperation({
    to: USDC_ADDRESS as `0x${string}`, // Send to USDC contract
    value: 0n, // No ETH, just token transfer
    data: encodeUSDCTransfer(ADMIN_WALLET_ADDRESS as `0x${string}`, amount),
    network: 'base',
    paymasterUrl: 'https://api.developer.coinbase.com/rpc/v1/base/6DmPQTz8egifUIDdGm3wl4aoXAdYWw5H'
  });

  return transferResult;
}

/**
 * Encode USDC transfer calldata
 */
function encodeUSDCTransfer(to: string, amount: bigint): `0x${string}` {
  // ERC20 transfer function signature: transfer(address,uint256)
  const functionSignature = '0xa9059cbb';

  // Pad address to 32 bytes
  const paddedAddress = to.slice(2).padStart(64, '0');

  // Convert amount to hex and pad to 32 bytes
  const paddedAmount = amount.toString(16).padStart(64, '0');

  return `${functionSignature}${paddedAddress}${paddedAmount}` as `0x${string}`;
}

/**
 * Notify user about missing spend permission
 */
async function notifyUserMissingSpendPermission(partnerUserRef: string): Promise<void> {
  // TODO: Implement push notification
  console.log('📬 [SWEEP] Would send notification to user:', partnerUserRef);
  console.log('💬 [SWEEP] Message: Please complete wallet setup to enable automatic processing');
}
