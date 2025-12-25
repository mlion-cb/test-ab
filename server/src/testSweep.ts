/**
 * Test Sweep Function
 *
 * Executes REAL production sweep flow for testing
 * Uses a real confirmed transaction so all steps execute properly
 */

import { executeSweep } from './sweepFunds.js';

interface TestSweepParams {
  destinationAddress: string;
  amount: string; // USDC amount as string (e.g., "0.500000")
  network?: string; // defaults to "base"
  txHash?: string; // Optional - will use real confirmed tx if not provided
}

/**
 * Execute test sweep using production flow
 */
export async function executeTestSweep(params: TestSweepParams): Promise<{ success: boolean; message: string }> {
  const {
    destinationAddress,
    amount,
    network = 'base-sepolia',
    txHash = '0x7d1e6e5d5ea1b4a3b614aef55a8f6d73078c0267215fc8ff0920ac45c07b8218' // Real confirmed Base Sepolia transaction
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
