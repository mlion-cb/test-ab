/**
 * User Data Helper Functions
 *
 * Stores and retrieves user wallet data from Redis:
 * - walletAddress: User's smart account address (works on all EVM networks)
 * - spendPermissionHash: Hash of spend permission for sweep operations
 *   - Always for Base mainnet USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
 *   - Allowance: 10,000 USDC per week
 * - createdAt: Timestamp when user was first initialized
 * - updatedAt: Timestamp of last update
 *
 * Storage key pattern: user:{userId}
 */

import { database, useDatabase } from './app.js';

// In-memory fallback for local dev (no Redis)
const userDataStore = new Map<string, any>();

export interface UserData {
  userId: string;
  walletAddress: string;
  spendPermissionHash: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Check if user exists in database
 */
export async function userExists(userId: string): Promise<boolean> {
  if (useDatabase && database) {
    const data = await database.get(`user:${userId}`);
    return !!data;
  } else {
    return userDataStore.has(userId);
  }
}

/**
 * Get user data from database
 */
export async function getUserData(userId: string): Promise<UserData | null> {
  if (useDatabase && database) {
    const data = await database.get(`user:${userId}`);
    return data ? JSON.parse(data) : null;
  } else {
    return userDataStore.get(userId) || null;
  }
}

/**
 * Save user data to database
 */
export async function saveUserData(userData: UserData): Promise<void> {
  if (useDatabase && database) {
    await database.set(`user:${userData.userId}`, JSON.stringify(userData));
  } else {
    userDataStore.set(userData.userId, userData);
  }
}

/**
 * Update user data (partial update)
 */
export async function updateUserData(userId: string, updates: Partial<Omit<UserData, 'userId'>>): Promise<UserData | null> {
  const existing = await getUserData(userId);
  if (!existing) {
    return null;
  }

  const updated: UserData = {
    ...existing,
    ...updates,
    updatedAt: Date.now()
  };

  await saveUserData(updated);
  return updated;
}

/**
 * Delete user data from database
 */
export async function deleteUserData(userId: string): Promise<void> {
  if (useDatabase && database) {
    await database.del(`user:${userId}`);
  } else {
    userDataStore.delete(userId);
  }
}
