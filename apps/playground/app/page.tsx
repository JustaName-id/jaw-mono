'use client';

import Link from 'next/link';
import { Card } from '../components/ui/card';

const routes = [
  {
    href: '/core',
    title: 'Core SDK',
    description:
      'Test @jaw.id/core functionality via the EIP-1193 provider interface. Direct RPC method calls for connections, signing, transactions, permissions, and wallet capabilities.',
    badge: '@jaw.id/core',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  {
    href: '/wagmi',
    title: 'Wagmi Integration',
    description:
      'Test @jaw.id/wagmi hooks alongside standard wagmi hooks. Includes useConnect, useDisconnect, useGrantPermissions, useRevokePermissions, usePermissions, useGetAssets, and useCapabilities.',
    badge: '@jaw.id/wagmi',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen p-4 md:p-8 bg-background">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-12 space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            JAW SDK Playground
          </h1>
          <p className="text-lg text-muted-foreground">
            Interactive examples for testing and exploring the JAW SDK integrations.
            Choose a playground to test RPC methods and wallet capabilities.
          </p>
        </div>

        {/* Route Cards */}
        <div className="grid gap-6">
          {routes.map((route) => (
            <Link key={route.href} href={route.href}>
              <Card className="p-6 hover:shadow-lg transition-all hover:border-primary/50 cursor-pointer group">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                        {route.title}
                      </h2>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${route.badgeColor}`}>
                        {route.badge}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      {route.description}
                    </p>
                  </div>
                  <div className="flex items-center text-muted-foreground group-hover:text-primary transition-colors">
                    <span className="text-sm font-medium mr-1">Open</span>
                    <svg
                      className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-12 p-6 rounded-lg border border-border bg-muted/30">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            Getting Started
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">1.</span>
              Choose between <strong>Core SDK</strong> for direct provider access or <strong>Wagmi</strong> for React hooks integration.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">2.</span>
              Select your mode: <strong>App-Specific</strong> for embedded UI or <strong>Cross-Platform</strong> for popup auth.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">3.</span>
              Click any method card to open the modal, fill in parameters, and execute.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">4.</span>
              Use the <strong>Code Snippet</strong> tab to copy implementation examples.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
