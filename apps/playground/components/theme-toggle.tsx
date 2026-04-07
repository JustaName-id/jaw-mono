'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';

/**
 * Three-state theme toggle: light → dark → system → light.
 * Renders nothing on the server / first paint to avoid hydration mismatch.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid hydration mismatch — next-themes can only know the actual theme client-side
  if (!mounted) {
    return <div className="size-9" aria-hidden />;
  }

  const cycle = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const label = theme === 'light' ? 'Light theme' : theme === 'dark' ? 'Dark theme' : 'System theme';

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Switch theme (current: ${label})`}
      title={label}
      className="border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground inline-flex size-9 items-center justify-center rounded-md border transition-colors"
    >
      {theme === 'light' && <Sun className="size-4" />}
      {theme === 'dark' && <Moon className="size-4" />}
      {theme === 'system' && <Monitor className="size-4" />}
    </button>
  );
}
