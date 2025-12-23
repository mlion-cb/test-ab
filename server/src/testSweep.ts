/**
 * Test Sweep Function
 *
 * Simplified sweep for manual testing - skips SP validation checks
 * Assumes SP already exists for testnet
 */

import { executeSweep } from './sweepFunds.js';

interface TestSweepParams {
  destinationAddress: string;
  amount: string; // USDC amount as string (e.g., "100.000000")
  network?: string; // defaults to "base-sepolia"
  txHash?: string; // Optional - will use mock if not provided
}

/**
 * Execute test sweep with mock/minimal validation
 */
export async function executeTestSweep(params: TestSweepParams): Promise<{ success: boolean; message: string }> {
  const {
    destinationAddress,
    amount,
    network = 'base-sepolia',
    txHash = '0x' + '0'.repeat(64) // Mock txHash for testing
  } = params;

  try {
    console.log('🧪 [TEST SWEEP] Starting manual sweep test...');
    console.log('📍 [TEST SWEEP] Destination:', destinationAddress);
    console.log('💰 [TEST SWEEP] Amount:', amount, 'USDC');
    console.log('🌐 [TEST SWEEP] Network:', network);

    // Call the regular sweep function
    // Note: For testnet, we'll use base-sepolia
    await executeSweep({
      txHash,
      destinationAddress,
      network,
      amount,
      currency: 'USDC',
      partnerUserRef: 'test-user' // Mock user ref
    });

    console.log('✅ [TEST SWEEP] Test sweep completed successfully');

    return {
      success: true,
      message: 'Test sweep completed successfully'
    };

  } catch (error) {
    console.error('❌ [TEST SWEEP] Test sweep failed:', error);

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Test sweep failed'
    };
  }
}
