/**
 * One-time script to create server wallet
 *
 * Creates a named Smart Account for sweep operations.
 * The wallet is saved by name in CDP, so you only need to set SERVER_WALLET_NAME in .env
 *
 * Usage:
 *   cd server
 *   npx tsx scripts/createServerWallet.ts
 */

import { CdpClient } from '@coinbase/cdp-sdk';

const SERVER_WALLET_NAME = process.env.SERVER_WALLET_NAME || 'server-spender-wallet-v2';

async function createServerWallet() {
  console.log('🔧 Creating server wallet...\n');

  const cdp = new CdpClient();

  // Step 1: Create owner account (EOA)
  console.log('1️⃣ Creating owner account...');
  const ownerAccount = await cdp.evm.createAccount({
    name: `${SERVER_WALLET_NAME}-owner`
  });
  console.log('✅ Owner account created:', ownerAccount.address);

  // Step 2: Create Smart Account with named owner
  console.log('2️⃣ Creating Smart Account with name:', SERVER_WALLET_NAME);
  const smartAccount = await cdp.evm.createSmartAccount({
    owner: ownerAccount,
    name: SERVER_WALLET_NAME
  });
  console.log('✅ Smart Account created:', smartAccount.address);

  // Step 3: Output instructions
  console.log('\n' + '='.repeat(80));
  console.log('📋 ADD THIS TO YOUR server/.env FILE:');
  console.log('='.repeat(80));
  console.log(`
SERVER_WALLET_NAME=${SERVER_WALLET_NAME}
SERVER_WALLET_ADDRESS=${smartAccount.address}

# Note: No private key needed! The wallet is persisted by name in CDP.
# Your CDP_API_KEY_ID and CDP_API_KEY_SECRET provide access.
  `);
  console.log('='.repeat(80));
  console.log('\n✅ Server wallet setup complete!');
  console.log('💡 The wallet is saved by name - you can load it anytime using the name.\n');
}

createServerWallet()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error creating server wallet:', error);
    process.exit(1);
  });
