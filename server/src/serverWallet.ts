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
 * The wallet uses CDP's name feature for persistence - no need to store address in .env!
 * Name: "server-spender-wallet"
 */

import { CdpClient } from '@coinbase/cdp-sdk';

const SERVER_WALLET_NAME = 'server-spender-wallet'; // Named wallet for persistence

let serverWallet: any = null;
let serverWalletAddress: string | null = null;

/**
 * Initialize server wallet (called on app startup)
 * Uses CDP's name feature - creates wallet with name if doesn't exist, loads if exists
 */
export async function initializeServerWallet(): Promise<string> {
  try {
    const cdp = new CdpClient();

    console.log('🔄 [SERVER WALLET] Checking for existing wallet with name:', SERVER_WALLET_NAME);

    try {
      // Try to load existing wallet by name
      const smartAccount = await cdp.evm.getSmartAccount({
        name: SERVER_WALLET_NAME
      });

      console.log('✅ [SERVER WALLET] Found existing wallet:', smartAccount.address);
      console.log('📛 [SERVER WALLET] Wallet name:', SERVER_WALLET_NAME);

      serverWallet = smartAccount;
      serverWalletAddress = smartAccount.address;

      return smartAccount.address;

    } catch (loadError) {
      // Wallet doesn't exist - create it with name
      console.log('ℹ️ [SERVER WALLET] No existing wallet found, creating new one...');

      // Create owner account (EOA) - this is just the owner, we won't use it directly
      const ownerAccount = await cdp.evm.createAccount();
      console.log('✅ [SERVER WALLET] Created owner account:', ownerAccount.address);

      // Create smart account with name
      const smartAccount = await cdp.evm.createSmartAccount({
        owner: ownerAccount,
        name: SERVER_WALLET_NAME // Use name for persistence
      });

      console.log('✅ [SERVER WALLET] Created server smart account:', smartAccount.address);
      console.log('📛 [SERVER WALLET] Wallet name:', SERVER_WALLET_NAME);
      console.log('💡 [SERVER WALLET] No need to store address - CDP manages it by name!');
      console.log('');

      // Store in memory for this session
      serverWallet = smartAccount;
      serverWalletAddress = smartAccount.address;

      return smartAccount.address;
    }

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
 * Load server wallet from CDP by name
 * No longer needed as initializeServerWallet() handles both create and load
 */
export async function loadServerWallet(): Promise<any> {
  try {
    console.log('🔄 [SERVER WALLET] Loading wallet by name:', SERVER_WALLET_NAME);

    const cdp = new CdpClient();

    // Fetch the existing smart account by name
    const smartAccount = await cdp.evm.getSmartAccount({
      name: SERVER_WALLET_NAME
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
