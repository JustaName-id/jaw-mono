export const INPAGE_SOURCE = 'jaw-ext-inpage' as const;
export const CONTENT_SOURCE = 'jaw-ext-content' as const;

export const PORT_NAME_CONTENT = 'jaw-content' as const;
export const PORT_NAME_OFFSCREEN = 'jaw-offscreen' as const;
export const PORT_NAME_POPUP = 'jaw-popup' as const;

export const OFFSCREEN_PATH = 'src/offscreen/offscreen.html' as const;

declare const __JAW_EXTENSION_API_KEY__: string;
declare const __JAW_KEYS_URL__: string;

export const JAW_EXTENSION_API_KEY: string = __JAW_EXTENSION_API_KEY__;
export const JAW_KEYS_URL: string = __JAW_KEYS_URL__;
