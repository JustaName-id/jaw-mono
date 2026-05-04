/**
 * DOM application of a resolved theme.
 *
 * Sets CSS custom properties on a container element and manages
 * the `dark` class / `color-scheme` property.
 */

import { ResolvedTheme } from './resolve-theme.js';

/**
 * Mapping from --jaw-color-* variables to their short backwards-compat aliases.
 * Tailwind utilities (bg-primary, text-foreground, etc.) use these short names
 * via the @theme inline block, so they must be set on the container too.
 */
const JAW_TO_SHORT_ALIAS: Readonly<Record<string, string>> = {
  '--jaw-color-background': '--background',
  '--jaw-color-foreground': '--foreground',
  '--jaw-color-card': '--card',
  '--jaw-color-card-foreground': '--card-foreground',
  '--jaw-color-popover': '--popover',
  '--jaw-color-popover-foreground': '--popover-foreground',
  '--jaw-color-primary': '--primary',
  '--jaw-color-primary-foreground': '--primary-foreground',
  '--jaw-color-secondary': '--secondary',
  '--jaw-color-secondary-foreground': '--secondary-foreground',
  '--jaw-color-muted': '--muted',
  '--jaw-color-muted-foreground': '--muted-foreground',
  '--jaw-color-accent': '--accent',
  '--jaw-color-accent-foreground': '--accent-foreground',
  '--jaw-color-destructive': '--destructive',
  '--jaw-color-destructive-foreground': '--destructive-foreground',
  '--jaw-color-border': '--border',
  '--jaw-color-input': '--input',
  '--jaw-color-ring': '--ring',
  '--jaw-color-success': '--success',
  '--jaw-color-success-foreground': '--success-foreground',
  '--jaw-color-warning': '--warning',
  '--jaw-color-warning-foreground': '--warning-foreground',
  '--jaw-color-info': '--info',
  '--jaw-color-info-foreground': '--info-foreground',
};

/**
 * Apply resolved theme variables to an HTML element.
 *
 * - Sets every `--jaw-*` variable via `style.setProperty`
 * - Also sets the short backwards-compat aliases (--primary, --background, etc.)
 *   so Tailwind utilities like `bg-primary` resolve correctly on this container
 * - Toggles the `dark` class based on `colorScheme`
 * - Sets `color-scheme` CSS property for native form controls
 */
export function applyThemeToContainer(container: HTMLElement, resolved: ResolvedTheme): void {
  const entries = Object.entries(resolved.variables);
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    // Set the --jaw-* variable
    container.style.setProperty(key, value);
    // Also set the short alias so Tailwind classes resolve on this container
    const alias = JAW_TO_SHORT_ALIAS[key];
    if (alias) {
      container.style.setProperty(alias, value);
    }
  }

  // --jaw-radius -> --radius alias
  const radius = resolved.variables['--jaw-radius'];
  if (radius) {
    container.style.setProperty('--radius', radius);
  }

  // --jaw-font-family -> font-family on container
  const fontFamily = resolved.variables['--jaw-font-family'];
  if (fontFamily) {
    container.style.fontFamily = fontFamily;
  }

  // Toggle dark class
  if (resolved.colorScheme === 'dark') {
    container.classList.add('dark');
  } else {
    container.classList.remove('dark');
  }

  // Set native color-scheme for form controls
  container.style.colorScheme = resolved.colorScheme;
}
