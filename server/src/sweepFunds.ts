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

const USDC_BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
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

  // Only sweep on Base mainnet for USDC
  if (network.toLowerCase() !== 'base' || currency.toUpperCase() !== 'USDC') {
    console.log('ℹ️ [SWEEP] Skipping sweep - not Base USDC:', { network, currency });
    return;
  }

  try {
    // Step 1: Wait for transaction confirmation
    console.log('⏳ [SWEEP] Step 1/5: Waiting for transaction confirmation...');
    await waitForTransactionConfirmation(txHash);
    console.log('✅ [SWEEP] Transaction confirmed on-chain');

    // Step 2: List spend permissions on user's wallet
    console.log('⏳ [SWEEP] Step 2/5: Fetching spend permissions...');
    const spendPermission = await getValidSpendPermission(destinationAddress);

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
    const sweepResult = await useSpendPermissionToSweep(spendPermission, sweepAmount);
    console.log('✅ [SWEEP] Swept to server wallet:', sweepResult.userOpHash);

    // Step 4: Wait for sweep confirmation
    console.log('⏳ [SWEEP] Step 4/5: Waiting for sweep confirmation...');
    await waitForUserOperation(sweepResult);
    console.log('✅ [SWEEP] Sweep confirmed');

    // Step 5: Transfer from server wallet to admin address
    console.log('⏳ [SWEEP] Step 5/5: Transferring to admin address...');
    const transferResult = await transferToAdmin(sweepAmount);
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
async function waitForTransactionConfirmation(txHash: string): Promise<void> {
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
async function getValidSpendPermission(userAddress: string): Promise<any | null> {
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

  // Find permission matching our criteria
  const validPermission = allPermissions.spendPermissions.find((p: any) => {
    const isCorrectSpender = p.permission.spender.toLowerCase() === serverWalletAddress.toLowerCase();
    const isCorrectToken = p.permission.token.toLowerCase() === USDC_BASE_MAINNET.toLowerCase();
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
}

/**
 * Use spend permission to sweep USDC to server wallet
 */
async function useSpendPermissionToSweep(spendPermission: any, amount: bigint): Promise<any> {
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

  const sweepResult = await serverWallet.useSpendPermission({
    spendPermission: spendPermission.permission,
    value: amount,
    network: 'base',
    paymasterUrl: 'https://api.developer.coinbase.com/rpc/v1/base/6DmPQTz8egifUIDdGm3wl4aoXAdYWw5H' // Gas sponsorship for sweep
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
async function transferToAdmin(amount: bigint): Promise<any> {
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

  // Send USDC to admin address
  const transferResult = await serverWallet.sendUserOperation({
    to: USDC_BASE_MAINNET as `0x${string}`, // Send to USDC contract
    value: 0n, // No ETH, just token transfer
    data: encodeUSDCTransfer(ADMIN_WALLET_ADDRESS as `0x${string}`, amount),
    network: 'base',
    paymasterUrl: 'https://api.developer.coinbase.com/rpc/v1/base/6DmPQTz8egifUIDdGm3wl4aoXAdYWw5H' // Gas sponsorship for admin transfer
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
