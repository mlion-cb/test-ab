/**
 * Consent Popup Component
 *
 * Shown to first-time users before they can make their first onramp transaction.
 * Explains that a wallet and spend permission will be created for automatic sweeping.
 *
 * Flow:
 * - User sees this popup on first visit (checked via GET /user/:userId)
 * - If user accepts → creates wallet + SP (hardcoded Base mainnet USDC, 10k/week)
 * - If user declines → closes popup, shows again next time
 * - Once accepted → stored in Redis, never shown again
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/Colors';

const { BLUE, DARK_BG, CARD_BG, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, WHITE } = COLORS;

interface ConsentPopupProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  isLoading?: boolean;
}

export function ConsentPopup({ visible, onAccept, onDecline, isLoading }: ConsentPopupProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.popup}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="shield-checkmark" size={32} color={BLUE} />
            <Text style={styles.title}>First-Time Setup</Text>
          </View>

          {/* Content */}
          <Text style={styles.description}>
            To use this onramp service, we need to:
          </Text>

          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Ionicons name="checkmark-circle" size={20} color={BLUE} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>
                Create a <Text style={styles.bold}>wallet</Text> for receiving crypto
              </Text>
            </View>

            <View style={styles.bulletItem}>
              <Ionicons name="checkmark-circle" size={20} color={BLUE} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>
                Set up <Text style={styles.bold}>automatic sweep permissions</Text> to collect funds
              </Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={16} color={TEXT_SECONDARY} />
            <Text style={styles.infoText}>
              This allows us to automatically sweep USDC from your wallet to our admin wallet (up to 10,000 USDC per week on Base mainnet).
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <Pressable
              style={[styles.button, styles.declineButton]}
              onPress={onDecline}
              disabled={isLoading}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.acceptButton, isLoading && styles.buttonDisabled]}
              onPress={onAccept}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={WHITE} size="small" />
              ) : (
                <Text style={styles.acceptButtonText}>Accept & Continue</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            You can only proceed if you accept these terms.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  popup: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: BORDER,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginTop: 12,
  },
  description: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    marginBottom: 16,
    lineHeight: 22,
  },
  bulletList: {
    marginBottom: 20,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bulletIcon: {
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: TEXT_PRIMARY,
    marginLeft: 10,
    lineHeight: 20,
  },
  bold: {
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: DARK_BG,
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: BORDER,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginLeft: 8,
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  declineButton: {
    backgroundColor: DARK_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  acceptButton: {
    backgroundColor: BLUE,
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: WHITE,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  footnote: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});
