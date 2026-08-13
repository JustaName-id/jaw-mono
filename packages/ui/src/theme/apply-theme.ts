/**
 * DOM application of a resolved theme.
 *
 * Sets CSS custom properties on a container element and manages
 * the `dark` class / `color-scheme` property.
 */

import { ResolvedTheme } from './resolve-theme.js';

/**
 * Apply resolved theme variables to an HTML element.
 *
 * - Sets every `--jaw-*` variable via `style.setProperty`
 * - Toggles the `dark` class based on `colorScheme`
 * - Sets `color-scheme` CSS property for native form controls
 */
export function applyThemeToContainer(container: HTMLElement, resolved: ResolvedTheme): void {
  // Only `--jaw-*` names are written. The package's Tailwind theme reads these directly, so no
  // generic alias (--background, --radius, …) is published — those would collide with a host's
  // own variables of the same name, which is what forced consumers to patch around us before.
  for (const [key, value] of Object.entries(resolved.variables)) {
    container.style.setProperty(key, value);
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
