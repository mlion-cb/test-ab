/**
 * Debug script to see what the SDK actually sends
 */
import { CdpClient } from '@coinbase/cdp-sdk';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Enable SDK debugging
process.env.CDP_SDK_DEBUG = 'true';

async function debugSDKCall() {
  const cdp = new CdpClient({
    debugging: true  // Enable request/response logging
  });

  // Get server wallet
  const ownerAccount = await cdp.evm.getAccount({
    name: 'server-spender-wallet-v2-owner'
  });

  const serverWallet = await cdp.evm.getSmartAccount({
    name: 'server-spender-wallet-v2',
    owner: ownerAccount
  });

  console.log('Server wallet:', serverWallet.address);

  // Get permissions
  const result = await cdp.evm.listSpendPermissions({
    address: '0x9ac3188dE7B2f69Af9A107d4B278e794606781A8'
  });

  const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const validPermissions = result.spendPermissions.filter(p => {
    return p.permission.spender.toLowerCase() === serverWallet.address.toLowerCase() &&
           p.permission.token.toLowerCase() === USDC.toLowerCase() &&
           !p.revoked &&
           parseInt(p.permission.start) <= Math.floor(Date.now() / 1000);
  });

  validPermissions.sort((a, b) => parseInt(b.permission.start) - parseInt(a.permission.start));

  const perm = validPermissions[0];
  console.log('\nUsing permission:', perm.permissionHash);
  console.log('Permission details:');
  console.log(JSON.stringify(perm.permission, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2));

  console.log('\nAttempting to use spend permission with SDK...');

  try {
    const result = await serverWallet.useSpendPermission({
      spendPermission: perm.permission,
      value: 500000n,
      network: 'base',
      paymasterUrl: 'https://api.developer.coinbase.com/rpc/v1/base/6DmPQTz8egifUIDdGm3wl4aoXAdYWw5H'
    });

    console.log('✅ SDK call succeeded!');
    console.log('UserOpHash:', result.userOpHash);
  } catch (error: any) {
    console.log('❌ SDK call failed:', error.message);
    console.log('Full error:', error);
  }
}

debugSDKCall();
