/**
 * Compare SDK encoding vs our manual encoding
 */
import { CdpClient } from '@coinbase/cdp-sdk';
import dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config({ path: '.env.local' });

const SPEND_PERMISSION_MANAGER_ADDRESS = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Our manual encoding function (from testSpendPermissionNoSDK.ts)
function encodeSpendCall(spendPermission: any, value: bigint): string {
  const functionSelector = '0x96d373e5';
  const p = spendPermission.permission;

  const padAddress = (addr: string) => addr.slice(2).padStart(64, '0');
  const padUint = (num: string | bigint | number) => {
    const hex = typeof num === 'bigint' ? num.toString(16) : BigInt(num).toString(16);
    return hex.padStart(64, '0');
  };

  const tupleOffset = padUint(0x40);
  const valueEncoded = padUint(value);

  const account = padAddress(p.account);
  const spender = padAddress(p.spender);
  const token = padAddress(p.token);
  const allowance = padUint(p.allowance);
  const period = padUint(p.period);
  const start = padUint(p.start);
  const end = padUint(p.end);
  const salt = padUint(p.salt);

  const extraDataOffset = padUint(0x120);

  let extraDataEncoded = '';
  if (p.extraData && p.extraData !== '0x') {
    const extraDataBytes = p.extraData.slice(2);
    const extraDataLength = padUint(extraDataBytes.length / 2);
    extraDataEncoded = extraDataLength + extraDataBytes.padEnd(Math.ceil(extraDataBytes.length / 64) * 64, '0');
  } else {
    extraDataEncoded = padUint(0);
  }

  const callData = functionSelector +
    tupleOffset +
    valueEncoded +
    account +
    spender +
    token +
    allowance +
    period +
    start +
    end +
    salt +
    extraDataOffset +
    extraDataEncoded;

  return callData;
}

async function main() {
  const cdp = new CdpClient();

  // Get the same permission
  const result = await cdp.evm.listSpendPermissions({
    address: '0x9ac3188dE7B2f69Af9A107d4B278e794606781A8'
  });

  const validPermissions = result.spendPermissions.filter(p => {
    return p.permission.spender.toLowerCase() === '0xF6733167Edc02663c562f96612DcF9d98F2c0cdd'.toLowerCase() &&
           p.permission.token.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
           !p.revoked &&
           parseInt(p.permission.start) <= Math.floor(Date.now() / 1000);
  });

  validPermissions.sort((a, b) => parseInt(b.permission.start) - parseInt(a.permission.start));

  const perm = validPermissions[0];
  console.log('Testing with permission:', perm.permissionHash);
  console.log('\nPermission details:');
  console.log(JSON.stringify(perm.permission, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2));

  const amount = 500000n;

  // Our manual encoding
  const ourCallData = encodeSpendCall(perm, amount);

  console.log('\n🔧 OUR MANUAL ENCODING:');
  console.log('Length:', ourCallData.length);
  console.log('First 200 chars:', ourCallData.substring(0, 200));
  console.log('Last 200 chars:', ourCallData.substring(ourCallData.length - 200));

  // Now let's see what the SDK would encode
  // The SDK uses viem's encodeFunctionData
  const { encodeFunctionData } = await import('viem');

  const SPEND_PERMISSION_MANAGER_ABI = [
    {
      inputs: [
        {
          components: [
            { name: 'account', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'token', type: 'address' },
            { name: 'allowance', type: 'uint160' },
            { name: 'period', type: 'uint48' },
            { name: 'start', type: 'uint48' },
            { name: 'end', type: 'uint48' },
            { name: 'salt', type: 'uint256' },
            { name: 'extraData', type: 'bytes' }
          ],
          name: 'spendPermission',
          type: 'tuple'
        },
        { name: 'value', type: 'uint160' }
      ],
      name: 'spend',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    }
  ];

  const sdkCallData = encodeFunctionData({
    abi: SPEND_PERMISSION_MANAGER_ABI,
    functionName: 'spend',
    args: [perm.permission, amount]
  });

  console.log('\n🎯 SDK ENCODING (via viem):');
  console.log('Length:', sdkCallData.length);
  console.log('First 200 chars:', sdkCallData.substring(0, 200));
  console.log('Last 200 chars:', sdkCallData.substring(sdkCallData.length - 200));

  console.log('\n📊 COMPARISON:');
  if (ourCallData === sdkCallData) {
    console.log('✅ IDENTICAL! Our encoding matches the SDK perfectly!');
  } else {
    console.log('❌ DIFFERENT! Let\'s find where they differ...');
    console.log('\nFull comparison:');
    console.log('Ours:', ourCallData);
    console.log('SDK: ', sdkCallData);

    // Find first difference
    for (let i = 0; i < Math.min(ourCallData.length, sdkCallData.length); i++) {
      if (ourCallData[i] !== sdkCallData[i]) {
        console.log(`\nFirst difference at position ${i}:`);
        console.log(`Ours: ${ourCallData.substring(i, i + 20)}`);
        console.log(`SDK:  ${sdkCallData.substring(i, i + 20)}`);
        break;
      }
    }
  }
}

main().catch(console.error);
