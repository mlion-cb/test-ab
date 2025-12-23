/**
 * User Data API Client
 *
 * Functions to interact with backend user endpoints:
 * - checkUserExists(): Check if user has wallet + SP in Redis
 * - initializeUser(): Create wallet + SP and store in Redis
 */

/**
 * Check if user exists in backend and has valid wallet + SP
 * Returns:
 * - exists: true if user record exists in DB (even if incomplete)
 * - hasWalletAndSP: true only if BOTH walletAddress AND spendPermissionHash are populated
 * - needsInitialization: true if user exists but missing wallet/SP (partner use case)
 */
export async function checkUserExists(userId: string, accessToken: string): Promise<{
  exists: boolean;
  hasWalletAndSP: boolean;
  needsInitialization: boolean;
  data?: {
    walletAddress: string | null;
    spendPermissionHash: string | null;
    createdAt: number;
    updatedAt: number;
  };
}> {
  try {
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const response = await fetch(`${backendUrl}/user/${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      // User not found - first-time user, needs full initialization
      return {
        exists: false,
        hasWalletAndSP: false,
        needsInitialization: true
      };
    }

    if (!response.ok) {
      throw new Error(`Failed to check user: ${response.status}`);
    }

    const data = await response.json();

    // Check if BOTH wallet address AND SP hash are populated
    const hasWallet = !!data.walletAddress;
    const hasSP = !!data.spendPermissionHash;
    const hasWalletAndSP = hasWallet && hasSP;

    return {
      exists: true,
      hasWalletAndSP,
      needsInitialization: !hasWalletAndSP, // Needs init if missing either field
      data: {
        walletAddress: data.walletAddress || null,
        spendPermissionHash: data.spendPermissionHash || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    };
  } catch (error) {
    console.error('❌ [USER API] Error checking user:', error);
    throw error;
  }
}

/**
 * Initialize user (create wallet + SP, store in Redis)
 * Called after user accepts consent popup
 */
export async function initializeUser(
  userId: string,
  walletAddress: string,
  spendPermissionHash: string,
  accessToken: string
): Promise<{
  success: boolean;
  walletAddress: string;
  spendPermissionHash: string;
  isNewUser: boolean;
}> {
  try {
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const response = await fetch(`${backendUrl}/user/init`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        walletAddress,
        spendPermissionHash,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to initialize user: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ [USER API] Error initializing user:', error);
    throw error;
  }
}
