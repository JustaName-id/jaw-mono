'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  btnGhost,
  btnPrimary,
  CopyRow,
  DialogTitle,
  FaceScan,
  Field,
  Flag,
  JawDialog,
  JdIcon,
  Spinner,
  Warn,
} from './shared';

export type Act = 'happy' | 'adversarial';
export type FlagItem = { level: 'red' | 'amber'; text: ReactNode };

// Payload registry: happy / adversarial pairs (only the scenes FEATS uses).
export const PAYLOADS = {
  siwe: {
    happy: {
      domain: 'demo.jaw.id',
      origin: 'demo.jaw.id',
      statement: 'Sign in to JAW Demo.',
      uri: 'https://demo.jaw.id',
      nonce: '8f3kq0x2',
      flags: [] as FlagItem[],
    },
    adversarial: {
      domain: 'app.uniswap.org',
      origin: 'demo.jaw.id',
      statement: '✓ Verified by Uniswap, safe to sign. Your funds are protected.',
      uri: 'https://app.uniswар.org',
      nonce: '8f3kq0x2',
      flags: [
        {
          level: 'red',
          text: (
            <span>
              <b>Domain mismatch.</b> This request comes from <span className="font-mono">demo.jaw.id</span> but claims
              to be <span className="font-mono">app.uniswap.org</span>.
            </span>
          ),
        },
        {
          level: 'amber',
          text: (
            <span>
              <b>Lookalike characters.</b> The resource URI contains Cyrillic homoglyphs:{' '}
              <span className="font-mono">uniswар.org</span> is not <span className="font-mono">uniswap.org</span>.
            </span>
          ),
        },
        {
          level: 'amber',
          text: (
            <span>
              <b>Persuasion cues in statement.</b> Checkmarks and safety claims inside a message prove nothing.
            </span>
          ),
        },
      ] as FlagItem[],
    },
  },
  agent: {
    happy: {
      grant: { scope: 'USDC transfers', cap: '5.00 USDC / day', expiry: '7 days', agent: 'agens.justan.id' },
      flags: [] as FlagItem[],
    },
    adversarial: {
      grant: { scope: 'All tokens · all methods', cap: 'Unlimited', expiry: 'Never', agent: '0x7c2d…e410' },
      flags: [
        {
          level: 'red',
          text: (
            <span>
              <b>Unscoped grant.</b> This permission covers every token and every method, equivalent to handing over the
              account.
            </span>
          ),
        },
        {
          level: 'amber',
          text: (
            <span>
              <b>No cap, no expiry.</b> A scoped grant names an amount and an end date. This one names neither.
            </span>
          ),
        },
      ] as FlagItem[],
    },
  },
};

// Shared settled/end state inside a dialog.
export function Settled({
  title,
  sub,
  onDone,
  blocked = false,
  cta = 'Next scene',
}: {
  title: string;
  sub: string;
  onDone: () => void;
  blocked?: boolean;
  cta?: string;
}) {
  return (
    <div className="animate-jd-fade text-center">
      {blocked ? (
        <div className="border-red-line bg-red-bg text-red mx-auto grid h-[72px] w-[72px] place-items-center rounded-full border">
          <JdIcon.Block size={28} />
        </div>
      ) : (
        <FaceScan done size={72} />
      )}
      <div className="mb-1 mt-3.5 text-[16px] font-semibold">{title}</div>
      <div className="text-ink-3 mb-[18px] font-mono text-[12px]">{sub}</div>
      <button type="button" className={`${btnPrimary} w-full`} onClick={onDone}>
        {cta} <JdIcon.Arrow />
      </button>
    </div>
  );
}

// Scene: connect + create account.
export function SceneCreate({ onDone, oneStep }: { onDone: () => void; oneStep?: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'created'>('idle');
  useEffect(() => {
    if (phase === 'scanning') {
      const t = setTimeout(() => setPhase('created'), 2000);
      return () => clearTimeout(t);
    }
  }, [phase]);
  return (
    <JawDialog>
      {phase === 'idle' && (
        <div className="animate-jd-fade text-center">
          <FaceScan />
          <div className="mb-1 mt-4 text-[15px] font-medium">Create your account</div>
          <p className="text-ink-2 mb-[18px] text-[13px] leading-[1.55]">
            Face ID · Touch ID · Passkey. Keys stay on your device.
          </p>
          <button
            type="button"
            className={`${btnPrimary} w-full`}
            onClick={() => (oneStep ? onDone() : setPhase('scanning'))}
          >
            Connect <JdIcon.Arrow />
          </button>
        </div>
      )}
      {phase === 'scanning' && (
        <div className="animate-jd-fade text-center">
          <FaceScan />
          <div className="mb-1 mt-4 text-[15px] font-medium">Creating your account…</div>
          <p className="text-ink-2 text-[13px]">Verifying passkey · no popup, no extension, no seed phrase.</p>
        </div>
      )}
      {phase === 'created' && (
        <div className="animate-jd-fade">
          <FaceScan done size={72} />
          <div className="mb-4 mt-3 text-center">
            <div className="text-[16px] font-semibold">Account created</div>
            <div className="text-ink-3 mt-[3px] font-mono text-[12px]">1 passkey · 0 seed phrases</div>
          </div>
          <div className="mb-3.5">
            <CopyRow value="mia.justan.id" sub="0x80d1…b336 · named at creation, not after" />
          </div>
          <button type="button" className={`${btnPrimary} w-full`} onClick={onDone}>
            Continue <JdIcon.Arrow />
          </button>
        </div>
      )}
    </JawDialog>
  );
}

// Scene: SIWE sign-in (happy or adversarial payload).
export function SceneSiwe({ act, onDone, oneStep }: { act: Act; onDone: () => void; oneStep?: boolean }) {
  const p = PAYLOADS.siwe[act];
  const [phase, setPhase] = useState<'review' | 'signed' | 'blocked'>('review');
  const flagged = p.flags.length > 0;
  useEffect(() => {
    setPhase('review');
  }, [act]);
  return (
    <JawDialog flagged={flagged && phase === 'review'}>
      {phase === 'review' && (
        <div className="animate-jd-fade" key={act}>
          <DialogTitle
            kicker="Signature request"
            title="Sign in"
            right={flagged ? <Flag tone="red">Flagged</Flag> : <Flag tone="green">Verified</Flag>}
          />
          <div className="border-line mb-3 rounded-xl border px-3.5 py-1">
            <Field k="Domain" v={p.domain} vStyle={flagged ? { color: 'var(--red)' } : undefined} />
            <Field k="Origin" v={p.origin} />
            <Field k="Statement" v={p.statement} vSans />
            <Field k="URI" v={p.uri} vStyle={flagged ? { color: 'var(--amber)' } : undefined} />
            <Field k="Nonce" v={p.nonce} />
          </div>
          {p.flags.map((f, i) => (
            <Warn key={i} level={f.level}>
              {f.text}
            </Warn>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={() => flagged && (oneStep ? onDone() : setPhase('blocked'))}
            >
              {flagged ? 'Reject' : 'Cancel'}
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={flagged}
              onClick={() => (oneStep ? onDone() : setPhase('signed'))}
            >
              {flagged ? 'Sign anyway' : 'Sign in'}
            </button>
          </div>
          {flagged && (
            <div className="text-ink-3 mt-2.5 text-center text-[11.5px]">
              JAW disables one-tap signing on flagged requests.
            </div>
          )}
        </div>
      )}
      {phase === 'signed' && <Settled title="Signed in" sub="1 signature · origin verified" onDone={onDone} />}
      {phase === 'blocked' && (
        <Settled
          blocked
          title="Request rejected"
          sub="Nothing was signed. The dApp only sees a refusal."
          onDone={onDone}
        />
      )}
    </JawDialog>
  );
}

function AgentRun({ onNext }: { onNext: () => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 1800);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="animate-jd-fade">
      <DialogTitle
        kicker="Agent session"
        title="agens.justan.id is working"
        right={done ? <Flag tone="green">Within cap</Flag> : null}
      />
      <div className="border-line mb-3.5 overflow-hidden rounded-xl border">
        <div className="border-line flex items-center gap-3 border-b px-3.5 py-3">
          {done ? (
            <span className="bg-jaw-blue grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-white">
              <JdIcon.Check size={11} />
            </span>
          ) : (
            <Spinner />
          )}
          <div className="flex-1 text-[13px]">
            Pay 2.00 USDC to <span className="font-mono text-[12px]">api.dataprovider.eth</span>
          </div>
          <span className={`font-mono text-[11px] ${done ? 'text-green' : 'text-ink-3'}`}>
            {done ? 'Confirmed' : 'Signing'}
          </span>
        </div>
        <div className={`flex items-center gap-3 px-3.5 py-3 ${done ? 'opacity-100' : 'opacity-40'}`}>
          <span className="border-line-2 text-ink-3 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border text-[10.5px] font-semibold">
            2
          </span>
          <div className="flex-1 text-[13px]">
            Pay 8.00 USDC to <span className="font-mono text-[12px]">api.dataprovider.eth</span>
          </div>
          <span className="text-ink-3 font-mono text-[11px]">Queued</span>
        </div>
      </div>
      <div className="text-ink-2 mb-3.5 text-[12.5px]">
        The agent signs with its own session key. Your passkey is never touched.
      </div>
      <button type="button" className={`${btnPrimary} w-full`} disabled={!done} onClick={onNext}>
        Let it try the second call <JdIcon.Arrow />
      </button>
    </div>
  );
}

// Scene: agent delegation (happy or adversarial grant).
export function SceneAgent({ act, onDone, oneStep }: { act: Act; onDone: () => void; oneStep?: boolean }) {
  const p = PAYLOADS.agent[act];
  const flagged = p.flags.length > 0;
  const [phase, setPhase] = useState<'grant' | 'run1' | 'blockedcap' | 'revoked' | 'rejected'>('grant');
  useEffect(() => {
    setPhase('grant');
  }, [act]);
  const g = p.grant;
  return (
    <JawDialog flagged={flagged && phase === 'grant'}>
      {phase === 'grant' && (
        <div className="animate-jd-fade" key={act}>
          <DialogTitle
            kicker="Permission request"
            title="Delegate to agent"
            right={flagged ? <Flag tone="red">Flagged</Flag> : <Flag tone="green">Scoped</Flag>}
          />
          <div className="border-line mb-3 rounded-xl border px-3.5 py-1">
            <Field k="Agent" v={g.agent} />
            <Field k="Scope" v={g.scope} vStyle={flagged ? { color: 'var(--red)' } : undefined} />
            <Field k="Cap" v={g.cap} vStyle={flagged ? { color: 'var(--red)' } : undefined} />
            <Field k="Expires" v={g.expiry} vStyle={flagged ? { color: 'var(--amber)' } : undefined} />
          </div>
          {p.flags.map((f, i) => (
            <Warn key={i} level={f.level}>
              {f.text}
            </Warn>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={() => (flagged ? (oneStep ? onDone() : setPhase('rejected')) : null)}
            >
              {flagged ? 'Reject' : 'Cancel'}
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={flagged}
              onClick={() => (oneStep ? onDone() : setPhase('run1'))}
            >
              {flagged ? 'Grant anyway' : 'Grant permission'}
            </button>
          </div>
        </div>
      )}
      {phase === 'run1' && <AgentRun onNext={() => setPhase('blockedcap')} />}
      {phase === 'blockedcap' && (
        <div className="animate-jd-fade">
          <DialogTitle
            kicker="Policy enforcement"
            title="Second attempt blocked"
            right={<Flag tone="red">Blocked</Flag>}
          />
          <div className="border-line mb-3 rounded-xl border px-3.5 py-1">
            <Field k="Attempted" v="8.00 USDC" />
            <Field k="Spent today" v="2.00 / 5.00 USDC" />
            <Field k="Result" v="Exceeds daily cap, reverted" vStyle={{ color: 'var(--red)' }} />
          </div>
          <Warn level="red">
            <b>Enforced onchain, not by policy text.</b> The cap lives in the account. No JAW server was asked, and none
            could override it.
          </Warn>
          <button type="button" className={`${btnPrimary} mt-3 w-full`} onClick={() => setPhase('revoked')}>
            Revoke permission
          </button>
        </div>
      )}
      {phase === 'revoked' && (
        <Settled
          title="Permission revoked"
          sub="The agent spent 2 USDC. It can never spend more."
          onDone={onDone}
          cta="Finish"
        />
      )}
      {phase === 'rejected' && (
        <Settled blocked title="Grant rejected" sub="The agent received nothing." onDone={onDone} cta="Finish" />
      )}
    </JawDialog>
  );
}
