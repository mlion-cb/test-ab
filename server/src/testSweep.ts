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
    network = 'base',
    txHash = '0xf7aa005cb079df18ab6a91d7b5dc69bedbd30a31e4c9e5de11a57caa843950ea' // Real confirmed Base mainnet transaction
  } = params;

  try {
    console.log('🧪 [TEST SWEEP] Starting manual sweep test...');
    console.log('📍 [TEST SWEEP] Destination:', destinationAddress);
    console.log('💰 [TEST SWEEP] Amount:', amount, 'USDC');
    console.log('🌐 [TEST SWEEP] Network:', network);

    // Call the regular sweep function
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
