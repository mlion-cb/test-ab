/**
 * ============================================================================
 * HOME/INDEX - MAIN ONRAMP PAGE (Tab 1)
 * ============================================================================
 *
 * This is the main page where users purchase crypto. It coordinates:
 * - OnrampForm component (user input)
 * - useOnramp hook (API calls)
 * - ApplePayWidget component (payment processing)
 * - Wallet connection state
 *
 * ADDRESS STATE MANAGEMENT (Critical for UX):
 *
 * Three address-related states:
 * 1. address: Current form input (what user sees in form)
 * 2. connectedAddress: Wallet connection status (for "Connected" button)
 * 3. isConnected: Derived boolean (has ANY wallet, regardless of network support)
 *
 * Why separate states?
 * - address: Can be empty for unsupported networks (Bitcoin in prod)
 * - connectedAddress: Still valid (user HAS a wallet, just wrong type)
 * - isConnected: Shows "Connected" button (user is signed in with wallet)
 *
 * Example:
 * - User has EVM wallet, selects Bitcoin network
 * - address: "" (no EVM wallet works for Bitcoin)
 * - connectedAddress: "0x1234..." (still has EVM wallet)
 * - isConnected: true (shows "Connected" button, not "Connect Wallet")
 *
 * NETWORK POLLING (200ms interval):
 *
 * Polls getCurrentNetwork() to detect changes from OnrampForm:
 * 1. Form dropdown changes network
 * 2. setCurrentNetwork() called in sharedState
 * 3. Polling detects change (trackedNetwork !== currentNetwork)
 * 4. Calls getCurrentWalletAddress() for new network
 * 5. Updates address and connectedAddress
 *
 * Why polling instead of callback?
 * - Shared state is global (not React state)
 * - Multiple components can change network
 * - Polling ensures all components stay in sync
 * - 200ms is fast enough for real-time feel, low overhead
 *
 * PHONE VERIFICATION FLOW (Apple Pay only):
 *
 * Decision tree for submission:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ User clicks "Swipe to Deposit"                              │
 * │   ↓                                                         │
 * │ Payment method?                                             │
 * │   ├─ Widget → createWidgetSession() → Browser (NO PHONE)   │
 * │   └─ Apple Pay → Check phone verification:                 │
 * │       ├─ Sandbox → Use mock phone (+12345678901)           │
 * │       └─ Production:                                        │
 * │           ├─ Has fresh phone? → createOrder()              │
 * │           └─ No phone? → setPendingForm() → /phone-verify  │
 * └─────────────────────────────────────────────────────────────┘
 *
 * PENDING FORM RESUMPTION:
 *
 * When user returns from phone verification:
 * 1. useFocusEffect detects tab focus
 * 2. Checks getPendingForm() for saved form data
 * 3. If Widget: Creates session immediately (no phone needed)
 * 4. If Apple Pay: Verifies phone is fresh, then creates order
 * 5. Clears pending form to prevent re-processing
 *
 * WALLET INITIALIZATION (Multiple sources):
 *
 * CDP wallets can come from multiple sources:
 * - currentUser.evmAccounts[0]: EOA (Externally Owned Account)
 * - currentUser.evmSmartAccounts[0]: Smart Account (Account Abstraction)
 * - currentUser.solanaAccounts[0]: Solana account
 * - evmAddress hook: Fallback EVM address
 * - solanaAddress hook: Fallback Solana address
 *
 * Priority for setting shared state:
 * EVM: evmEOA > evmSmartAccount > evmAddress hook
 * SOL: solanaAccounts[0] > solanaAddress hook
 *
 * This runs in multiple useEffects to handle:
 * - Initial load (may take 5s for wallet creation)
 * - Tab focus (user might verify in another tab)
 * - Network changes (switch between EVM/SOL)
 *
 * @see components/onramp/OnrampForm.tsx for form UI
 * @see components/onramp/ApplePayWidget.tsx for payment WebView
 * @see hooks/useOnramp.ts for API calls
 * @see utils/sharedState.ts for address resolution
 */

import { useCurrentUser, useEvmAddress, useIsSignedIn, useSignOut, useSolanaAddress, useCreateSpendPermission, useGetAccessToken } from "@coinbase/cdp-hooks";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { ApplePayWidget, ConsentPopup, OnrampForm, useOnramp } from "../../components";
import { CoinbaseAlert } from "../../components/ui/CoinbaseAlerts";
import { COLORS } from "../../constants/Colors";
import { BASE_URL } from "../../constants/BASE_URL";
import { clearPhoneVerifyWasCanceled, getCountry, getCurrentNetwork, getCurrentPartnerUserRef, getCurrentWalletAddress, getPendingForm, getPhoneVerifyWasCanceled, getSandboxMode, getSubdivision, getTestWalletEvm, getTestWalletSol, getVerifiedPhone, isPhoneFresh60d, isTestSessionActive, setCurrentSolanaAddress, setCurrentWalletAddress, setPendingForm } from "../../utils/sharedState";
import { TEST_ACCOUNTS } from "../../constants/TestAccounts";


const { BLUE, DARK_BG, CARD_BG, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, WHITE } = COLORS;

function generateMockAddress(): string {
  const hexChars = "0123456789abcdef";
  let result = "0x";
  for (let i = 0; i < 40; i++) {
    const idx = Math.floor(Math.random() * hexChars.length);
    result += hexChars[idx];
  }
  return result;
}

export default function Index() {
  const [address, setAddress] = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [amount, setAmount] = useState("");
  const router = useRouter();
  const pendingForm = getPendingForm();

  // Store current transaction details for alert messages
  const [currentTransaction, setCurrentTransaction] = useState<{
    amount: string;
    paymentCurrency: string;
    asset: string;
    network: string;
  } | null>(null);

  // Consent popup state
  const [showConsentPopup, setShowConsentPopup] = useState(false);
  const [isCreatingSpendPermission, setIsCreatingSpendPermission] = useState(false);
  const [userHasWalletAndSP, setUserHasWalletAndSP] = useState<boolean | null>(null); // null = not checked, true = has both, false = needs initialization
  const [pendingFormData, setPendingFormData] = useState<any>(null); // Store form data while waiting for consent




  // Check for test session first
  const testSession = isTestSessionActive();

  // CDP hooks (overridden for test session)
  const { isSignedIn } = useIsSignedIn();
  const { currentUser } = useCurrentUser();
  const { evmAddress: cdpEvmAddress } = useEvmAddress();
  const { solanaAddress: cdpSolanaAddress } = useSolanaAddress();
  const { signOut } = useSignOut();
  const { getAccessToken } = useGetAccessToken();
  const { createSpendPermission, status: spStatus, data: spData } = useCreateSpendPermission();
  const [connectedAddress, setConnectedAddress] = useState('');

  // Override addresses for test session
  const evmAddress = testSession ? getTestWalletEvm() : cdpEvmAddress;
  const solanaAddress = testSession ? getTestWalletSol() : cdpSolanaAddress;

  // Wallet is connected if user has ANY wallet (EVM or SOL), regardless of current network
  const hasEvmWallet = testSession ? !!getTestWalletEvm() : !!(currentUser?.evmAccounts?.[0] || currentUser?.evmSmartAccounts?.[0] || evmAddress);
  const hasSolWallet = testSession ? !!getTestWalletSol() : !!(currentUser?.solanaAccounts?.[0] || solanaAddress);
  const effectiveIsSignedIn = testSession || isSignedIn;
  const isConnected = effectiveIsSignedIn && (hasEvmWallet || hasSolWallet);

  const [trackedNetwork, setTrackedNetwork] = useState(getCurrentNetwork());

  // Initialize on mount AND when test session changes
  useEffect(() => {
    const walletAddress = getCurrentWalletAddress();
    if (walletAddress) {
      setConnectedAddress(walletAddress);
      setAddress(walletAddress);
    }
  }, [testSession]); // Re-run when test session changes

  // Watch for network changes and update address accordingly
  useEffect(() => {
    const interval = setInterval(() => {
      const currentNetwork = getCurrentNetwork();
      if (currentNetwork !== trackedNetwork) {
        setTrackedNetwork(currentNetwork);

        // getCurrentWalletAddress() handles the logic for both modes:
        // - Sandbox: manual > wallet (network-aware)
        // - Production: wallet only (network-aware), null for unsupported networks
        const walletAddress = getCurrentWalletAddress();
        if (walletAddress) {
          setConnectedAddress(walletAddress);
          setAddress(walletAddress);
        } else {
          // No address available for this network (e.g., unsupported network in prod)
          setConnectedAddress('');
          setAddress('');
        }
      }
    }, 200); // Poll every 200ms for network changes

    return () => clearInterval(interval);
  }, [trackedNetwork]);

  // Watch for wallet address changes when user is signed in or when addresses load
  useEffect(() => {
    const walletAddress = getCurrentWalletAddress();

    if (effectiveIsSignedIn && walletAddress) {
      // User is signed in and we have an address - update if different
      setConnectedAddress(prev => prev !== walletAddress ? walletAddress : prev);
      setAddress(prev => prev !== walletAddress ? walletAddress : prev);
    } else if (!effectiveIsSignedIn) {
      // User signed out, clear addresses
      setConnectedAddress('');
      setAddress('');
    }
  }, [effectiveIsSignedIn, currentUser, evmAddress, solanaAddress]);

  useFocusEffect(
    useCallback(() => {
      const walletAddress = getCurrentWalletAddress();
      setConnectedAddress(walletAddress ?? '');
      // Always update address on focus (important for test account returning from verification)
      if (walletAddress) {
        setAddress(walletAddress);
      }
    }, [])
  );

  // Update shared state and local state when CDP wallet addresses load
  useEffect(() => {
    if (!effectiveIsSignedIn) return;

    // Skip CDP polling for test session (addresses already set)
    if (testSession) {
      const walletAddress = getCurrentWalletAddress();
      if (walletAddress) {
        setConnectedAddress(walletAddress);
        if (!address) setAddress(walletAddress);
      }
      return;
    }

    // Get addresses from CDP hooks
    const evmSmartAccount = currentUser?.evmSmartAccounts?.[0] as string;
    const evmEOA = currentUser?.evmAccounts?.[0] as string || evmAddress;
    const solAccount = currentUser?.solanaAccounts?.[0] as string || solanaAddress;

    // Set in shared state (so getCurrentWalletAddress works)
    // IMPORTANT: Prioritize Smart Account over EOA for onramp (balances are in Smart Account)
    const primaryEvmAddress = evmSmartAccount || evmEOA;
    if (primaryEvmAddress) {
      setCurrentWalletAddress(primaryEvmAddress);
    }
    if (solAccount) {
      setCurrentSolanaAddress(solAccount);
    }

    // Get network-aware wallet address from shared state
    const walletAddress = getCurrentWalletAddress();

    if (walletAddress) {
      setConnectedAddress(walletAddress);
      if (!address) setAddress(walletAddress);
      return;
    }

    // Poll if not found immediately
    let tries = 0;
    const t = setInterval(() => {
      const polledAddress = getCurrentWalletAddress();

      if (polledAddress) {
        setConnectedAddress(polledAddress);
        if (!address) setAddress(polledAddress);
        clearInterval(t);
      }
      if (++tries > 10) clearInterval(t); // Reduce to 5s max
    }, 500);

    return () => clearInterval(t);
  }, [effectiveIsSignedIn, testSession, currentUser, evmAddress, solanaAddress]);

  useFocusEffect(
    useCallback(() => {
      // Check wallet status when tab becomes active - network-aware
      if (effectiveIsSignedIn) {
        const walletAddress = getCurrentWalletAddress();

        if (walletAddress) {
          setConnectedAddress(walletAddress);
          if (!address) setAddress(walletAddress);
        }
      } else {
        setConnectedAddress('');
      }
    }, [effectiveIsSignedIn, currentUser, address, evmAddress, solanaAddress])
  );

  

  useFocusEffect(
    useCallback(() => {
      setAddress(getCurrentWalletAddress() ?? "");
    }, [])
  );


  const [applePayAlert, setApplePayAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
    navigationPath?: string;
    onConfirmCallback?: () => Promise<void> | void;
    onCancelCallback?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    navigationPath: undefined,
    onConfirmCallback: undefined,
    onCancelCallback: undefined
  });


  const {
    createOrder,
    createWidgetSession,
    closeApplePay,
    options,
    isLoadingOptions,
    optionsError,
    getAvailableNetworks,
    getAvailableAssets,
    fetchOptions,
    currentQuote,
    isLoadingQuote,
    fetchQuote,
    applePayVisible,
    hostedUrl,
    isProcessingPayment,
    setTransactionStatus,
    setIsProcessingPayment,
    paymentCurrencies,
    buyConfig,
    getNetworkNameFromDisplayName,
    getAssetSymbolFromName
  } = useOnramp();

  // Refetch options is handled on screen focus and within OnrampForm when needed

  // Track region changes and refetch buy options
  const [lastRegion, setLastRegion] = useState(() => `${getCountry()}-${getSubdivision()}`);

  // Poll for region changes (detects changes from OnrampForm selectors)
  useEffect(() => {
    const intervalId = setInterval(() => {
      const currentRegion = `${getCountry()}-${getSubdivision()}`;
      if (currentRegion !== lastRegion) {
        console.log('🌍 Region changed, refetching buy options:', { from: lastRegion, to: currentRegion });
        setLastRegion(currentRegion);
        if (effectiveIsSignedIn) {
          fetchOptions();
        }
      }
    }, 500); // Check every 500ms

    return () => clearInterval(intervalId);
  }, [lastRegion, effectiveIsSignedIn, fetchOptions]);

  // Fetch options on component mount (only when signed in)
  useFocusEffect(
    useCallback(() => {
      if (effectiveIsSignedIn) {
        fetchOptions(); // only refetch options on focus when logged in
      }
      if (getPhoneVerifyWasCanceled()) {
        setIsProcessingPayment(false); // reset slider
        clearPhoneVerifyWasCanceled();
      }
    }, [fetchOptions, setIsProcessingPayment, effectiveIsSignedIn])
  );

  // 1) Resume after returning to this tab
  useFocusEffect(
    useCallback(() => {
      if (!pendingForm) return;

      const handlePendingForm = async () => {
        try {
          // If pending was for Coinbase Widget, do it immediately (no phone gate)
          if ((pendingForm.paymentMethod || '').toUpperCase() === 'COINBASE_WIDGET') {
            console.log('📤 [PENDING FORM] Processing Coinbase Widget pending form');
            (async () => {
              const url = await createWidgetSession(pendingForm);
              if (url) {
                Linking.openURL(url);
                setPendingForm(null);
              }
            })();
            return;
          }

          // Apple Pay path - wait for user to be signed in before proceeding
          if (!effectiveIsSignedIn) {
            return; // Wait for next render when user is signed in
          }

          // Apple Pay path still requires fresh phone
          const isSandbox = getSandboxMode();
          const phoneFresh = isPhoneFresh60d();
          const verifiedPhone = getVerifiedPhone();

          if (isSandbox || (phoneFresh && verifiedPhone)) {
            const phone = verifiedPhone;

            // CRITICAL: Convert display names to API format (e.g., "Base" → "base", "USD Coin" → "USDC")
            // This is the same conversion that happens in handleSubmit but was missing here
            const networkApiName = getNetworkNameFromDisplayName(pendingForm.network);
            const assetApiName = getAssetSymbolFromName(pendingForm.asset);

            // Determine the correct address based on network type for pending form
            let targetAddress = pendingForm.address;
            if (!isSandbox) {
              const networkType = networkApiName.toLowerCase();
              const isEvmNetwork = ['ethereum', 'base', 'unichain', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'avax', 'bsc', 'fantom', 'linea', 'zksync', 'scroll'].some(k => networkType.includes(k));
              const isSolanaNetwork = ['solana', 'sol'].some(k => networkType.includes(k));

              if (isEvmNetwork) {
                const evmEOA = currentUser?.evmAccounts?.[0] as string || evmAddress;
                const evmSmart = currentUser?.evmSmartAccounts?.[0] as string;
                // Prioritize Smart Account for onramp (balances stored there)
                targetAddress = evmSmart || evmEOA || targetAddress;
              } else if (isSolanaNetwork) {
                const solAccount = currentUser?.solanaAccounts?.[0] as string || solanaAddress;
                targetAddress = solAccount || targetAddress;
              }
            }

            // Update form data with converted API names and correct address
            const updatedFormData = {
              ...pendingForm,
              network: networkApiName,
              asset: assetApiName,
              phoneNumber: phone,
              address: targetAddress
            };

            // Store transaction details for alert messages
            setCurrentTransaction({
              amount: updatedFormData.amount,
              paymentCurrency: updatedFormData.paymentCurrency || 'USD',
              asset: assetApiName,
              network: networkApiName
            });

            createOrder(updatedFormData);
            setPendingForm(null);
          }
        } catch (error) {
          setPendingForm(null); // Clear pending form on error
          setApplePayAlert({
            visible: true,
            title: 'Transaction Failed',
            message: error instanceof Error ? error.message : 'Unable to create transaction. Please try again.',
            type: 'error'
          });
        }
      };
      handlePendingForm();
    }, [pendingForm, createOrder, createWidgetSession, getNetworkNameFromDisplayName, getAssetSymbolFromName, currentUser, evmAddress, solanaAddress, effectiveIsSignedIn])
  );

  // User check moved to handleSubmit - only check when user actually tries to submit

  // Handle consent accept: Create SP and store in Redis
  const handleConsentAccept = useCallback(async () => {
    try {
      setIsCreatingSpendPermission(true);

      // For partners with existing auth: Configure CDP with custom JWT provider
      // ================================================================
      // In _layout.tsx or App config:
      // <CdpProvider
      //   config={{
      //     projectId: 'your-project-id',
      //     customAuth: {
      //       getJwt: async () => {
      //         // Return JWT from YOUR auth system
      //         const token = await yourAuthService.getAccessToken();
      //         return token; // or undefined if not authenticated
      //       }
      //     },
      //     ethereum: {
      //       createOnLogin: 'smart',
      //       enableSpendPermissions: true,
      //     }
      //   }}
      // >
      //
      // Then after user accepts consent, authenticate with CDP:
      // import { useAuthenticateWithJWT } from '@coinbase/cdp-hooks';
      //
      // const { authenticateWithJWT, isLoading } = useAuthenticateWithJWT();
      //
      // // This creates/loads the embedded wallet automatically
      // await authenticateWithJWT();
      //
      // // Wallet is now available via CDP hooks
      // const { currentUser } = useCurrentUser();
      // const smartAccountAddress = currentUser?.evmSmartAccounts?.[0];
      // ================================================================

      // Get Smart Account address (must be Smart Account, not EOA)
      const smartAccountAddress = currentUser?.evmSmartAccounts?.[0] as string;

      if (!smartAccountAddress) {
        throw new Error('No Smart Account found. Please ensure your account has spend permissions enabled.');
      }

      // Fetch server wallet address (initializes wallet if needed)
      // This is when the server wallet is created - ONLY when user gives consent!
      console.log('🔄 [CONSENT] Fetching server wallet address...');
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('No access token available');
      }

      console.log('🔄 [CONSENT] Backend URL:', BASE_URL);
      console.log('🔄 [CONSENT] Calling:', `${BASE_URL}/server-wallet/address`);

      const response = await fetch(`${BASE_URL}/server-wallet/address`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      console.log('📥 [CONSENT] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [CONSENT] Server response:', errorText);
        throw new Error(`Failed to fetch server wallet address: ${response.status}`);
      }

      const walletData = await response.json();
      const fetchedServerWalletAddress = walletData.address;
      console.log('✅ [CONSENT] Got server wallet address:', fetchedServerWalletAddress);

      console.log('✅ [CONSENT] Server wallet ready:', fetchedServerWalletAddress);
      console.log('💳 [CONSENT] Creating spend permission for Smart Account:', smartAccountAddress);
      console.log('🔐 [CONSENT] Spender (server wallet):', fetchedServerWalletAddress);

      // Create spend permission: Base mainnet USDC, 10,000 USDC per week
      // Spender = Server's Smart Account (not admin address)
      const result = await createSpendPermission({
        network: 'base', // Base mainnet
        spender: fetchedServerWalletAddress as `0x${string}`, // Server wallet (spender)
        token: 'usdc', // Use shortcut for paymaster compatibility
        allowance: BigInt(10000 * 1_000_000), // 10,000 USDC (6 decimals)
        periodInDays: 7, // Weekly limit
        useCdpPaymaster: true, // Enables CDP Paymaster for gas sponsorship
      });

      console.log('✅ [CONSENT] Spend permission created:', result);

      // Wait for SP creation to complete
      if (result.userOperationHash) {
        console.log('⏳ [CONSENT] Waiting for SP creation to complete...');
        // The hook automatically tracks status via spStatus
      }

    } catch (error) {
      console.error('❌ [CONSENT] Error creating spend permission:', error);
      setIsCreatingSpendPermission(false);
      setShowConsentPopup(false);

      setApplePayAlert({
        visible: true,
        title: 'Setup Failed',
        message: error instanceof Error ? error.message : 'Failed to create spend permission. Please try again.',
        type: 'error'
      });
    }
  }, [currentUser, createSpendPermission]);

  // Watch for SP creation completion
  useEffect(() => {
    const finalizeSPCreation = async () => {
      if (spStatus === 'success' && spData && isCreatingSpendPermission) {
        try {
          console.log('✅ [CONSENT] SP creation successful, storing in Redis...');

          const smartAccountAddress = currentUser?.evmSmartAccounts?.[0] as string;
          const accessToken = await getAccessToken();

          if (!accessToken || !currentUser?.userId || !smartAccountAddress) {
            throw new Error('Missing required data for user initialization');
          }

          // Get permission hash from the transaction (we'll need to fetch it)
          // Since the hook doesn't return the hash directly, we'll use a placeholder
          // In production, you'd fetch this from the transaction or list permissions
          const permissionHash = spData.transactionHash || 'temp-hash'; // Placeholder

          // Store in Redis
          const { initializeUser } = await import('../../utils/userDataApi');
          await initializeUser(
            currentUser.userId,
            smartAccountAddress,
            permissionHash,
            accessToken
          );

          console.log('✅ [CONSENT] User initialized in database');
          setUserHasWalletAndSP(true);
          setIsCreatingSpendPermission(false);
          setShowConsentPopup(false);

          // Resume the pending transaction
          if (pendingFormData) {
            console.log('🔄 [CONSENT] Resuming pending transaction...');
            handleSubmitInternal(pendingFormData);
            setPendingFormData(null);
          }

        } catch (error) {
          console.error('❌ [CONSENT] Error storing user data:', error);
          setIsCreatingSpendPermission(false);
          setShowConsentPopup(false);

          setApplePayAlert({
            visible: true,
            title: 'Setup Failed',
            message: 'Failed to complete setup. Please try again.',
            type: 'error'
          });
        }
      }
    };

    finalizeSPCreation();
  }, [spStatus, spData, isCreatingSpendPermission, currentUser, getAccessToken, pendingFormData]);

  // Handle consent decline
  const handleConsentDecline = useCallback(() => {
    setShowConsentPopup(false);
    setPendingFormData(null);
    setIsProcessingPayment(false);

    console.log('ℹ️ [CONSENT] User declined consent');
  }, []);

  // Preflight check: Ensure user has wallet + SP before proceeding
  const handleSubmitInternal = useCallback(async (formData: any) => {
    setIsProcessingPayment(true);

    // CRITICAL: Convert display names to API format (e.g., "Solana" → "solana", "USD Coin" → "USDC")
    const networkApiName = getNetworkNameFromDisplayName(formData.network);
    const assetApiName = getAssetSymbolFromName(formData.asset);

    // Determine the correct address based on network type (moved outside try-catch)
    const isSandbox = getSandboxMode();
    let targetAddress = formData.address;

    if (!isSandbox) {
      // In production mode, use network-specific addresses
      const networkType = networkApiName.toLowerCase();
      const isEvmNetwork = ['ethereum', 'base', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'avax', 'bsc', 'fantom', 'linea', 'zksync', 'scroll'].some(k => networkType.includes(k));
      const isSolanaNetwork = ['solana', 'sol'].some(k => networkType.includes(k));

      if (isEvmNetwork) {
        // Use EVM address for EVM networks
        const evmEOA = currentUser?.evmAccounts?.[0] as string || evmAddress;
        const evmSmart = currentUser?.evmSmartAccounts?.[0] as string;
        targetAddress = evmEOA || evmSmart || targetAddress;
      } else if (isSolanaNetwork) {
        // Use Solana address for Solana networks
        const solAccount = currentUser?.solanaAccounts?.[0] as string || solanaAddress;
        targetAddress = solAccount || targetAddress;
      }
    }

    // Update the form data with converted API names and correct address
    const updatedFormData = {
      ...formData,
      network: networkApiName,
      asset: assetApiName,
      address: targetAddress
    };

    try {
      // Store transaction details for alert messages
      setCurrentTransaction({
        amount: updatedFormData.amount,
        paymentCurrency: updatedFormData.paymentCurrency || 'USD',
        asset: assetApiName,
        network: networkApiName
      });

      // Coinbase Widget: skip phone/email verification
      if ((formData.paymentMethod || '').toUpperCase() === 'COINBASE_WIDGET') {
        const url = await createWidgetSession(updatedFormData);
        if (url) Linking.openURL(url);
        return; // do not call createOrder()
      }

      // Apple Pay: createOrder will validate email + phone and throw appropriate errors
      await createOrder(updatedFormData);
    } catch (error: any) {
      // Handle missing email - show confirmation before linking
      if (error.code === 'MISSING_EMAIL') {
        setPendingForm(updatedFormData);
        setApplePayAlert({
          visible: true,
          title: 'Link Email for Apple Pay',
          message: 'Apple Pay requires both email and phone verification for compliance.\n\nWould you like to link your email to this account to continue?',
          type: 'info',
          navigationPath: '/email-verify?mode=link'
        });
        return;
      }

      // Handle missing phone - show confirmation before linking/verifying
      if (error.code === 'MISSING_PHONE') {
        setPendingForm(updatedFormData);
        // Use test phone for test sessions, real phone for production
        const cdpPhone = testSession
          ? TEST_ACCOUNTS.phone
          : currentUser?.authenticationMethods?.sms?.phoneNumber;

        // If phone is linked to CDP but not verified/expired, use re-verify flow
        if (cdpPhone) {
          const isUSPhone = cdpPhone.startsWith('+1');
          const disclaimer = isUSPhone ? '' : '\n\nNote: Apple Pay is only available for US phone numbers. You can use this flow to experience the verification process.';

          setApplePayAlert({
            visible: true,
            title: 'Re-verify Phone for Apple Pay',
            message: `Your phone is linked but needs verification.\n\nTo verify, we need to sign you out and send a verification code to your phone.\n\nWould you like to continue?${disclaimer}`,
            type: 'info',
            onConfirmCallback: async () => {
              try {
                console.log('🔄 [INDEX] Starting phone verification');

                // Sign out first (skip for test sessions)
                if (!testSession) {
                  console.log('🔄 [INDEX] Signing out for re-verification');
                  await signOut();
                  // Wait for sign out to complete
                  await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                  console.log('🧪 [INDEX] Test session - skipping sign out');
                }

                console.log('✅ [INDEX] Navigating to phone-verify with pre-filled number');

                // Navigate to phone-verify with phone pre-filled and auto-send enabled
                router.replace({
                  pathname: '/phone-verify',
                  params: {
                    initialPhone: cdpPhone,
                    mode: 'signin',
                    autoSend: 'true'
                  }
                });
              } catch (signOutError: any) {
                console.error('❌ [INDEX] Verification error:', signOutError);
                setApplePayAlert({
                  visible: true,
                  title: 'Error',
                  message: signOutError.message || 'Failed to start verification. Please try again.',
                  type: 'error'
                });
              }
            },
            onCancelCallback: () => {
              // Cancel re-verification - clear pending form and reset processing state
              console.log('❌ [INDEX] User canceled phone re-verification');
              setPendingForm(null);
              setIsProcessingPayment(false);
            }
          });
        } else {
          // No phone linked at all - use link mode
          setApplePayAlert({
            visible: true,
            title: 'Link Phone for Apple Pay',
            message: 'Apple Pay requires both email and phone verification for compliance.\n\nWould you like to link your phone to this account to continue?',
            type: 'info',
            navigationPath: '/phone-verify?mode=link'
          });
        }
        return;
      }

      // Handle expired phone - show confirmation before re-verifying
      if (error.code === 'PHONE_EXPIRED') {
        setPendingForm(updatedFormData);
        const expiredPhone = getVerifiedPhone();
        const isUSPhone = expiredPhone?.startsWith('+1');
        const disclaimer = isUSPhone ? '' : '\n\nNote: Apple Pay is only available for US phone numbers. You can use this flow to experience the verification process.';

        setApplePayAlert({
          visible: true,
          title: 'Re-verify Phone for Apple Pay',
          message: `Your phone verification has expired (valid for 60 days).\n\nTo re-verify, we need to sign you out and send a new verification code to your phone.\n\nWould you like to continue?${disclaimer}`,
          type: 'info',
          onConfirmCallback: async () => {
            try {
              console.log('🔄 [INDEX] Starting phone re-verification - signing out');

              // Sign out first
              await signOut();

              // Wait for sign out to complete
              await new Promise(resolve => setTimeout(resolve, 500));

              console.log('✅ [INDEX] Signed out, navigating to phone-verify with pre-filled number');

              // Navigate to phone-verify with phone pre-filled and auto-send enabled
              router.replace({
                pathname: '/phone-verify',
                params: {
                  initialPhone: expiredPhone,
                  mode: 'signin',
                  autoSend: 'true'
                }
              });
            } catch (signOutError: any) {
              console.error('❌ [INDEX] Re-verification error:', signOutError);
              setApplePayAlert({
                visible: true,
                title: 'Error',
                message: signOutError.message || 'Failed to start re-verification. Please try again.',
                type: 'error'
              });
            }
          },
          onCancelCallback: () => {
            // Cancel re-verification - clear pending form and reset processing state
            console.log('❌ [INDEX] User canceled phone re-verification');
            setPendingForm(null);
            setIsProcessingPayment(false);
          }
        });
        return;
      }

      // Handle non-US phone - show info alert
      if (error.code === 'NON_US_PHONE') {
        setPendingForm(null); // Clear pending form since this requires user action
        setApplePayAlert({
          visible: true,
          title: 'US Phone Required',
          message: 'Apple Pay Guest Checkout is only available for US phone numbers.\n\nYou can:\n• Switch to Coinbase Widget for international payments\n• Use Sandbox mode to test the Apple Pay flow\n• Link a US phone number to your account',
          type: 'info'
        });
        setIsProcessingPayment(false);
        return;
      }

      // Generic error
      setApplePayAlert({
        visible: true,
        title: 'Transaction Failed',
        message: error instanceof Error ? error.message : 'Unable to create transaction. Please try again.',
        type: 'error'
      });
      console.error('Error submitting form:', error);
      setIsProcessingPayment(false);
    }
  }, [createOrder, createWidgetSession, router, currentUser, evmAddress, solanaAddress, getNetworkNameFromDisplayName, getAssetSymbolFromName, signOut]);

  // Public handleSubmit: Checks if user has wallet + SP, shows consent if needed
  const handleSubmit = useCallback(async (formData: any) => {
    console.log('🔍 [SUBMIT] handleSubmit called');
    console.log('🔍 [SUBMIT] Sandbox mode:', getSandboxMode());

    // Skip consent check for sandbox mode or test sessions
    if (getSandboxMode() || testSession) {
      console.log('⏭️ [SUBMIT] Sandbox/test mode enabled, skipping consent check');
      return handleSubmitInternal(formData);
    }

    // Check if we already know the user status
    if (userHasWalletAndSP !== null) {
      if (userHasWalletAndSP === false) {
        console.log('ℹ️ [SUBMIT] User needs wallet + SP initialization, showing consent popup');
        setPendingFormData(formData);
        setShowConsentPopup(true);
        return;
      }
      console.log('✅ [SUBMIT] User has wallet + SP, proceeding');
      return handleSubmitInternal(formData);
    }

    // User status unknown - check now
    console.log('🔍 [SUBMIT] Checking if user has wallet + SP...');

    if (!currentUser?.userId) {
      console.warn('⚠️ [SUBMIT] No userId available');
      return handleSubmitInternal(formData);
    }

    try {
      const { checkUserExists } = await import('../../utils/userDataApi');
      const accessToken = await getAccessToken();

      if (!accessToken) {
        console.warn('⚠️ [SUBMIT] No access token available, proceeding anyway');
        return handleSubmitInternal(formData);
      }

      const result = await checkUserExists(currentUser.userId, accessToken);
      setUserHasWalletAndSP(result.hasWalletAndSP);

      if (result.hasWalletAndSP) {
        console.log('✅ [SUBMIT] User has wallet + SP, proceeding');
        return handleSubmitInternal(formData);
      } else {
        console.log('ℹ️ [SUBMIT] User needs initialization, showing consent popup');
        setPendingFormData(formData);
        setShowConsentPopup(true);
        return;
      }
    } catch (error) {
      console.error('❌ [SUBMIT] Error checking user:', error);
      // On error, show consent to be safe
      setUserHasWalletAndSP(false);
      setPendingFormData(formData);
      setShowConsentPopup(true);
    }
  }, [userHasWalletAndSP, handleSubmitInternal, testSession, currentUser?.userId, getAccessToken]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Onramp V2 Demo</Text>
      </View>

      

      {/* Error banner for failed options fetch */}
      {optionsError && !isLoadingOptions && (
        <View style={styles.errorBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.errorTitle}>⚠️ Failed to load payment options</Text>
            <Text style={styles.errorMessage}>{optionsError}</Text>
          </View>
          <Pressable
            onPress={fetchOptions}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && { opacity: 0.7 }
            ]}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      )}

      <OnrampForm
        address={address}
        onAddressChange={(newAddress) => {
          setAddress(newAddress);
          setConnectedAddress(newAddress);
        }}
        onSubmit={handleSubmit}
        isLoading={isProcessingPayment}
        options={options}
        isLoadingOptions={isLoadingOptions}
        getAvailableNetworks={getAvailableNetworks}
        getAvailableAssets={getAvailableAssets}
        currentQuote={currentQuote}
        isLoadingQuote={isLoadingQuote}
        fetchQuote={fetchQuote}
        paymentCurrencies={paymentCurrencies}
        amount={amount}
        onAmountChange={setAmount}
        buyConfig={buyConfig}
      />

      

      {applePayVisible && (
        <ApplePayWidget
          paymentUrl={hostedUrl}
          onClose={() => {
            closeApplePay(); // Stop loading when closed
          }}
          setIsProcessingPayment={setIsProcessingPayment}
          isSandbox={getCurrentPartnerUserRef()?.startsWith('sandbox-') || false}
          onAlert={(title, message, type) => {
            // Enhance alert message with transaction details
            let enhancedMessage = message;
            if (currentTransaction) {
              const txDetails = `\n\n${currentTransaction.amount} ${currentTransaction.paymentCurrency} → ${currentTransaction.asset} (${currentTransaction.network})`;
              enhancedMessage = message + txDetails;
            }
            setApplePayAlert({ visible: true, title, message: enhancedMessage, type });
          }}
        />
      )}

      {/* Consent Popup - First-time user setup */}
      <ConsentPopup
        visible={showConsentPopup}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
        isLoading={isCreatingSpendPermission}
      />

      {/* OnrampForm Alert - Wallet Connection (Always Success) */}
      <CoinbaseAlert
        visible={showAlert}
        title="Success"
        message={alertMessage}
        onConfirm={() => setShowAlert(false)}
      />
      {/* ApplePayWidget Alert */}
      <CoinbaseAlert
        visible={applePayAlert.visible}
        title={applePayAlert.title}
        message={applePayAlert.message}
        type={applePayAlert.type}
        onConfirm={async () => {
          const navPath = applePayAlert.navigationPath;
          const callback = applePayAlert.onConfirmCallback;
          setApplePayAlert({ visible: false, title: '', message: '', type: 'info', navigationPath: undefined, onConfirmCallback: undefined, onCancelCallback: undefined });

          // Clear transaction details after alert is dismissed
          setCurrentTransaction(null);

          // Execute callback if it exists (e.g., sign out + navigate for re-verify)
          if (callback) {
            await callback();
          }
          // Otherwise navigate if path is provided (e.g., link phone/email)
          else if (navPath) {
            router.push(navPath as any);
          }
        }}
        onCancel={applePayAlert.onCancelCallback ? () => {
          const cancelCallback = applePayAlert.onCancelCallback;
          setApplePayAlert({ visible: false, title: '', message: '', type: 'info', navigationPath: undefined, onConfirmCallback: undefined, onCancelCallback: undefined });

          // Clear transaction details after alert is dismissed
          setCurrentTransaction(null);

          // Execute cancel callback if it exists
          if (cancelCallback) {
            cancelCallback();
          }
        } : undefined}
      />

      
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: CARD_BG, 
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: TEXT_PRIMARY,
  },
  headerButton: {
    // Button styling
    backgroundColor: BLUE,             
    paddingHorizontal: 16,            
    paddingVertical: 12,               
    borderRadius: 20,                 
    minWidth: 100,                   
    alignItems: 'center',
    justifyContent: 'center',
    
    // shadow
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    
    // Border (optional)
    borderWidth: 0,
    borderColor: BLUE,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ADE80", // Green dot
    marginRight: 6,             // Space from text
  },
  headerButtonText: {
    fontSize: 14,              
    fontWeight: '600',         
    color: WHITE,             
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoContainer: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: '#FF6B6B', // Error red (same as alert icon)
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
    gap: 12,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: BLUE,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  sandboxToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
  },
  sandboxToggleContent: {
    flex: 1,
    marginRight: 12,
  },
  sandboxToggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  sandboxToggleHint: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    lineHeight: 16,
  },
});

