/**
 * Server Wallet Management - SDK Version (Working)
 *
 * Uses CDP SDK directly for reliable operations.
 * This is the version used for actual sweep operations.
 */

import { CdpClient } from '@coinbase/cdp-sdk';

const SERVER_WALLET_NAME = process.env.SERVER_WALLET_NAME || 'server-spender-wallet-v2';

let serverWallet: any = null;

/**
 * Initialize server wallet using CDP SDK
 */
export async function initializeServerWallet(): Promise<string> {
  try {
    if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
      throw new Error('CDP_API_KEY_ID and CDP_API_KEY_SECRET required');
    }

    console.log('🔄 [SERVER WALLET SDK] Loading wallet by name:', SERVER_WALLET_NAME);

    const cdp = new CdpClient();

    // Get owner account first
    const ownerAccount = await cdp.evm.getAccount({
      name: `${SERVER_WALLET_NAME}-owner`
    });

    console.log('✅ [SERVER WALLET SDK] Owner account loaded:', ownerAccount.address);

    // Load smart account with name and owner
    serverWallet = await cdp.evm.getSmartAccount({
      name: SERVER_WALLET_NAME,
      owner: ownerAccount
    });

    console.log('✅ [SERVER WALLET SDK] Server wallet loaded:', serverWallet.address);

    return serverWallet.address;

  } catch (error) {
    console.error('❌ [SERVER WALLET SDK] Error loading server wallet:', error);
    throw error;
  }
}

/**
 * Get server wallet address
 */
export function getServerWalletAddress(): string {
  if (!serverWallet) {
    throw new Error('Server wallet not initialized. Call initializeServerWallet() first.');
  }
  return serverWallet.address;
}

/**
 * Get server wallet instance
 */
export function getServerWallet(): any {
  if (!serverWallet) {
    throw new Error('Server wallet not initialized. Call initializeServerWallet() first.');
  }
  return serverWallet;
}

export async function loadServerWallet(): Promise<any> {
  if (!serverWallet) {
    await initializeServerWallet();
  }
  return getServerWallet();
}
