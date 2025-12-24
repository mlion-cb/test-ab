/**
 * Server Wallet Management
 *
 * Manages the CDP Smart Account used as the spender for spend permissions.
 * This wallet sweeps USDC from user wallets and forwards to admin address.
 *
 * Flow:
 * 1. User creates SP with this wallet as spender (frontend)
 * 2. Webhook uses this wallet to sweep funds (useSpendPermission)
 * 3. This wallet transfers to admin address (sendUserOperation)
 *
 * Implementation:
 * - Uses CDP's name feature for persistence (no env variables needed!)
 * - Named owner: "server-spender-wallet-v2-owner"
 * - Named smart account: "server-spender-wallet-v2"
 * - Lazy-loaded on first use (doesn't block other endpoints)
 * - getOrCreateAccount/getOrCreateSmartAccount handle both creation and loading
 */

import { CdpClient } from '@coinbase/cdp-sdk';

const SERVER_WALLET_NAME = 'server-spender-wallet-v2'; // Named wallet for persistence (v2 to avoid conflicts with old setup)

let serverWallet: any = null;
let serverWalletAddress: string | null = null;

/**
 * Initialize server wallet (called on app startup)
 * Uses named owner + named smart account - both persist automatically!
 */
export async function initializeServerWallet(): Promise<string> {
  try {
    const cdp = new CdpClient();

    console.log('🔄 [SERVER WALLET] Initializing wallet with name:', SERVER_WALLET_NAME);

    // Get or create named owner account (persists by name!)
    const ownerAccount = await cdp.evm.getOrCreateAccount({
      name: SERVER_WALLET_NAME + '-owner'
    });
    console.log('✅ [SERVER WALLET] Owner account ready:', ownerAccount.address);

    // Get or create named smart account (persists by name!)
    const smartAccount = await cdp.evm.getOrCreateSmartAccount({
      owner: ownerAccount,
      name: SERVER_WALLET_NAME
      // Note: paymasterUrl must be passed to each operation (useSpendPermission, sendUserOperation)
    });

    console.log('✅ [SERVER WALLET] Server wallet ready:', smartAccount.address);
    console.log('📛 [SERVER WALLET] Wallet name:', SERVER_WALLET_NAME);
    console.log('💡 [SERVER WALLET] No env variables needed - persisted by name!');

    serverWallet = smartAccount;
    serverWalletAddress = smartAccount.address;

    return smartAccount.address;

  } catch (error) {
    console.error('❌ [SERVER WALLET] Error initializing server wallet:', error);
    throw error;
  }
}

/**
 * Get server wallet instance
 * Must call initializeServerWallet() first
 */
export function getServerWallet(): any {
  if (!serverWallet) {
    throw new Error('Server wallet not initialized. Call initializeServerWallet() first.');
  }
  return serverWallet;
}

/**
 * Get server wallet address
 */
export function getServerWalletAddress(): string {
  if (!serverWalletAddress) {
    throw new Error('Server wallet not initialized. Call initializeServerWallet() first.');
  }
  return serverWalletAddress;
}

/**
 * Load server wallet - calls initializeServerWallet
 * No longer needed as standalone function
 */
export async function loadServerWallet(): Promise<any> {
  if (!serverWallet) {
    await initializeServerWallet();
  }
  return serverWallet;
}
