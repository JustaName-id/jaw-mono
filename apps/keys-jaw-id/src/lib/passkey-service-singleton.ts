import { PasskeyService } from './passkey-service';

/**
 * Singleton instance of PasskeyService
 * This prevents creating multiple instances and reduces memory usage
 */
let passkeyServiceInstance: PasskeyService | null = null;

/**
 * Get or create the singleton PasskeyService instance
 * @param preference - Optional configuration for the service
 * @returns Shared PasskeyService instance
 */
export const getPasskeyService = (preference?: {
  serverUrl?: string;
  apiKey?: string;
  localOnly?: boolean
}): PasskeyService => {
  if (!passkeyServiceInstance) {
    passkeyServiceInstance = new PasskeyService(preference ?? { localOnly: true });
  }
  return passkeyServiceInstance;
};

/**
 * Reset the singleton instance (useful for testing or logout)
 */
export const resetPasskeyService = (): void => {
  passkeyServiceInstance = null;
};