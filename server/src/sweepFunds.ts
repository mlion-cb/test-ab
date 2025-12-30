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
    const validPermissions = await getAllValidSpendPermissions(destinationAddress, network);

    if (validPermissions.length === 0) {
      // No valid SP found - log and notify user
      console.error('❌ [SWEEP] No valid spend permission found');
      console.error('📋 [SWEEP] User needs to complete consent flow');

      // TODO: Send push notification to user
      await notifyUserMissingSpendPermission(partnerUserRef);

      return; // Cannot sweep without SP
    }

    console.log(`✅ [SWEEP] Found ${validPermissions.length} valid spend permission(s)`);

    // Step 3: Try each valid spend permission until one succeeds
    console.log('⏳ [SWEEP] Step 3/5: Sweeping USDC to server wallet...');
    const sweepAmount = parseUnits(amount, 6); // USDC has 6 decimals

    let sweepResult = null;
    let successfulPermission = null;

    for (let i = 0; i < validPermissions.length; i++) {
      const spendPermission = validPermissions[i];
      console.log(`\n🔄 [SWEEP] Trying permission ${i + 1}/${validPermissions.length}:`);
      console.log(`📋 [SWEEP] Hash: ${spendPermission.permissionHash}`);
      console.log(`🔐 [SWEEP] Details:`, {
        spender: spendPermission.permission.spender,
        token: spendPermission.permission.token,
        allowance: spendPermission.permission.allowance
      });

      try {
        sweepResult = await useSpendPermissionToSweep(spendPermission, sweepAmount, network);
        successfulPermission = spendPermission;
        console.log(`✅ [SWEEP] SUCCESS with permission ${i + 1}! UserOpHash:`, sweepResult.userOpHash);
        console.log(`✅ [SWEEP] Successful permission hash: ${spendPermission.permissionHash}`);
        break; // Stop trying once we succeed
      } catch (error: any) {
        console.error(`❌ [SWEEP] FAILED with permission ${i + 1}:`, error.message);
        console.error(`❌ [SWEEP] Failed permission hash: ${spendPermission.permissionHash}`);

        if (i < validPermissions.length - 1) {
          console.log(`🔄 [SWEEP] Trying next permission...\n`);
        } else {
          console.error(`❌ [SWEEP] All ${validPermissions.length} permissions failed!`);
          throw new Error(`All valid spend permissions failed. Last error: ${error.message}`);
        }
      }
    }

    if (!sweepResult || !successfulPermission) {
      throw new Error('Failed to sweep with any valid spend permission');
    }

    console.log('\n✅ [SWEEP] Swept to server wallet:', sweepResult.userOpHash);

    // Step 4: Wait for sweep confirmation
    console.log('⏳ [SWEEP] Step 4/5: Waiting for sweep confirmation...');
    await waitForUserOperation(sweepResult);
    console.log('✅ [SWEEP] Sweep confirmed');

    // Optional: Transfer from server wallet to admin address
    const SKIP_ADMIN_TRANSFER = process.env.SKIP_ADMIN_TRANSFER === 'true';

    if (SKIP_ADMIN_TRANSFER) {
      console.log('⏭️  [SWEEP] Skipping admin transfer (SKIP_ADMIN_TRANSFER=true)');
      console.log('✅ [SWEEP] Sweep complete - USDC remains in server wallet');
      return;
    }

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
 * Get ALL valid spend permissions for server wallet
 * Validates: spender, token (USDC), not revoked, active
 * Returns array of all matching permissions
 */
async function getAllValidSpendPermissions(userAddress: string, network: string = 'base'): Promise<any[]> {
  const cdp = new CdpClient();

  // List all spend permissions on user's wallet
  const allPermissions = await cdp.evm.listSpendPermissions({
    address: userAddress as `0x${string}`
  });

  console.log('📋 [SWEEP] Found', allPermissions.spendPermissions.length, 'total permissions');
  console.log('📋 [SWEEP] User address:', userAddress);

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
  console.log('🔐 [SWEEP] Looking for USDC token:', USDC_ADDRESS);

  // Log all permissions in detail
  console.log('\n📋 [SWEEP] === ALL SPEND PERMISSIONS ===');
  allPermissions.spendPermissions.forEach((p: any, index: number) => {
    const isCorrectSpender = p.permission.spender.toLowerCase() === serverWalletAddress.toLowerCase();
    const isCorrectToken = p.permission.token.toLowerCase() === USDC_ADDRESS.toLowerCase();
    const isNotRevoked = !p.revoked;
    const isActive = parseInt(p.permission.start) <= Math.floor(Date.now() / 1000);

    console.log(`\n🔍 [SWEEP] Permission #${index + 1}:`);
    console.log(`  Hash: ${p.permissionHash}`);
    console.log(`  Spender: ${p.permission.spender} ${isCorrectSpender ? '✅ MATCH' : '❌'}`);
    console.log(`  Token: ${p.permission.token} ${isCorrectToken ? '✅ MATCH' : '❌'}`);
    console.log(`  Revoked: ${p.revoked} ${isNotRevoked ? '✅ ACTIVE' : '❌ REVOKED'}`);
    console.log(`  Start: ${p.permission.start} ${isActive ? '✅ ACTIVE' : '⏳ FUTURE'}`);
    console.log(`  Allowance: ${p.permission.allowance}`);
    console.log(`  Network: ${p.network}`);
    console.log(`  VALID: ${isCorrectSpender && isCorrectToken && isNotRevoked && isActive ? '✅ YES' : '❌ NO'}`);
  });
  console.log('\n📋 [SWEEP] === END OF PERMISSIONS ===\n');

  // Find ALL permissions matching our criteria
  const validPermissions = allPermissions.spendPermissions.filter((p: any) => {
    const isCorrectSpender = p.permission.spender.toLowerCase() === serverWalletAddress.toLowerCase();
    const isCorrectToken = p.permission.token.toLowerCase() === USDC_ADDRESS.toLowerCase();
    const isNotRevoked = !p.revoked;
    const isActive = parseInt(p.permission.start) <= Math.floor(Date.now() / 1000);

    return isCorrectSpender && isCorrectToken && isNotRevoked && isActive;
  });

  if (validPermissions.length > 0) {
    console.log(`✅ [SWEEP] FOUND ${validPermissions.length} VALID PERMISSION(S):`);
    validPermissions.forEach((p: any, index: number) => {
      console.log(`   ${index + 1}. ${p.permissionHash}`);
    });
  } else {
    console.log('❌ [SWEEP] NO VALID PERMISSIONS FOUND');
  }

  return validPermissions;
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
