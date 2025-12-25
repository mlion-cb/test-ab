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
 * Get server wallet instance with helper methods
 */
export function getServerWallet(): any {
  if (!serverWallet) {
    throw new Error('Server wallet not initialized. Call initializeServerWallet() first.');
  }

  // Wrap smart account with helper methods to match expected interface
  return {
    address: serverWallet.address,

    // Use spend permission - delegates to SDK method
    useSpendPermission: async (params: any) => {
      return await serverWallet.useSpendPermission(params);
    },

    // Send user operation - adapts to SDK's calls array format
    sendUserOperation: async (params: {
      to: string;
      value: bigint;
      data: string;
      network: string;
      paymasterUrl: string;
    }) => {
      // SDK expects calls array instead of individual to/value/data
      return await serverWallet.sendUserOperation({
        calls: [{
          to: params.to as `0x${string}`,
          value: params.value,
          data: params.data as `0x${string}`
        }],
        network: params.network,
        paymasterUrl: params.paymasterUrl
      });
    },

    // Wait for user operation - delegates to SDK method
    waitForUserOperation: async (result: any) => {
      return await serverWallet.waitForUserOperation(result);
    }
  };
}

export async function loadServerWallet(): Promise<any> {
  if (!serverWallet) {
    await initializeServerWallet();
  }
  return getServerWallet();
}
