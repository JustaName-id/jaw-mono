'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '../components/theme-toggle';
import { getAnalyticsClient } from '../analytics';

// Destination-named CTA events, matching the landing site's convention so a
// click toward a given property has one event name across every JAW app.
const OUTBOUND_LINKS: { href: string; label: string; event: 'DOCS_CLICKED' | 'GET_STARTED_CLICKED' }[] = [
  { href: 'https://docs.jaw.id', label: 'Documentation', event: 'DOCS_CLICKED' },
  { href: 'https://dashboard.jaw.id', label: 'Get an API key', event: 'GET_STARTED_CLICKED' },
];

const routes = [
  {
    href: '/wagmi',
    title: 'Wagmi Connector',
    description: 'Test @jaw.id/wagmi hooks alongside standard wagmi hooks.',
    badge: '@jaw.id/wagmi',
    badgeClass: 'bg-shell-wagmi-bg text-shell-wagmi-ink',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="8" r="3" />
        <circle cx="8" cy="16" r="3" />
        <path d="M16 13.5v5" />
        <path d="M13.5 16h5" />
      </svg>
    ),
  },
  {
    href: '/core',
    title: 'Core SDK',
    description: 'Test @jaw.id/core functionality via the EIP-1193 provider interface.',
    badge: '@jaw.id/core',
    badgeClass: 'bg-shell-core-bg text-shell-core-ink',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 8l-4 4 4 4" />
        <path d="M15 8l4 4-4 4" />
      </svg>
    ),
  },
];

const steps = [
  <>
    Choose between <strong className="text-shell-ink font-semibold">Core SDK</strong> for direct provider access or{' '}
    <strong className="text-shell-ink font-semibold">Wagmi</strong> for React hooks integration.
  </>,
  <>
    Select your mode: <strong className="text-shell-ink font-semibold">Cross-Platform</strong> for popup auth or{' '}
    <strong className="text-shell-ink font-semibold">App-Specific</strong> for embedded UI.
  </>,
  <>Click any method to open it, fill in parameters, and execute.</>,
  <>
    Use the <strong className="text-shell-ink font-semibold">Code Snippet</strong> tab to copy implementation examples.
  </>,
];

export default function Home() {
  return (
    <div className="bg-shell-canvas text-shell-ink relative min-h-screen overflow-x-hidden">
      {/* Brand watermark */}
      <Image
        src="/jaw-logo.png"
        alt=""
        aria-hidden="true"
        width={580}
        height={640}
        className="pointer-events-none absolute -right-20 -top-10 h-[640px] w-auto max-w-none opacity-5 dark:brightness-0 dark:invert"
        priority
      />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1020px] flex-col items-center justify-center px-8 py-7">
        {/* Host badge */}
        <div className="border-shell-line bg-shell-raise mb-4 inline-flex items-center gap-2 rounded-full border py-[5px] pl-[11px] pr-[13px]">
          <span className="animate-pulse-dot h-1.5 w-1.5 flex-none rounded-full bg-[#059669]" />
          <span className="text-shell-ink-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
            playground.jaw.id
          </span>
        </div>

        <Image
          src="/jaw-logo.png"
          alt="JAW.id"
          width={35}
          height={38}
          className="block dark:brightness-0 dark:invert"
        />

        <h1 className="mt-4 text-center text-[46px] font-medium leading-[1.02] tracking-[-0.04em]">
          JAW.id Playground
        </h1>
        <p className="text-shell-ink-2 mt-1 text-2xl font-light italic tracking-[-0.02em]">for Humans</p>
        <p className="text-shell-ink-3 mt-3 max-w-[52ch] text-center text-base leading-normal">
          Explore and test the JAW smart account SDK in an interactive environment.
        </p>

        {/* SDK cards */}
        <div className="mt-[26px] grid w-full grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[18px]">
          {routes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="border-shell-line bg-shell-raise hover:border-shell-line-2 hover:bg-shell-raise-2 group flex cursor-pointer flex-col gap-4 rounded-[18px] border p-[22px] text-left transition-all duration-200 hover:-translate-y-[3px] hover:shadow-[0_30px_60px_-30px_rgba(15,23,42,.25)] dark:hover:shadow-[0_30px_60px_-34px_rgba(0,0,0,.85)]"
            >
              <div className="flex items-center justify-between gap-3.5">
                <span className="border-shell-line-2 bg-shell-raise-2 text-shell-ink-2 flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px] border">
                  {route.icon}
                </span>
                <span
                  className={`whitespace-nowrap rounded-full px-[11px] py-[5px] font-mono text-[12.5px] ${route.badgeClass}`}
                >
                  {route.badge}
                </span>
              </div>
              <div>
                <div className="text-xl font-semibold tracking-[-0.03em]">{route.title}</div>
                <p className="text-shell-ink-3 mt-[7px] text-[14.5px] leading-relaxed">{route.description}</p>
              </div>
              <span className="text-shell-ink inline-flex items-center gap-[7px] text-[15px] font-medium">
                Get started
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          ))}
        </div>

        {/* Getting-started steps */}
        <div className="border-shell-line bg-shell-line mt-[22px] grid w-full grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-px overflow-hidden rounded-[14px] border">
          {steps.map((step, i) => (
            <div key={i} className="bg-shell-canvas flex flex-col gap-1.5 px-4 py-3.5">
              <span className="text-shell-ink-3 font-mono text-[11px] font-semibold tracking-[0.1em]">[0{i + 1}]</span>
              <p className="text-shell-ink-2 m-0 text-[13px] leading-normal">{step}</p>
            </div>
          ))}
        </div>

        {/* Outbound links to the other JAW properties. Instrumented so the
            landing → playground → docs/dashboard journey is visible in the
            combined PostHog project. */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {OUTBOUND_LINKS.map((link) => (
            <a
              key={link.event}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => getAnalyticsClient().track(link.event, { location: 'home-footer' })}
              className="text-shell-ink-3 hover:text-shell-ink text-sm font-medium transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
