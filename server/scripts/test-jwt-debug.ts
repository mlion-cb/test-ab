import { generateJwt } from '@coinbase/cdp-sdk/auth';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function test() {
  console.log('ENV CHECK:');
  console.log('CDP_API_KEY_ID:', process.env.CDP_API_KEY_ID?.substring(0, 20) + '...');
  console.log('CDP_API_KEY_SECRET length:', process.env.CDP_API_KEY_SECRET?.length);

  const jwt = await generateJwt({
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    requestMethod: 'GET',
    requestHost: 'api.cdp.coinbase.com',
    requestPath: '/v2/evm/smart-accounts/0x9ac3188dE7B2f69Af9A107d4B278e794606781A8/spend-permissions/list',
    expiresIn: 120
  });

  console.log('\nJWT generated successfully:', jwt.substring(0, 50) + '...');

  // Now test the API call
  const response = await fetch('https://api.cdp.coinbase.com/platform/v2/evm/smart-accounts/0x9ac3188dE7B2f69Af9A107d4B278e794606781A8/spend-permissions/list', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    }
  });

  console.log('\nAPI Response status:', response.status);
  const text = await response.text();
  console.log('API Response:', text.substring(0, 200));
}

test();
