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
 * Note: Store SERVER_WALLET_ADDRESS in .env after first creation
 */

import { CdpClient } from '@coinbase/cdp-sdk';

const SERVER_WALLET_NAME = 'server-spender-wallet'; // Named wallet for persistence
const STORED_ADDRESS = process.env.SERVER_WALLET_ADDRESS; // Address from .env

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
 * Load server wallet from CDP by address
 * No longer needed as initializeServerWallet() handles both create and load
 */
export async function loadServerWallet(): Promise<any> {
  if (!STORED_ADDRESS) {
    throw new Error('SERVER_WALLET_ADDRESS not set in environment');
  }

  try {
    console.log('🔄 [SERVER WALLET] Loading wallet by address:', STORED_ADDRESS);

    const cdp = new CdpClient();

    // Fetch the existing smart account by address
    const smartAccount = await cdp.evm.getSmartAccount({
      address: STORED_ADDRESS as `0x${string}`
    });

    console.log('✅ [SERVER WALLET] Wallet loaded successfully:', smartAccount.address);

    serverWallet = smartAccount;
    serverWalletAddress = smartAccount.address;
    return smartAccount;

  } catch (error) {
    console.error('❌ [SERVER WALLET] Error loading server wallet:', error);
    throw error;
  }
}
