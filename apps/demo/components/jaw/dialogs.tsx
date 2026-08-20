'use client';

import { btnGhost, btnPrimary, DialogTitle, Field, Flag, JawDialog, JdIcon, Warn } from './shared';

type DoneProps = { onDone: () => void };

// Transfer: settle three recipients under one signature.
export function TransferDialog({ onDone }: DoneProps) {
  return (
    <JawDialog>
      <div className="animate-jd-fade">
        <DialogTitle
          kicker="Transfer · 3 recipients"
          title="Settle 72.50 USDC"
          right={<Flag tone="green">Names resolved</Flag>}
        />
        <div className="border-line mb-3 rounded-xl border px-3.5 py-1">
          <Field k="To" v="karim.justan.id · 42.50" />
          <Field k="To" v="samira.justan.id · 18.00" />
          <Field k="To" v="youssef.justan.id · 12.00" />
          <Field k="Resolves to" v="3 names, all checked" />
          <Field k="Network fee" v="0.04 USDC" />
          <Field k="Total" v="72.54 USDC" />
        </div>
        <div className="text-ink-2 mb-3 text-[12.5px] leading-[1.55]">
          Each name is resolved and shown next to the address it points at, so the recipients are checked before the
          tap, not after. All three transfers go out under one signature.
        </div>
        <button type="button" className={`${btnPrimary} w-full`} onClick={onDone}>
          Confirm with Face ID <JdIcon.Arrow />
        </button>
      </div>
    </JawDialog>
  );
}

// Transfer, hostile: a lookalike name pointing at a different address.
export function TransferAdvDialog({ onDone }: DoneProps) {
  return (
    <JawDialog flagged>
      <div className="animate-jd-fade">
        <DialogTitle kicker="Transfer · 1 recipient" title="Send 42.50 USDC" right={<Flag tone="red">Flagged</Flag>} />
        <div className="border-line mb-3 rounded-xl border px-3.5 py-1">
          <Field k="To" v="kаrim.justan.id" vStyle={{ color: 'var(--red)' }} />
          <Field k="Resolves to" v="0x4f19…c2ab" vStyle={{ color: 'var(--red)' }} />
          <Field k="You usually pay" v="0x3c8a…91f0" />
          <Field k="Amount" v="42.50 USDC" />
        </div>
        <Warn level="red">
          <b>Lookalike name.</b> The <span className="font-mono">a</span> in this name is Cyrillic.{' '}
          <span className="font-mono">kаrim.justan.id</span> is not the{' '}
          <span className="font-mono">karim.justan.id</span> you have paid before.
        </Warn>
        <Warn level="amber">
          <b>New address.</b> This name resolves to an address registered 9 minutes ago, with no history with this
          account.
        </Warn>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className={btnGhost} onClick={onDone}>
            Reject
          </button>
          <button type="button" className={btnPrimary} disabled>
            Send anyway
          </button>
        </div>
        <div className="text-ink-3 mt-2.5 text-center text-[11.5px]">
          JAW disables one-tap signing on flagged requests.
        </div>
      </div>
    </JawDialog>
  );
}

type Step = { n: string; t: string; s: string; bad?: boolean };

function StepList({ steps }: { steps: Step[] }) {
  return (
    <div className="border-line mb-3 overflow-hidden rounded-xl border">
      {steps.map((st, i) => (
        <div
          key={st.n}
          className={`flex items-start gap-3 px-3.5 py-3 ${i < steps.length - 1 ? 'border-line border-b' : ''} ${
            st.bad ? 'bg-[rgba(220,38,38,.05)]' : 'bg-transparent'
          }`}
        >
          <span
            className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border text-[10.5px] font-semibold ${
              st.bad ? 'border-red text-red' : 'border-line-2 text-ink-3'
            }`}
          >
            {st.n}
          </span>
          <div className="min-w-0">
            <div className={`text-[13.5px] font-semibold ${st.bad ? 'text-red' : 'text-ink'}`}>{st.t}</div>
            <div className={`mt-[3px] font-mono text-[10.5px] ${st.bad ? 'text-red' : 'text-ink-3'}`}>{st.s}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Swap: approve + swap batched into one signature.
export function SwapDialog({ onDone }: DoneProps) {
  const steps: Step[] = [
    { n: '1', t: 'Approve 25.00 USDC', s: 'Exact amount · Swapr router · expires in 30 min' },
    { n: '2', t: 'Swap 25.00 USDC for 0.0081 ETH', s: 'Min received 0.0080 ETH · slippage 0.5%' },
  ];
  return (
    <JawDialog>
      <div className="animate-jd-fade">
        <DialogTitle
          kicker="Batched call · 2 actions"
          title="Swap USDC for ETH"
          right={<Flag tone="green">1 signature</Flag>}
        />
        <StepList steps={steps} />
        <div className="border-line mb-3 rounded-xl border px-3.5 py-1">
          <Field k="Rate" v="1 ETH = 3,086 USDC" />
          <Field k="Network fee" v="0.03 USDC" />
        </div>
        <div className="text-ink-2 mb-3 text-[12.5px] leading-[1.55]">
          Both calls execute atomically. If the swap fails, the approval never happened.
        </div>
        <button type="button" className={`${btnPrimary} w-full`} onClick={onDone}>
          Confirm swap <JdIcon.Arrow />
        </button>
      </div>
    </JawDialog>
  );
}

// Swap, hostile: a third call smuggled into the batch.
export function SwapAdvDialog({ onDone }: DoneProps) {
  const steps: Step[] = [
    { n: '1', t: 'Approve 25.00 USDC', s: 'Exact amount · Swapr router · expires in 30 min', bad: false },
    { n: '2', t: 'Swap 25.00 USDC for 0.0081 ETH', s: 'Min received 0.0080 ETH · slippage 0.5%', bad: false },
    { n: '3', t: 'Approve unlimited USDC', s: 'Spender 0x9f02…7d41 · no expiry · not part of this swap', bad: true },
  ];
  return (
    <JawDialog flagged>
      <div className="animate-jd-fade">
        <DialogTitle
          kicker="Batched call · 3 actions"
          title="Swap USDC for ETH"
          right={<Flag tone="red">Flagged</Flag>}
        />
        <StepList steps={steps} />
        <Warn level="red">
          <b>Extra call in the batch.</b> Call 3 grants an unlimited, never-expiring allowance to an address that has
          nothing to do with this swap.
        </Warn>
        <Warn level="amber">
          <b>One signature covers all three.</b> Signing this approves the smuggled call too.
        </Warn>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className={btnGhost} onClick={onDone}>
            Reject
          </button>
          <button type="button" className={btnPrimary} disabled>
            Confirm anyway
          </button>
        </div>
        <div className="text-ink-3 mt-2.5 text-center text-[11.5px]">
          Every call in a batch is decoded and shown, not just the first.
        </div>
      </div>
    </JawDialog>
  );
}

// Both together: swap and send batched into one signature.
export function BatchDialog({ onDone }: DoneProps) {
  const steps: Step[] = [
    { n: '1', t: 'Approve 25.00 USDC', s: 'Exact amount · Swapr router' },
    { n: '2', t: 'Swap 25.00 USDC for 0.0081 ETH', s: 'Min received 0.0080 ETH' },
    { n: '3', t: 'Send 0.0081 ETH to ghadii.justaname.eth', s: 'Resolves to 0x3c8a…91f0' },
  ];
  return (
    <JawDialog>
      <div className="animate-jd-fade">
        <DialogTitle
          kicker="Batched call · 3 actions"
          title="Swap and send"
          right={<Flag tone="green">1 signature</Flag>}
        />
        <StepList steps={steps} />
        <div className="text-ink-2 mb-3 text-[12.5px] leading-[1.55]">
          Three calls, one atomic transaction. Either all of it happens or none of it does, and the user taps once.
        </div>
        <button type="button" className={`${btnPrimary} w-full`} onClick={onDone}>
          Confirm with Face ID <JdIcon.Arrow />
        </button>
      </div>
    </JawDialog>
  );
}
