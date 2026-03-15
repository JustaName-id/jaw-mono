'use client';

import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-foreground no-underline hover:text-primary transition-colors"
        >
          <span className="text-lg">JAW.id</span>
          <span className="hidden text-sm font-medium text-muted-foreground sm:inline">Playground</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
