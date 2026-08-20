'use client';

import type { ComponentType } from 'react';
import type { JawTheme } from '@jaw.id/core';
import { SceneAgent, SceneCreate, SceneSiwe } from '@/components/jaw/scenes';
import { BatchDialog, SwapAdvDialog, SwapDialog, TransferAdvDialog, TransferDialog } from '@/components/jaw/dialogs';

export type PhoneAppKey = 'social' | 'splits' | 'swapr' | 'swaprsend' | 'agens';

export type Variant = {
  key: string;
  label: string;
  desc: string;
  C: ComponentType<{ onDone: () => void }>;
  app?: PhoneAppKey;
  appLabel?: string;
  accent?: string;
};

export type Feat = {
  id: number;
  app: PhoneAppKey;
  appLabel: string;
  accent: string;
  title: string;
  teaser: string;
  variants: Variant[];
  /** Theme pushed to the keys dialog while this feature is active. */
  theme?: JawTheme;
};

const SiweAdversarial = ({ onDone }: { onDone: () => void }) => <SceneSiwe act="adversarial" onDone={onDone} oneStep />;
const CreateHappy = ({ onDone }: { onDone: () => void }) => <SceneCreate onDone={onDone} oneStep />;
const AgentHappy = ({ onDone }: { onDone: () => void }) => <SceneAgent act="happy" onDone={onDone} oneStep />;
const AgentAdversarial = ({ onDone }: { onDone: () => void }) => (
  <SceneAgent act="adversarial" onDone={onDone} oneStep />
);

// Four features; some have variants the user can switch between.
export const FEATS: Feat[] = [
  {
    id: 1,
    app: 'social',
    appLabel: 'Social app',
    accent: 'rgb(8,81,255)',
    title: 'Sign in / Sign up',
    teaser: 'A passkey. Face ID or fingerprint, no seed phrase.',
    theme: {
      mode: 'light',
      colors: {
        primary: '#0851FF',
        primaryForeground: '#FFFFFF',
        ring: '#0851FF',
      },
    },
    variants: [
      {
        key: 'happy',
        label: 'Happy path',
        C: CreateHappy,
        desc: 'One button for new and returning users. People are known by a name instead of an 0x address, keys never leave the device, and a Face ID prompt sets it all up with a gasless name and profile.',
      },
      {
        key: 'adversarial',
        label: 'Adversarial',
        C: SiweAdversarial,
        desc: 'Same button, hostile payload. JAW checks the origin against the domain the message claims, flags the impersonation and the lookalike characters in the URI, and disables one-tap signing.',
      },
    ],
  },
  {
    id: 2,
    app: 'splits',
    appLabel: 'Splitos',
    accent: '#C29A34',
    title: 'Send',
    teaser: 'Amount and fee in one token, no gas token to top up.',
    // Unlike sign-in's single accent swap, splits dresses the dialog like the
    // app's own Settle Up sheet: cream drawer surface (popover is what the
    // sheet is painted with), white inner cards, navy type, gold actions.
    theme: {
      mode: 'light',
      borderRadius: 'lg',
      colors: {
        background: '#F4F5F7',
        foreground: '#16233F',
        card: '#FFFFFF',
        cardForeground: '#16233F',
        popover: '#F4F5F7',
        popoverForeground: '#16233F',
        primary: '#C29A34',
        primaryForeground: '#FFFFFF',
        secondary: '#E9EBEF',
        secondaryForeground: '#16233F',
        muted: '#E9EBEF',
        mutedForeground: '#5A6379',
        accent: '#E9EBEF',
        accentForeground: '#16233F',
        border: '#DDE0E6',
        input: '#DDE0E6',
        ring: '#C29A34',
        positive: '#1E7A45',
        negative: '#C81E33',
        scrim: '#16233F',
      },
    },
    variants: [
      {
        key: 'happy',
        label: 'Happy path',
        C: TransferDialog,
        desc: 'Amount, recipient and fee in one currency, confirmed with one biometric tap. Each name is shown next to the address it resolves to, and the whole thing settles in seconds with no gas token to top up first.',
      },
      {
        key: 'adversarial',
        label: 'Adversarial',
        C: TransferAdvDialog,
        desc: 'A lookalike name resolving to an address registered minutes ago. JAW shows what the name actually points at, compares it against who this account has paid before, and disables one-tap signing.',
      },
    ],
  },
  {
    id: 3,
    app: 'swapr',
    appLabel: 'Exchange',
    accent: '#0F172A',
    title: 'Swap',
    teaser: 'Approve and swap in one signature.',
    // Swapr goes graphite black (Uniswap-web dark) with the screen's pink
    // CTA as primary.
    theme: {
      mode: 'dark',
      colors: {
        background: '#0D0E12',
        foreground: '#F5F5F5',
        card: '#20242E',
        cardForeground: '#F5F5F5',
        popover: '#0D0E12',
        popoverForeground: '#F5F5F5',
        primary: '#F43FA6',
        primaryForeground: '#FFFFFF',
        secondary: '#4A2138',
        secondaryForeground: '#FF8ACD',
        muted: '#20242E',
        mutedForeground: '#85888F',
        accent: '#4A2138',
        accentForeground: '#FF8ACD',
        border: '#2B303C',
        input: '#3A4353',
        ring: '#F43FA6',
        scrim: '#000000',
      },
    },
    variants: [
      {
        key: 'swap',
        label: 'Swap',
        app: 'swapr',
        appLabel: 'Exchange',
        accent: '#0F172A',
        C: SwapDialog,
        desc: 'Approve and swap collapse into one atomic call, decoded step by step before the tap rather than hidden behind a hash. If the swap fails the approval never happened, so no allowance is left sitting on the router afterwards.',
      },
      {
        key: 'batch',
        label: 'Batched with a send',
        app: 'swaprsend',
        appLabel: 'Exchange',
        accent: '#0F172A',
        C: BatchDialog,
        desc: 'Approve, swap and send in a single transaction. Three calls, one signature, all or nothing: the recipient is paid in the same atomic step, or nothing moves at all and the account is exactly where it started.',
      },
      {
        key: 'adversarial',
        label: 'Adversarial',
        app: 'swapr',
        appLabel: 'Exchange',
        accent: '#0F172A',
        C: SwapAdvDialog,
        desc: 'The same batch with an unlimited approval smuggled in as a third call. Every call in the batch is decoded and shown rather than summarised, so the one that does not belong is visible before signing.',
      },
    ],
  },
  {
    id: 4,
    app: 'agens',
    appLabel: 'AI agent',
    accent: '#5FE0A0',
    title: 'Agent delegation',
    teaser: 'Scoped limits on amount and duration.',
    // The copy-edit design paints Agens deep green ("ox"): the dialog follows
    // with green chat surfaces and the emerald primary.
    theme: {
      mode: 'dark',
      colors: {
        background: '#10312A',
        foreground: '#EAF7F1',
        card: '#18443B',
        cardForeground: '#EAF7F1',
        popover: '#10312A',
        popoverForeground: '#EAF7F1',
        primary: '#10B981',
        primaryForeground: '#04110C',
        secondary: '#1B4A40',
        secondaryForeground: '#A9F0D7',
        muted: '#18443B',
        mutedForeground: '#9DB8AE',
        accent: '#1B4A40',
        accentForeground: '#6EE7B7',
        border: '#2A574C',
        input: '#336357',
        ring: '#10B981',
        success: '#10B981',
        positive: '#34D399',
        scrim: '#04110C',
      },
    },
    variants: [
      {
        key: 'happy',
        label: 'Happy path',
        C: AgentHappy,
        desc: 'Agents get scoped permissions, not keys: this token, this cap, this expiry. The cap is enforced onchain rather than in the app, so an agent that tries to spend past its limit simply reverts instead of asking again.',
      },
      {
        key: 'adversarial',
        label: 'Adversarial',
        C: AgentAdversarial,
        desc: 'A grant with no cap and no expiry is the whole account, handed over permanently and revocable only by the user remembering to do it. The dialog puts that blast radius in front of them before the permission exists.',
      },
    ],
  },
];
