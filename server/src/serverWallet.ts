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
 * Loads by address if in .env, otherwise creates new one
 */
export async function initializeServerWallet(): Promise<string> {
  try {
    const cdp = new CdpClient();

    // If address exists in env, try to load it
    if (STORED_ADDRESS) {
      console.log('🔄 [SERVER WALLET] Loading existing wallet from address:', STORED_ADDRESS);

      try {
        const smartAccount = await cdp.evm.getSmartAccount({
          address: STORED_ADDRESS as `0x${string}`
        });

        console.log('✅ [SERVER WALLET] Wallet loaded successfully');
        console.log('📛 [SERVER WALLET] Name:', SERVER_WALLET_NAME);

        serverWallet = smartAccount;
        serverWalletAddress = smartAccount.address;

        return smartAccount.address;

      } catch (loadError: any) {
        console.error('❌ [SERVER WALLET] Failed to load wallet from env:', loadError.message);
        throw new Error('SERVER_WALLET_ADDRESS in .env is invalid or wallet no longer exists');
      }
    }

    // No address in env - create new wallet
    console.log('ℹ️ [SERVER WALLET] No SERVER_WALLET_ADDRESS in .env, creating new wallet...');
    console.log('📛 [SERVER WALLET] Name:', SERVER_WALLET_NAME);

    // Create owner account (EOA)
    const ownerAccount = await cdp.evm.createAccount();
    console.log('✅ [SERVER WALLET] Created owner account:', ownerAccount.address);

    // Create smart account with name
    const smartAccount = await cdp.evm.createSmartAccount({
      owner: ownerAccount,
      name: SERVER_WALLET_NAME
    });

    console.log('✅ [SERVER WALLET] Created server smart account:', smartAccount.address);
    console.log('');
    console.log('⚠️  IMPORTANT: Add this to your .env file:');
    console.log('⚠️  SERVER_WALLET_ADDRESS=' + smartAccount.address);
    console.log('');

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
