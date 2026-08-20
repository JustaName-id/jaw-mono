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
    teaser: 'Face ID or fingerprint. No seed phrase.',
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
        desc: 'One button for new and returning users. A Face ID prompt creates a self-custodial smart account with a gasless name and profile, so people are known by a name instead of a 0x address and keys never leave the device.',
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
    appLabel: 'Bill splitter',
    accent: '#C29A34',
    title: 'Send',
    teaser: 'One tap, name resolved, no gas token.',
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
    accent: '#0F172A',
    title: 'Agent delegation',
    teaser: 'Scoped limits on amount and duration.',
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
