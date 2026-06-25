/** Which SDK surface the event originated from. */
export type SdkType = 'core' | 'wagmi';

/** JAW connection mode, as a stable analytics string. */
export type ModeName = 'cross-platform' | 'app-specific';

/** How keys.jaw.id is reached in CrossPlatform mode. */
export type TransportName = 'popup' | 'iframe' | 'auto';
