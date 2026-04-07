'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Card } from '../components/ui/card';
import { ThemeToggle } from '../components/theme-toggle';

const routes = [
  {
    href: '/wagmi',
    title: 'Wagmi Connector',
    description: 'Test @jaw.id/wagmi hooks alongside standard wagmi hooks.',
    badge: '@jaw.id/wagmi',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z"
        />
      </svg>
    ),
  },
  {
    href: '/core',
    title: 'Core SDK',
    description: 'Test @jaw.id/core functionality via the EIP-1193 provider interface.',
    badge: '@jaw.id/core',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
        />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      {/* Top bar with theme toggle */}
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      {/* Hero Section */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 md:py-20">
        {/* Logo & Title */}
        <div className="mb-10 text-center md:mb-14">
          <div className="mb-6">
            <Image src="/jaw-logo.png" alt="JAW.id" width={64} height={70} className="mx-auto opacity-90" priority />
          </div>
          <h1 className="text-foreground text-4xl font-bold tracking-tight md:text-5xl">JAW.id Playground</h1>
          <p className="text-muted-foreground/60 mt-1.5 text-sm italic">for Humans</p>
          <p className="text-muted-foreground mx-auto mt-3 max-w-md text-lg">
            Explore and test the JAW smart account SDK in an interactive environment.
          </p>
        </div>

        {/* Route Cards */}
        <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2 md:gap-6">
          {routes.map((route) => (
            <Link key={route.href} href={route.href}>
              <Card className="hover:border-primary/50 border-border/60 group h-full cursor-pointer p-6 transition-all hover:shadow-lg">
                <div className="flex h-full flex-col">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="bg-muted text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 rounded-lg p-2 transition-colors">
                      {route.icon}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${route.badgeColor}`}>
                      {route.badge}
                    </span>
                  </div>
                  <h2 className="text-foreground group-hover:text-primary mb-1.5 text-lg font-semibold transition-colors">
                    {route.title}
                  </h2>
                  <p className="text-muted-foreground flex-1 text-sm">{route.description}</p>
                  <div className="text-muted-foreground group-hover:text-primary mt-4 flex items-center text-sm font-medium transition-colors">
                    Get started
                    <svg
                      className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* Getting Started */}
        <div className="mt-10 w-full max-w-2xl md:mt-14">
          <h3 className="text-foreground mb-3 text-lg font-semibold">Getting Started</h3>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary shrink-0 font-bold">1.</span>
              <span>
                Choose between <strong>Core SDK</strong> for direct provider access or <strong>Wagmi</strong> for React
                hooks integration.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary shrink-0 font-bold">2.</span>
              <span>
                Select your mode: <strong>Cross-Platform</strong> for popup auth or <strong>App-Specific</strong> for
                embedded UI.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary shrink-0 font-bold">3.</span>
              <span>Click any method card to open the modal, fill in parameters, and execute.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary shrink-0 font-bold">4.</span>
              <span>
                Use the <strong>Code Snippet</strong> tab to copy implementation examples.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
