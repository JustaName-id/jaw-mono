'use client';

import { useCallback, useEffect, useState, useRef, type MutableRefObject } from 'react';
import { debugLog } from '../lib/debug-log';
import { selectScreen, type Phase } from '../lib/select-screen';
import { RequestModals } from '../components/RequestModals';
import { extractTransactionData } from '../lib/tx-handler';
import type { TransactionRequestData } from '../components/TransactionModal';
import { useAuth, usePasskeys } from '../hooks';
import { SignInScreen, type AuthenticatedAccount } from '../components/OnboardingSection';
import { PasskeyManager, type PasskeyAccount } from '@jaw.id/core';
import { SiweModal } from '../components/SiweModal';
import { ensureIntNumber, type SignInWithEthereumCapabilityRequest } from '@jaw.id/core';
import { ConnectModal } from '../components/ConnectModal';
import { UnsupportedMethodModal } from '../components/UnsupportedMethodModal';
import { SDKRequestType } from '../lib/sdk-types';
import { PopupCommunicator, type Message } from '../lib/popup-communicator';
import { EmbeddedShell } from '../components/EmbeddedShell';
import { CryptoHandler } from '../lib/crypto-handler';
import { applyAccountHint } from '../lib/account-hint';
import { iframeBlocksPasskeyCreation } from '../lib/embedded-ui';
import { isSilentContinueAsConnect } from '../lib/continue-as-connect';
import { sendSessionHandoff, registerSessionHandoffListener } from '../lib/session-handoff';
import type { SessionAuthState } from '../lib/session-manager';
import type { RPCRequestMessage, RPCResponseMessage, MessageID } from '@jaw.id/core';
import { RECONNECT_REQUIRED } from '@jaw.id/core';
import { getSiweOriginWarning, OnboardingSkeleton } from '@jaw.id/ui';
import { applyDappTheme } from '../lib/apply-dapp-theme';
import { createSiweMessage } from 'viem/siwe';
import { ChainId } from '@justaname.id/sdk';
import type { PopupConfig, PendingRequest } from '../utils/types';
import { extractSubnameTextRecords } from '../lib/extractSubnameTexts';
import { standardErrorCodes } from '@jaw.id/core';

// Note: TransactionRequestData is now imported from TransactionModal for consistency

// Simple state types
// Phase lives with the screen decision (lib/select-screen) so the two unions
// stay disjoint by construction — sharing members is what made half of that
// function an identity mapping.

// Delay before closing the dialog once a flow completes. The response is
// already posted to the SDK *before* this timer starts (each flow does
// `await onApprove(...)` then `scheduleClose(...)`), and a 'completed'
// DialogClose never rejects a pending request — so this is purely event-loop
// margin to let the SDK drain the result ahead of the close, not a round-trip
// budget. 300ms stays effectively instant while giving a busy main thread
// comfortable headroom.
const CLOSE_DELAY_MS = 300;

// After a signature is delivered, hold the "Signed ✓" confirmation on screen this
// long before the dialog closes. This delays ONLY the close — the signature is
// already posted to the dApp via `await onApprove(...)` before the hold — so the
// dApp never waits on the animation. The hold rides on the cancelable close timer
// rather than an awaited sleep, so a new request arriving mid-tick simply cancels
// it (see finishDeliveredFlow).
const SIGNED_TICK_MS = 850;

export default function KeysJawIdApp() {
  // Single communicator instance, shared by the embedded shell (presentation
  // + iframe escape hatches) and the app content (message flow).
  const [communicator] = useState(() => new PopupCommunicator());
  // The shell owns the overlay tap but the content owns the flow state, so the
  // content registers what a cancel should drop.
  const cancelFlowRef = useRef<(() => void) | undefined>(undefined);

  return (
    <EmbeddedShell communicator={communicator} onCancel={() => cancelFlowRef.current?.()}>
      <KeysJawIdAppContent communicator={communicator} cancelFlowRef={cancelFlowRef} />
    </EmbeddedShell>
  );
}

function KeysJawIdAppContent({
  communicator,
  cancelFlowRef,
}: {
  communicator: PopupCommunicator;
  cancelFlowRef: MutableRefObject<(() => void) | undefined>;
}) {
  // Current origin for session-based auth
  const [currentOrigin, setCurrentOrigin] = useState<string | null>(null);

  // Use hooks for passkey operations (pass origin for session-based auth)
  const authQuery = useAuth({ origin: currentOrigin || undefined });
  const passkeyQuery = usePasskeys();

  // Service instances (created once)
  const [cryptoHandler] = useState(() => new CryptoHandler());

  // Simple state
  const [isSDKMode, setIsSDKMode] = useState(false);
  const [phase, setPhase] = useState<Phase>('starting');
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  // Parent-owned so the "Signed ✓" tick appears only AFTER onApprove confirms delivery,
  // never before. Reset per request (below) so a prior tick can't bleed into the next.
  const [signDelivered, setSignDelivered] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<PasskeyAccount | null>(null);
  // Parsed alongside the request that carries it, never during render: the modal
  // is a child component now, so a setState from its render body would be an
  // update to this component from inside another one — React schedules that
  // instead of re-running, so the child's `null` commits first and the dialog
  // blanks for a frame. Parsing here also lets a malformed request be rejected
  // properly rather than dead-ending on an error screen.
  const [txData, setTxData] = useState<TransactionRequestData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ensConfig, setEnsConfig] = useState<string | undefined>(undefined);
  const [chainId, setChainId] = useState<ChainId | undefined>(undefined);
  // The dApp's API key. It arrives in the transport config message (seeded from
  // the SDK's store), is used to bootstrap the account screen, and is then
  // overridden by the handshake's chain.rpcUrl — the authoritative source. Never
  // fall back to the keys app's own key: that key identifies a different project
  // for ENS subname issuance and billing, so using it would misattribute both.
  const [apiKey, setApiKey] = useState<string | undefined>(undefined);
  // Embedded only: credentialId of the account the dApp is currently
  // connected as (the handshake's lastAccount hint). Preferred as the
  // "Continue as" default so this partition tracks a popup-side account
  // switch it can otherwise never see. UI pointer only — auth state still
  // comes exclusively from the passkey ceremony.
  const [hintedCredentialId, setHintedCredentialId] = useState<string | null>(null);
  // This popup was opened by the SDK because the embedded iframe couldn't run
  // WebAuthn create() (the reason WE sent rides back on the URL) — the user
  // was creating an account, so open on the create view.
  const [startInCreate] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('switch-reason') === 'webauthn-unsupported'
  );
  const effectiveChainId = (chainId ?? pendingRequest?.chain?.id ?? 1) as ChainId;

  // Reset the tick on each new request so a prior success can't bleed into the next.
  useEffect(() => {
    setSignDelivered(false);
  }, [pendingRequest]);

  const configRef = useRef<PopupConfig | null>(null);
  // Mirrors `phase` so the (once-registered) message listener can read the
  // CURRENT phase without a stale closure. Updated on every render.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // The embedded hint apply, while it is in flight. Any other code that wants to
  // read the account list has to wait on it: until it settles, a wiped partition
  // has no record of the hinted account and the list reads as empty.
  const hintApplyRef = useRef<Promise<unknown> | null>(null);
  // Same stale-closure guard, for the bare-handshake policy: it has to know
  // whether a flow is already on screen before it decides to reset anything.
  const pendingRequestRef = useRef(pendingRequest);
  pendingRequestRef.current = pendingRequest;
  // Holds the pending success→close timer so a new flow can cancel a previous
  // flow's auto-close (the embedded iframe stays mounted across flows).
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once this flow's response has been delivered — the flow is finished even
  // though its modal lingers to show the delivered tick. `phase` cannot express
  // this: 'done' is the terminal marker AND what unmounts the modal, so setting
  // it would cut the tick short. Cleared when the next request takes over.
  const flowDoneRef = useRef(false);

  /**
   * Whether the flow on screen is over: it reached a terminal phase, or it
   * delivered its response and lingers only to show the tick. Read from refs
   * because both callers run inside the once-registered message listener.
   */
  const flowFinished = () => phaseRef.current === 'done' || phaseRef.current === 'failed' || flowDoneRef.current;

  /**
   * Schedule the dialog close after a flow completes. Cancelable: starting a new
   * flow clears any pending close so a prior flow's timer can't hide the dialog
   * mid-request (which, with no business-request timeout, would hang the dApp).
   */
  const scheduleClose = useCallback(
    (ms: number) => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        communicator.requestClose();
      }, ms);
    },
    [communicator]
  );

  /**
   * Close out a flow whose response has already been delivered, holding the tick on
   * screen first.
   *
   * Marks the flow done SYNCHRONOUSLY and lets the (cancelable) close timer carry the
   * delay. Nothing is awaited, so there is no continuation that could outlive the flow
   * and write over a newer request's screen — and if a new request does arrive during
   * the hold, the listener cancels this timer and resets, which is exactly right.
   */
  const finishDeliveredFlow = useCallback(() => {
    setSignDelivered(true);
    flowDoneRef.current = true;
    scheduleClose(SIGNED_TICK_MS + CLOSE_DELAY_MS);
  }, [scheduleClose]);

  /**
   * The user walked away from the flow — the dialog's X, or a tap outside it.
   * (Outside taps only reach the inline screens; an open modal renders its own
   * overlay, which captures the click and routes it through its own cancel.)
   *
   * Either way the SDK rejects the request on its side, so drop it here too: one
   * left in state reads as a flow still in progress, and the bare handshake below
   * refuses to disturb one of those. The shell closes the dialog itself, so its
   * end of this only does the drop.
   */
  cancelFlowRef.current = () => {
    flowDoneRef.current = true;
    setPendingRequest(null);
  };
  const cancelFlow = useCallback(() => {
    cancelFlowRef.current?.();
    communicator.requestClose('cancelled');
  }, [communicator, cancelFlowRef]);

  // Latest auth refetch for the (once-registered) handoff listener below —
  // same stale-closure guard as phaseRef.
  const refetchAuthRef = useRef(authQuery.refetch);
  refetchAuthRef.current = authQuery.refetch;

  // Safari cannot CREATE passkeys inside the cross-origin iframe (get() works,
  // so "Continue as" stays embedded). The create action must escape to the
  // popup synchronously within the user's click — an attempt-then-switch loses
  // the transient activation and Safari blocks the popup window.
  const createEscapesToPopup = communicator.isEmbedded() && iframeBlocksPasskeyCreation();
  const switchToPopupForCreate = useCallback(
    () => communicator.requestSwitchToPopup('webauthn-unsupported'),
    [communicator]
  );

  /**
   * Popup context only: after the user approves a connection, hand the
   * freshly authenticated session to the embedded keys iframe in the dApp
   * page, so the next embedded action decrypts directly instead of walking
   * the user through reconnect + a second "Continue as" passkey ceremony
   * (Safari storage partitioning). Best-effort — see lib/session-handoff.ts.
   */
  const handOffSessionToEmbedded = useCallback(
    async (origin: string) => {
      if (communicator.getContext() !== 'popup') return;
      try {
        const session = await cryptoHandler.getSession(origin);
        if (session?.authState) {
          sendSessionHandoff({ dappOrigin: origin, session });
        } else {
          debugLog('[SessionHandoff] not sent: no session/authState for', origin);
        }
      } catch {
        /* best-effort: the reconnect + Continue-as flow remains the fallback */
      }
    },
    [communicator, cryptoHandler]
  );

  // Embedded only: accept a session handed off by the same-origin popup. This
  // listens on the raw window on purpose — the sender is the popup, not the
  // communicator counterpart (the parent), so the communicator's
  // source-checked channel does not apply (see lib/session-handoff.ts).
  useEffect(() => {
    if (!communicator.isEmbedded()) return;
    return registerSessionHandoffListener({
      isEmbedded: () => communicator.isEmbedded(),
      getEmbedderOrigin: () => communicator.getOrigin(),
      importSession: (origin, session) => cryptoHandler.getSessionManager().importSession(origin, session),
      seedAccountList: (authState) =>
        new PasskeyManager().addAccountToList({
          username: authState.username,
          credentialId: authState.credentialId,
          publicKey: authState.publicKey,
          address: authState.address,
          creationDate: new Date().toISOString(),
          isImported: false,
        }),
      onImported: () => {
        void refetchAuthRef.current();
      },
    });
  }, [communicator, cryptoHandler]);

  // Single useEffect for all message handling
  useEffect(() => {
    // Check if running in popup mode
    if (!communicator.hasOpener()) {
      debugLog('📱 Running in normal mode (no opener)');
      setIsSDKMode(false);
      return;
    }

    debugLog('🚀 Running in SDK popup mode');
    setIsSDKMode(true);

    // Initialize crypto handler
    cryptoHandler
      .initialize()
      .then(() => {
        debugLog('✅ CryptoHandler initialized');
        // Send PopupLoaded event
        communicator.sendPopupLoaded();
      })
      .catch((err) => {
        console.error('❌ Failed to initialize CryptoHandler:', err);
        setError('Failed to initialize');
        setPhase('failed');
      });

    // Listen for messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanup = communicator.onMessage<PopupConfig>((message: any) => {
      // Log only the message shape, never the full payload — it includes the
      // embedder URL, metadata and the encrypted envelope (visible to any
      // extension with console access).
      debugLog('📥 Received message:', message?.event ?? (message?.requestId ? 'response' : 'request'));

      // Handle config message
      if (message.data?.version) {
        setConfig(message.data);
        configRef.current = message.data;

        setEnsConfig(message.data.preference?.ens);
        setChainId(message.data.metadata?.defaultChainId as ChainId);
        // Bootstrap the API key from the transport config message so the account
        // screen has the dApp's key before the handshake arrives. Guarded so a
        // config message without one can't wipe a key already set; the handshake
        // chain.rpcUrl remains the authoritative source and overrides it.
        if (message.data.apiKey) {
          setApiKey(message.data.apiKey);
        }

        // Apply the dApp's theme tokens so the embedded dialog matches its
        // look & feel (accent color, border radius, light/dark), translated
        // into keys' own shadcn-HSL token system. Falls back to the OS theme
        // (SystemThemeListener) when no theme is sent.
        if (message.data.theme) {
          applyDappTheme(message.data.theme);
        }

        // Embedded only: our storage is partitioned (wiped between visits in
        // Brave/Safari) AND blind to flows that ran in the popup's first-party
        // world — on Safari an account switch routes to the popup, so this
        // partition would keep offering the OLD identity and sign with the
        // wrong passkey. Apply the dApp-side hint (the account the dApp is
        // actually connected as) before checkForPasskeys reads the list:
        // append-only on the account list, and preferred as the "Continue as"
        // default. The hint is only a credentialId pointer — the public key
        // and display name are resolved from the backend registry, never
        // trusted from the dApp. The apply is async (backend roundtrip,
        // bounded by a timeout), so only checkForPasskeys waits on it; the
        // handshake ack below must not. Popup/standalone contexts have real
        // first-party storage and take no hint.
        if (communicator.isEmbedded()) {
          hintApplyRef.current = applyAccountHint(message.data.lastAccount, {
            apiKey: message.data.apiKey,
          }).then((hinted) => {
            if (hinted) {
              setHintedCredentialId(hinted);
              debugLog('🌱 Applied backend-resolved lastAccount hint as the Continue-as default');
            }
            // Always show account selection UI - never auto-authenticate
            return checkForPasskeys();
          });
        } else {
          // Always show account selection UI - never auto-authenticate
          checkForPasskeys();
        }

        communicator.sendPopupReady(message.requestId);
      }

      // Live theme update: the dApp pushed a new theme (e.g. an OS light/dark
      // flip) without reconnecting. Re-apply it so the embedded dialog tracks
      // the host — this is what makes theme sync robust against the prewarm
      // one-shot. Same mapping as the config branch.
      if (message.event === 'SetTheme') {
        if (message.data?.theme) {
          applyDappTheme(message.data.theme);
        }
      }

      // Handle selectSignerType event
      if (message.event === 'selectSignerType') {
        communicator.sendResponse(message.id, 'scw');
      }

      // Handle RPC requests
      if (message.id && message.sender && message.content) {
        // The embedded iframe stays mounted across flows, so a previous flow may
        // have left a terminal phase ('done'/'failed'), a stale pendingRequest,
        // and a scheduled auto-close — none of which the popup ever hit (fresh
        // page per flow). Reset before handling the new request so it renders its
        // own UI and is not closed by the previous flow's timer. Read the live
        // state via a ref (the listener is registered once → stale closure).
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        // Reset only a FINISHED flow — an in-progress one (e.g. a cold connect's
        // passkey screen) must survive. Finished means either a terminal `state`, or
        // `flowDoneRef` for a flow that delivered its response and is only still on
        // screen to show the tick. The SDK does not serialize requests, so a new one
        // can genuinely arrive mid-tick; that is the case flowDoneRef covers.
        if (flowFinished()) {
          flowDoneRef.current = false;
          setError(null);
          setPendingRequest(null);
          setPhase('working');
        }

        const rpcMessage = message as RPCRequestMessage;

        // Handle handshake (unencrypted initial request)
        if ('handshake' in rpcMessage.content) {
          handleHandshakeRequest(rpcMessage);
        }

        // Handle encrypted request
        if ('encrypted' in rpcMessage.content) {
          handleEncryptedRequest(rpcMessage);
        }
      }
    });

    // Cleanup message listener on unmount (PopupUnload is handled by communicator's beforeunload)
    return () => {
      cleanup();
      // Don't let a scheduled close fire after unmount (dev hot-reload / nav).
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle transition to account-selection when handshake arrives for authenticated users
  useEffect(() => {
    if (
      pendingRequest?.type === SDKRequestType.CONNECT &&
      currentAccount &&
      (phase === 'working' || phase === 'confirming-account' || phase === 'creating-passkey')
    ) {
      setPhase('choosing-account');
    }
  }, [pendingRequest, phase, currentAccount]);

  // Handle eth_chainId request (no UI needed, respond directly)
  useEffect(() => {
    if (pendingRequest?.type === SDKRequestType.CHAIN_ID && isSDKMode) {
      const handleChainId = async () => {
        try {
          const chainId = pendingRequest.chain?.id ?? 1;
          const chainIdHex = `0x${chainId.toString(16)}`;
          await pendingRequest.onApprove(chainIdHex);
          scheduleClose(CLOSE_DELAY_MS);
        } catch (error) {
          console.error('❌ Failed to handle eth_chainId:', error);
          await pendingRequest.onReject(
            error instanceof Error ? error.message : 'Failed to get chain ID',
            standardErrorCodes.rpc.internal
          );
          scheduleClose(CLOSE_DELAY_MS);
        }
      };
      handleChainId();
    }
  }, [pendingRequest, isSDKMode, scheduleClose]);

  /**
   * Put the account screen up without racing the embedded hint apply.
   *
   * The config branch defers its own checkForPasskeys until the hint has been
   * appended, but acks PopupReady before that settles — so the handshake can
   * arrive mid-lookup. Reading the list then shows an empty partition and flashes
   * the create-account screen at a returning user, who may well tap it.
   */
  const driveAccountScreen = () => {
    void Promise.resolve(hintApplyRef.current).then(() => checkForPasskeys());
  };

  // Check for existing passkeys using hooks
  const checkForPasskeys = async () => {
    setPhase('reading-passkeys');

    try {
      // Refetch and use the returned fresh data (not the cached hook values)
      const accountsResult = await passkeyQuery.refetchAccounts();

      const accounts = accountsResult.data || [];

      if (accounts.length > 0) {
        // Has accounts - show account selection/auth screen
        setPhase('confirming-account');
      } else {
        // No accounts - need to create
        setPhase('creating-passkey');
      }
    } catch (err) {
      console.error('❌ Error checking passkeys:', err);
      setError('Failed to check for passkeys');
      setPhase('failed');
    }
  };

  /**
   * Answer a handshake we cannot serve. Plain (unencrypted) failure: there is no
   * usable shared secret with this peer, and the SDK throws on `content.failure`
   * in a handshake response (CrossPlatformSigner.handshake), so the dApp's
   * promise rejects instead of waiting on a reply that never comes.
   */
  const rejectHandshake = (request: RPCRequestMessage, code: number, message: string) => {
    const failure: RPCResponseMessage = {
      requestId: request.id,
      id: crypto.randomUUID() as MessageID,
      sender: '',
      correlationId: request.correlationId,
      content: { failure: { code, message } },
      timestamp: new Date(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    communicator.sendMessage(failure as any);
  };

  // Handle handshake request (unencrypted)
  const handleHandshakeRequest = async (request: RPCRequestMessage) => {
    try {
      if (!('handshake' in request.content) || !request.content.handshake) {
        console.error('❌ Invalid handshake request');
        return;
      }

      // Get origin and set it as current context
      const origin = communicator.getOrigin() || '';
      setCurrentOrigin(origin);
      cryptoHandler.setOrigin(origin);

      const peerPublicKey = request.sender;
      const method = request.content.handshake.method;
      const params = request.content.handshake.params;
      const chain = request.content.chain;

      debugLog('🔍 =========================');
      debugLog('🔍 HANDSHAKE REQUEST RECEIVED:');
      debugLog('🔍 Origin:', origin);
      debugLog('🔍 Method:', method);
      debugLog('🔍 =========================');

      const apiKeyFromProvider = request.content?.chain?.rpcUrl?.split('api-key=')[1];
      if (apiKeyFromProvider && apiKeyFromProvider !== apiKey) {
        setApiKey(apiKeyFromProvider);
      }

      // Check for existing session
      const existingSession = await cryptoHandler.getSession(origin);

      // Pure key exchange — the SDK's cold-start signal, sent only from its
      // no-signer branch. Means the dApp holds no signer. A reload with a live
      // one never lands here: the SDK restores its signer and uses the normal path.
      if (method === 'handshake') {
        // A request the user has not answered yet owns this origin's session. The
        // SDK assigns its signer only after a connect handshake resolves, so a
        // second dApp call takes the same no-signer branch and lands here; serving
        // it would rotate the peer key out from under the live flow and replace
        // its pendingRequest, closures included. Neither side times out, so that
        // flow would simply never settle. Sessions are one per origin, so nothing
        // about the screen can tell a cold start from a concurrent second call —
        // identity of the live request is the only signal. Refuse the newcomer
        // (EIP-1193's -32002) and leave the session alone.
        if (pendingRequestRef.current !== null && !flowFinished()) {
          debugLog('⛔ Bare handshake while a request is still live — refusing as busy');
          rejectHandshake(request, standardErrorCodes.rpc.resourceUnavailable, 'A request is already in progress');
          return;
        }

        // First request before any connect. Returning silently hangs the dApp:
        // the SDK awaits this with no timeout and the iframe's isAlive() stays
        // true for the whole session, so its liveness poller never fires either.
        // Answer 4100 rather than minting a session — that would hand an origin
        // the user never approved a live one. JAWProvider reads 4100 from this
        // branch as "connect first" and its `&& this.signer` guard keeps a
        // never-connected provider from emitting a spurious disconnect.
        if (!existingSession) {
          debugLog('🔑 Handshake without session — answering 4100 (connect first)');
          rejectHandshake(
            request,
            standardErrorCodes.provider.unauthorized,
            'No connection for this origin; call wallet_connect first'
          );
          return;
        }

        if (existingSession.peerPublicKey !== peerPublicKey) {
          // Update peer key if changed
          await cryptoHandler.getSessionManager().updatePeerKey(origin, peerPublicKey);
        }

        // Stale auth only: our authState outlives a dApp disconnect (different
        // origin, and sessions never expire), so a cold start has to drop it and
        // re-ask. Gated because these resets are destructive — running them
        // unconditionally is what let a bare handshake wipe a live flow.
        if (existingSession.authState) {
          await cryptoHandler.getSessionManager().updateSession(origin, { authState: null });
          await refetchAuthRef.current();
          debugLog('🧊 Cold-start handshake — dropped stale auth for this origin');
          setCurrentAccount(null);
          setPendingRequest(null);
          setError(null);
          // Must drive, not just clear: the request handler only ever `return`s,
          // so nothing else would put a screen up. Also replaces a stale
          // 'working' phase, which would otherwise still resolve to a modal.
          driveAccountScreen();
        }

        // Acknowledge the handshake
        const response = await cryptoHandler.createHandshakeResponse(request.id, { accounts: [] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        communicator.sendMessage(response as unknown as Message);
        return;
      }

      // For eth_requestAccounts and wallet_connect
      if (method === 'eth_requestAccounts' || method === 'wallet_connect') {
        // Always create a fresh session with new keys for each connection request
        if (existingSession) {
          debugLog('🗑️ Deleting old session for:', origin);
          await cryptoHandler.getSessionManager().deleteSession(origin);
        }

        // Create new session with fresh keys (account will be set when user approves)
        debugLog('🔐 Creating fresh session for:', origin);
        await cryptoHandler.getSessionManager().createSession({
          origin,
          peerPublicKey,
        });

        // Reload session after creation
        await cryptoHandler.loadSession(origin);

        // Set up pending request (for both new connections and SIWE)
        setPendingRequest({
          origin,
          type: SDKRequestType.CONNECT,
          requestId: request.id || '',
          correlationId: request.correlationId || '',
          metadata: configRef.current?.metadata || null,
          method,
          params: Array.isArray(params) ? params : [],
          chain: chain
            ? { id: chain.id, rpcUrl: chain.rpcUrl ?? '', ...(chain.paymaster && { paymaster: chain.paymaster }) }
            : undefined,
          onApprove: async (result: unknown) => {
            const response = await cryptoHandler.createHandshakeResponse(
              request.id,
              result as { accounts: Array<{ address: string; capabilities?: Record<string, unknown> }> }
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            communicator.sendMessage(response as any);
          },
          onReject: async () => {
            // Same reason as cancelFlow: a rejected connect is over, and leaving
            // it in state would make a later bare handshake read it as live.
            setPendingRequest(null);
            communicator.requestClose();
          },
        });

        // Fresh session has no account - checkForPasskeys flow will handle passkey creation/selection
      }
    } catch (err) {
      console.error('❌ Failed to handle handshake:', err);
      setError(err instanceof Error ? err.message : 'Handshake failed');
      setPhase('failed');
    }
  };

  // Handle encrypted request
  const handleEncryptedRequest = async (request: RPCRequestMessage) => {
    try {
      // Load session for this origin
      const origin = communicator.getOrigin() || '';

      // Update React state with current origin (needed for useAuth hook)
      setCurrentOrigin(origin);

      // Reply to the SDK with a reconnect-required sentinel (tied to this
      // request id, carries no secret) so it re-establishes a session against
      // this iframe and retries. Used both when there is NO session and when the
      // session is stale (decrypt fails) — Safari storage partitioning can leave
      // the iframe with a session whose keys no longer match the SDK's.
      const emitReconnectRequired = (reason: string) => {
        console.warn(`⚠️ ${reason} — requesting reconnect for origin:`, origin);
        const reconnectResponse: RPCResponseMessage = {
          requestId: request.id,
          id: crypto.randomUUID() as MessageID,
          sender: '',
          correlationId: request.correlationId,
          content: {
            failure: {
              code: standardErrorCodes.provider.disconnected,
              message: 'No usable session in this context; reconnect required',
              data: { reason: RECONNECT_REQUIRED },
            },
          },
          timestamp: new Date(),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        communicator.sendMessage(reconnectResponse as any);
      };

      const session = await cryptoHandler.loadSession(origin);

      if (!session) {
        if (communicator.isEmbedded()) {
          emitReconnectRequired('No session in iframe partition');
          return;
        }
        console.error('❌ No session found for origin:', origin);
        throw new Error('No session found. Please reconnect.');
      }

      // Verify and update peer key if changed
      await cryptoHandler.verifyAndUpdatePeerKey(request);

      // Decrypt the request. A stale iframe session (keys no longer match the
      // SDK's) fails here with an AES-GCM auth-tag mismatch — Web Crypto's
      // OperationError. Treat ONLY that, and only when embedded, like a missing
      // session: drop it and ask the SDK to reconnect + retry, instead of
      // dead-ending on an undecryptable request. Any other error (malformed
      // envelope, bug, corrupted ciphertext) must surface, not be masked behind a
      // reconnect cycle that would fail identically on retry.
      let decrypted: Awaited<ReturnType<typeof cryptoHandler.decryptRequest>>;
      try {
        decrypted = await cryptoHandler.decryptRequest(request);
      } catch (decryptErr) {
        const isStaleSession = decryptErr instanceof DOMException && decryptErr.name === 'OperationError';
        if (communicator.isEmbedded() && isStaleSession) {
          await cryptoHandler.getSessionManager().deleteSession(origin);
          emitReconnectRequired('Stale iframe session (decrypt failed)');
          return;
        }
        throw decryptErr;
      }

      const method = decrypted.action.method;
      const params = decrypted.action.params;
      const chain = decrypted.chain;

      // Extract API key from chain rpcUrl if present
      const apiKeyFromProvider = chain?.rpcUrl?.split('api-key=')[1];
      if (apiKeyFromProvider && apiKeyFromProvider !== apiKey) {
        setApiKey(apiKeyFromProvider);
      }

      // Determine request type and show appropriate UI
      let requestType: SDKRequestType;

      // Check for sign message requests
      // personal_sign: always a sign message request
      // wallet_sign: only if request.type === "0x45" (Personal Sign per EIP-191)
      if (
        method === 'personal_sign' ||
        (method === 'wallet_sign' && Array.isArray(params) && params[0]?.request?.type === '0x45')
      ) {
        requestType = SDKRequestType.SIGN_MESSAGE;
      } else if (
        method === 'eth_signTypedData_v4' ||
        (method === 'wallet_sign' && Array.isArray(params) && params[0]?.request?.type === '0x01')
      ) {
        requestType = SDKRequestType.SIGN_TYPED_DATA;
      } else if (method === 'wallet_sendCalls' || method === 'eth_sendTransaction') {
        requestType = SDKRequestType.SEND_TRANSACTION;
      } else if (method === 'eth_chainId') {
        requestType = SDKRequestType.CHAIN_ID;
      } else if (method === 'wallet_grantPermissions') {
        requestType = SDKRequestType.GRANT_PERMISSIONS;
      } else if (method === 'wallet_revokePermissions') {
        requestType = SDKRequestType.REVOKE_PERMISSIONS;
      } else if (method === 'wallet_connect') {
        requestType = SDKRequestType.CONNECT;
      } else {
        console.warn('⚠️ Unsupported method:', method);
        requestType = SDKRequestType.UNSUPPORTED_METHOD;
      }

      // Parse the transaction before the request goes on screen. On failure the
      // dApp gets a real rejection instead of a dialog stuck on an error screen
      // it never sent an answer for.
      let parsedTx: TransactionRequestData | null = null;
      if (requestType === SDKRequestType.SEND_TRANSACTION) {
        try {
          parsedTx = extractTransactionData(method, Array.isArray(params) ? params : [], chain);
        } catch (extractErr) {
          console.error('❌ Failed to extract transaction data:', extractErr);
          const failure = await cryptoHandler.createEncryptedErrorResponse(
            request.id || '',
            request.correlationId || '',
            standardErrorCodes.rpc.invalidParams,
            extractErr instanceof Error ? extractErr.message : 'Invalid transaction parameters'
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          communicator.sendMessage(failure as any);
          setError(extractErr instanceof Error ? extractErr.message : 'Invalid transaction parameters');
          setPhase('failed');
          return;
        }
      }
      setTxData(parsedTx);

      setPendingRequest({
        origin,
        type: requestType,
        requestId: request.id || '',
        correlationId: request.correlationId || '',
        metadata: configRef.current?.metadata || null,
        method,
        params: Array.isArray(params) ? params : [],
        chain: chain
          ? { id: chain.id, rpcUrl: chain.rpcUrl ?? '', ...(chain.paymaster && { paymaster: chain.paymaster }) }
          : undefined,
        onApprove: async (result: unknown) => {
          const response = await cryptoHandler.createEncryptedResponse(
            request.id || '',
            request.correlationId || '',
            result
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          communicator.sendMessage(response as any);
        },
        onReject: async (error: string, errorCode?: number) => {
          // Answered — the bare-handshake gate above treats a request still in
          // state as live, and a rejected one must not hold that lock.
          flowDoneRef.current = true;
          // Send standard error response (default: EIP-1193 code 4001)
          try {
            const errorResponse = await cryptoHandler.createEncryptedErrorResponse(
              request.id || '',
              request.correlationId || '',
              errorCode ?? standardErrorCodes.provider.userRejectedRequest, // Default to user rejected request (EIP-1193 standard)
              error || 'User rejected the request'
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            communicator.sendMessage(errorResponse as any);
            // Close window after sending error
            scheduleClose(CLOSE_DELAY_MS);
          } catch (err) {
            console.error('❌ Failed to send rejection response:', err);
            communicator.requestClose();
          }
        },
      });

      // No screen work here on purpose: selectScreen owns that decision and
      // reads auth straight from the session manager via useAuth.
    } catch (err) {
      console.error('❌ Failed to handle encrypted request:', err);
      setError(err instanceof Error ? err.message : 'Failed to decrypt request');
      setPhase('failed');
    }
  };

  // ==========================================
  // SDK MODE
  // ==========================================
  if (isSDKMode) {
    // One decision for the whole dialog (lib/select-screen). Every branch below
    // dispatches on it instead of re-deriving its own condition, so they cannot
    // disagree about which screen is showing.
    const screen = selectScreen({
      requestType: pendingRequest?.type,
      phase,
      isAuthenticated: authQuery.isAuthenticated,
    });

    // The screen decision above already settled whether a modal shows; this only
    // hands the request to the component that picks which one.
    if (screen.kind === 'modal' && pendingRequest) {
      return (
        <RequestModals
          pendingRequest={pendingRequest}
          communicator={communicator}
          apiKey={apiKey}
          currentOrigin={currentOrigin}
          txData={txData}
          setPhase={setPhase}
          setError={setError}
          scheduleClose={scheduleClose}
          finishDeliveredFlow={finishDeliveredFlow}
          closeDelayMs={CLOSE_DELAY_MS}
          signDelivered={signDelivered}
        />
      );
    }

    // Show unsupported method modal
    if (!!pendingRequest && pendingRequest?.type === SDKRequestType.UNSUPPORTED_METHOD) {
      return (
        // Keyed by request — see TransactionModal above.
        <UnsupportedMethodModal
          key={pendingRequest.requestId}
          origin={pendingRequest.origin}
          method={pendingRequest.method}
          appName={pendingRequest.metadata?.appName}
          appLogoUrl={pendingRequest.metadata?.appLogoUrl}
          onClose={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(error.message, errorCode ?? standardErrorCodes.rpc.methodNotFound);
              communicator.requestClose();
            } catch (err) {
              console.error('❌ Failed to reject unsupported method:', err);
              communicator.requestClose();
            }
          }}
        />
      );
    }

    // Pre-first-screen window: the transport handshake has acked (which is what
    // reveals the embedded dialog) but we don't yet know whether this resolves
    // to "Continue as" or account creation — that needs the handshake account
    // hint resolved against the backend registry, a real roundtrip on a wiped
    // storage partition. Render the shape of the card that follows rather than
    // a captioned spinner: a distinct "Connecting to dApp… / SDK v1.1"
    // interstitial used to flash here whenever a request beat the SDK's
    // prewarm, and it both read as a separate screen and leaked the version.
    if (screen.kind === 'loading') {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md">
            <OnboardingSkeleton />
          </div>
        </div>
      );
    }

    // Show processing spinner
    if (screen.kind === 'progress') {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="max-w-md p-6 text-center">
            <div className="border-primary mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-b-2"></div>
            <h3 className="text-foreground mb-2 text-xl font-semibold">
              {authQuery.isAuthenticated ? 'Connecting to dApp...' : 'Processing...'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {authQuery.isAuthenticated && authQuery.accountName
                ? `Authenticated as ${authQuery.accountName}. Waiting for dApp connection...`
                : 'Please wait while we process your request.'}
            </p>
            {config?.metadata && <p className="text-muted-foreground text-sm">{config.metadata.appName}</p>}
          </div>
        </div>
      );
    }

    // 'done' is a terminal marker only — it renders no UI. Each completed flow
    // closes the dialog immediately (see scheduleClose on every onSuccess),
    // matching the connect flow; the dApp surfaces its own confirmation. Keeping
    // the phase (rather than dropping it) preserves the cross-flow reset sentinel
    // and stops selectScreen reopening the modal; returning null avoids a
    // success interstitial flashing during the brief close window.
    if (screen.kind === 'receipt') {
      return null;
    }

    // Show error state
    if (screen.kind === 'failure') {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="max-w-md p-6 text-center">
            <div className="bg-destructive/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <svg className="text-destructive h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-foreground mb-2 text-xl font-bold">Error</h3>
            <p className="text-muted-foreground mb-4">{error || 'An error occurred'}</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setError(null);
                  setPhase('reading-passkeys');
                  checkForPasskeys();
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg px-6 py-2 font-semibold transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  communicator.sendPopupUnload();
                  communicator.requestClose();
                }}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 w-full rounded-lg px-6 py-2 font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Show passkey creation screen
    if (phase === 'creating-passkey') {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md">
            <SignInScreen
              // The same call the EmbeddedShell overlay tap makes — the SDK rejects the pending
              // request; in a popup it closes the window. The X is a visible twin, not a new path.
              onClose={cancelFlow}
              ensConfig={ensConfig}
              chainId={effectiveChainId}
              apiKey={apiKey}
              chainConfig={pendingRequest?.chain}
              subnameTextRecords={extractSubnameTextRecords(pendingRequest)}
              origin={currentOrigin || undefined}
              preferredCredentialId={hintedCredentialId ?? undefined}
              onCreateNewAccount={createEscapesToPopup ? switchToPopupForCreate : undefined}
              startInCreate={startInCreate}
              onComplete={async (authenticatedAccount: AuthenticatedAccount) => {
                try {
                  // Set the current account from the passed data
                  setCurrentAccount({
                    credentialId: authenticatedAccount.credentialId,
                    username: authenticatedAccount.username,
                    publicKey: authenticatedAccount.publicKey,
                    creationDate: new Date().toISOString(),
                    isImported: false,
                  });
                  // Update session auth state for per-origin isolation
                  if (currentOrigin) {
                    const authState: SessionAuthState = {
                      address: authenticatedAccount.address,
                      credentialId: authenticatedAccount.credentialId,
                      username: authenticatedAccount.username,
                      publicKey: authenticatedAccount.publicKey,
                    };
                    await cryptoHandler.updateAuthState(authState);
                    debugLog('✅ Session auth state updated for origin:', currentOrigin);
                  }

                  await authQuery.refetch();

                  // If there's a pending connect request, show approval screen immediately
                  if (pendingRequest?.type === SDKRequestType.CONNECT) {
                    setPhase('choosing-account');
                  } else if (
                    pendingRequest?.type === SDKRequestType.SIGN_MESSAGE ||
                    pendingRequest?.type === SDKRequestType.SIGN_TYPED_DATA ||
                    pendingRequest?.type === SDKRequestType.SEND_TRANSACTION ||
                    pendingRequest?.type === SDKRequestType.GRANT_PERMISSIONS ||
                    pendingRequest?.type === SDKRequestType.REVOKE_PERMISSIONS
                  ) {
                    // If there's a pending sign message, typed data, transaction, or permission request,
                    // the modal will be shown in the priority logic above since user is now authenticated
                    setPhase('working');
                  } else {
                    // No pending request yet, stay on current screen and wait for it
                    // useEffect will handle transition when handshake arrives
                    // Don't change state - stay on passkey-create to keep UI visible
                  }
                } catch (err) {
                  console.error('❌ Failed after passkey creation:', err);
                  setError(err instanceof Error ? err.message : 'Failed to proceed');
                  setPhase('failed');
                }
              }}
            />
          </div>
        </div>
      );
    }

    // Show passkey authentication screen
    if (phase === 'confirming-account') {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md">
            <SignInScreen
              // The same call the EmbeddedShell overlay tap makes — the SDK rejects the pending
              // request; in a popup it closes the window. The X is a visible twin, not a new path.
              onClose={cancelFlow}
              ensConfig={ensConfig}
              chainId={effectiveChainId}
              apiKey={apiKey}
              chainConfig={pendingRequest?.chain}
              subnameTextRecords={extractSubnameTextRecords(pendingRequest)}
              origin={currentOrigin || undefined}
              preferredCredentialId={hintedCredentialId ?? undefined}
              onCreateNewAccount={createEscapesToPopup ? switchToPopupForCreate : undefined}
              startInCreate={startInCreate}
              onComplete={async (authenticatedAccount: AuthenticatedAccount) => {
                try {
                  // Set the current account from the passed data
                  setCurrentAccount({
                    credentialId: authenticatedAccount.credentialId,
                    username: authenticatedAccount.username,
                    publicKey: authenticatedAccount.publicKey,
                    creationDate: new Date().toISOString(),
                    isImported: false,
                  });

                  // Update session auth state for per-origin isolation
                  if (currentOrigin) {
                    const authState: SessionAuthState = {
                      address: authenticatedAccount.address,
                      credentialId: authenticatedAccount.credentialId,
                      username: authenticatedAccount.username,
                      publicKey: authenticatedAccount.publicKey,
                    };
                    await cryptoHandler.updateAuthState(authState);
                    // Do not log credentialId — it is sensitive (PII)
                    debugLog('✅ Session auth state updated for origin:', currentOrigin);
                  }

                  await authQuery.refetch();

                  // If there's a pending connect request, show approval screen immediately
                  if (pendingRequest?.type === SDKRequestType.CONNECT) {
                    if (
                      isSilentContinueAsConnect({
                        isEmbedded: communicator.isEmbedded(),
                        hintedCredentialId,
                        authenticatedCredentialId: authenticatedAccount.credentialId,
                        params: pendingRequest.params,
                      })
                    ) {
                      // Embedded "Continue as" fast path (see lib/continue-as-connect):
                      // the user already approved this exact origin+account pairing
                      // (the hint only persists post-approval) and just re-confirmed
                      // it via the Continue-as passkey ceremony — approve without
                      // re-showing the Connect screen. Mirrors ConnectModal.onSuccess.
                      setPhase('working');
                      await pendingRequest.onApprove({ accounts: [{ address: authenticatedAccount.address }] });
                      communicator.sendAccountHint({ credentialId: authenticatedAccount.credentialId });
                      setPhase('done');
                      scheduleClose(CLOSE_DELAY_MS);
                    } else {
                      setPhase('choosing-account');
                    }
                  } else if (
                    pendingRequest?.type === SDKRequestType.SIGN_MESSAGE ||
                    pendingRequest?.type === SDKRequestType.SIGN_TYPED_DATA ||
                    pendingRequest?.type === SDKRequestType.SEND_TRANSACTION ||
                    pendingRequest?.type === SDKRequestType.GRANT_PERMISSIONS ||
                    pendingRequest?.type === SDKRequestType.REVOKE_PERMISSIONS
                  ) {
                    // If there's a pending sign message, typed data, transaction, or permission request,
                    // the modal will be shown in the priority logic above since user is now authenticated
                    setPhase('working');
                  } else {
                    // No pending request yet, stay on current screen and wait for it
                    // useEffect will handle transition when handshake arrives
                    // Don't change state - stay on passkey-auth to keep UI visible
                  }
                } catch (err) {
                  console.error('❌ Failed after authentication:', err);
                  setError(err instanceof Error ? err.message : 'Authentication failed');
                  setPhase('confirming-account');
                }
              }}
            />
          </div>
        </div>
      );
    }

    // Show connection approval (account-selection state)
    if (phase === 'choosing-account' && pendingRequest?.type === SDKRequestType.CONNECT) {
      // Extract signInWithEthereum capability from wallet_connect params
      // params structure: [{ capabilities?: { signInWithEthereum?: {...} } }]
      const walletConnectParams = pendingRequest.params as
        | [{ capabilities?: { signInWithEthereum?: SignInWithEthereumCapabilityRequest } }]
        | undefined;
      const signInWithEthereumCapability = walletConnectParams?.[0]?.capabilities?.signInWithEthereum;

      if (!authQuery.walletAddress) {
        // Reject with internal error (JSON-RPC code -32603)
        pendingRequest.onReject('Internal error: wallet address not available', standardErrorCodes.rpc.internal);
        return null;
      }
      const walletAddress = authQuery.walletAddress;

      // If SIWE capability is requested, show SiweModal instead of ConnectModal
      if (signInWithEthereumCapability && pendingRequest.chain) {
        // Build the SIWE message using viem's createSiweMessage
        const buildSiweMessageFromCapability = () => {
          const origin = pendingRequest.origin;
          let defaultDomain: string;
          let defaultUri: string;

          try {
            const url = new URL(origin);
            defaultDomain = url.host;
            defaultUri = origin;
          } catch {
            defaultDomain = origin;
            defaultUri = origin;
          }

          // Convert hex chainId to number
          const chainIdNumber = ensureIntNumber(signInWithEthereumCapability.chainId);

          return createSiweMessage({
            address: walletAddress as `0x${string}`,
            chainId: chainIdNumber,
            domain: signInWithEthereumCapability.domain || defaultDomain,
            nonce: signInWithEthereumCapability.nonce,
            uri: signInWithEthereumCapability.uri || defaultUri,
            version: '1',
            statement: signInWithEthereumCapability.statement,
            issuedAt: signInWithEthereumCapability.issuedAt
              ? new Date(signInWithEthereumCapability.issuedAt)
              : new Date(),
            expirationTime: signInWithEthereumCapability.expirationTime
              ? new Date(signInWithEthereumCapability.expirationTime)
              : undefined,
            notBefore: signInWithEthereumCapability.notBefore
              ? new Date(signInWithEthereumCapability.notBefore)
              : undefined,
            requestId: signInWithEthereumCapability.requestId,
            resources: signInWithEthereumCapability.resources,
          });
        };

        const siweMessage = buildSiweMessageFromCapability();
        const siweWarning = getSiweOriginWarning(pendingRequest.origin, {
          domain: signInWithEthereumCapability.domain,
          uri: signInWithEthereumCapability.uri,
        });

        return (
          // Keyed by request — see TransactionModal above.
          <SiweModal
            key={pendingRequest.requestId}
            origin={pendingRequest.origin}
            message={siweMessage}
            address={walletAddress}
            chain={pendingRequest.chain}
            appName={pendingRequest.metadata?.appName}
            appLogoUrl={pendingRequest.metadata?.appLogoUrl}
            warningMessage={siweWarning}
            isSuccess={signDelivered}
            onSuccess={async (signature: string, message: string) => {
              // Connect owns its own post-delivery continuation below, so — unlike the
              // standalone signing handlers — we intentionally don't switch to 'working'.
              try {
                debugLog('✅ User signed SIWE message');

                // Build response per ERC-7846 format with SIWE capability
                const response = {
                  accounts: [
                    {
                      address: walletAddress,
                      capabilities: {
                        signInWithEthereum: {
                          message,
                          signature: signature as `0x${string}`,
                        },
                      },
                    },
                  ],
                };

                debugLog('✅ SIWE response:', response);
                await pendingRequest.onApprove(response);
                // Delivery confirmed — show the tick (held through the handoff + beat).
                setSignDelivered(true);
                // Marked here, NOT left to the finishDeliveredFlow() below: the handoff is awaited
                // in between, and across that await the listener's reset guard sees neither a
                // terminal state nor flowDoneRef, so a request arriving in the gap is not cleared.
                // The continuation would then land on the new request's screen and close the popup
                // with it unanswered.
                flowDoneRef.current = true;
                // Only after approval (never on mere authentication, which the
                // user may still cancel): let the SDK persist the account hint
                // dApp-side, so the next embedded visit can show "Continue as"
                // even after Brave/Safari wipe our partitioned storage.
                if (authQuery.authState) {
                  communicator.sendAccountHint(authQuery.authState);
                }
                // Popup only: hand the session to the embedded iframe so the
                // next embedded action skips the second passkey ceremony.
                await handOffSessionToEmbedded(pendingRequest.origin);
                // Response already delivered — hold the "Signed in" tick, then close.
                finishDeliveredFlow();
              } catch (err) {
                console.error('❌ Failed to approve connection with SIWE:', err);
                setError(err instanceof Error ? err.message : 'Failed to approve connection');
                setPhase('failed');
              }
            }}
            onError={async (error, errorCode) => {
              try {
                // Forward error and code directly from modal
                await pendingRequest.onReject(
                  error.message,
                  errorCode ?? standardErrorCodes.provider.userRejectedRequest
                );
                communicator.requestClose();
              } catch (err) {
                console.error('❌ Failed to reject:', err);
                communicator.requestClose();
              }
            }}
          />
        );
      }

      // No SIWE capability - show regular ConnectModal
      return (
        // Keyed by request — see TransactionModal above.
        <ConnectModal
          key={pendingRequest.requestId}
          origin={pendingRequest.origin}
          appName={pendingRequest.metadata?.appName || 'dApp'}
          appLogoUrl={pendingRequest.metadata?.appLogoUrl}
          accountName={authQuery.accountName || currentAccount?.username}
          walletAddress={walletAddress}
          chain={pendingRequest.chain}
          onSuccess={async () => {
            setPhase('working');
            try {
              debugLog('✅ User approved connection');

              // Build response per ERC-7846 format (no capabilities)
              const response = {
                accounts: [
                  {
                    address: walletAddress,
                  },
                ],
              };

              await pendingRequest.onApprove(response);
              // Same reason as the SIWE path above: the response is delivered, so mark the flow
              // done before the awaited handoff rather than leaving it to the setPhase('done')
              // that only runs after it.
              flowDoneRef.current = true;
              // Only after approval (never on mere authentication, which the
              // user may still cancel): let the SDK persist the account hint
              // dApp-side, so the next embedded visit can show "Continue as"
              // even after Brave/Safari wipe our partitioned storage.
              if (authQuery.authState) {
                communicator.sendAccountHint(authQuery.authState);
              }
              // Popup only: hand the session to the embedded iframe so the
              // next embedded action skips the second passkey ceremony.
              await handOffSessionToEmbedded(pendingRequest.origin);
              setPhase('done');
              scheduleClose(CLOSE_DELAY_MS);
            } catch (err) {
              console.error('❌ Failed to approve connection:', err);
              setError(err instanceof Error ? err.message : 'Failed to approve connection');
              setPhase('failed');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(
                error.message,
                errorCode ?? standardErrorCodes.provider.userRejectedRequest
              );
              communicator.requestClose();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              communicator.requestClose();
            }
          }}
        />
      );
    }

    // No pending request yet - should not normally be seen
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="border-primary mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2"></div>
          <p className="text-muted-foreground">Waiting for request...</p>
        </div>
      </div>
    );
  }

  return null;
}
