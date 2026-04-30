'use client';

import { useState } from 'react';
import { MAINNET_CHAINS as CORE_MAINNET_CHAINS, TESTNET_CHAINS as CORE_TESTNET_CHAINS } from '@jaw.id/core';

// ── Constants ──────────────────────────────────────────────────────────────────

const WILDCARD_TARGET = '0x3232323232323232323232323232323232323232';
const WILDCARD_SELECTOR = '0x32323232';
const EMPTY_CALLDATA_SELECTOR = '0xe0e0e0e0';
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Derive chain ID → name maps from @jaw.id/core
const MAINNET_CHAINS: Record<number, string> = Object.fromEntries(
  CORE_MAINNET_CHAINS.map((chain) => [chain.id, chain.name])
);

const TESTNET_CHAINS: Record<number, string> = Object.fromEntries(
  CORE_TESTNET_CHAINS.map((chain) => [chain.id, chain.name])
);

const KNOWN_CHAINS: Record<number, string> = {
  ...MAINNET_CHAINS,
  ...TESTNET_CHAINS,
};

const SPEND_UNITS = ['minute', 'hour', 'day', 'week', 'month', 'year', 'forever'] as const;

type CallPreset = 'any-target-any-fn' | 'any-target-empty-calldata' | 'custom';
type SpendPreset = 'native-eth' | 'custom-token';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PaymasterEntry {
  id: string;
  chainId: string;
  url: string;
  context: string;
}

interface CallPermission {
  id: string;
  preset: CallPreset;
  target: string;
  selector: string;
}

interface SpendPermission {
  id: string;
  preset: SpendPreset;
  token: string;
  allowance: string;
  unit: (typeof SPEND_UNITS)[number];
  multiplier: string;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    border: '1px solid var(--vocs-color_border)',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    marginTop: '1.5rem',
  } as React.CSSProperties,

  section: {
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid var(--vocs-color_border)',
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--vocs-color_text2)',
    marginBottom: '1rem',
  } as React.CSSProperties,

  fieldGroup: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  } as React.CSSProperties,

  fieldGroupFull: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'var(--vocs-color_text2)',
    marginBottom: '0.25rem',
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    fontFamily: 'var(--vocs-fontFamily_mono)',
    backgroundColor: 'var(--vocs-color_background2)',
    border: '1px solid var(--vocs-color_border)',
    borderRadius: '0.375rem',
    color: 'var(--vocs-color_text)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  select: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    backgroundColor: 'var(--vocs-color_background2)',
    border: '1px solid var(--vocs-color_border)',
    borderRadius: '0.375rem',
    color: 'var(--vocs-color_text)',
    outline: 'none',
    boxSizing: 'border-box' as const,
    cursor: 'pointer',
  } as React.CSSProperties,

  row: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  } as React.CSSProperties,

  addButton: {
    padding: '0.5rem 1rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    backgroundColor: 'transparent',
    border: '1px dashed var(--vocs-color_border)',
    borderRadius: '0.375rem',
    color: 'var(--vocs-color_text2)',
    cursor: 'pointer',
    width: '100%',
    marginTop: '0.5rem',
  } as React.CSSProperties,

  removeButton: {
    padding: '0.5rem',
    fontSize: '0.75rem',
    backgroundColor: 'transparent',
    border: '1px solid var(--vocs-color_border)',
    borderRadius: '0.375rem',
    color: '#ef4444',
    cursor: 'pointer',
    flexShrink: 0,
    lineHeight: 1,
  } as React.CSSProperties,

  output: {
    padding: '1.25rem 1.5rem',
    backgroundColor: 'var(--vocs-color_background2)',
  } as React.CSSProperties,

  outputHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  } as React.CSSProperties,

  copyButton: {
    padding: '0.375rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    backgroundColor: 'var(--vocs-color_background)',
    border: '1px solid var(--vocs-color_border)',
    borderRadius: '0.375rem',
    color: 'var(--vocs-color_text)',
    cursor: 'pointer',
  } as React.CSSProperties,

  code: {
    display: 'block',
    padding: '1rem',
    fontSize: '0.8125rem',
    fontFamily: 'var(--vocs-fontFamily_mono)',
    backgroundColor: 'var(--vocs-color_background)',
    border: '1px solid var(--vocs-color_border)',
    borderRadius: '0.375rem',
    color: 'var(--vocs-color_text)',
    overflowX: 'auto' as const,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    lineHeight: 1.6,
  } as React.CSSProperties,

  tag: {
    display: 'inline-block',
    padding: '0.125rem 0.5rem',
    fontSize: '0.6875rem',
    fontWeight: 500,
    backgroundColor: 'var(--vocs-color_background)',
    border: '1px solid var(--vocs-color_border)',
    borderRadius: '9999px',
    color: 'var(--vocs-color_text3)',
    marginLeft: '0.5rem',
  } as React.CSSProperties,

  hint: {
    fontSize: '0.75rem',
    color: 'var(--vocs-color_text3)',
    marginTop: '0.25rem',
  } as React.CSSProperties,

  itemCard: {
    padding: '0.75rem',
    backgroundColor: 'var(--vocs-color_background2)',
    border: '1px solid var(--vocs-color_border)',
    borderRadius: '0.5rem',
    marginBottom: '0.5rem',
  } as React.CSSProperties,

  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  } as React.CSSProperties,

  itemTitle: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--vocs-color_text2)',
  } as React.CSSProperties,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

let idCounter = 0;
function uid() {
  return `item-${++idCounter}`;
}

function ethToHexWei(eth: string): string {
  try {
    const [whole = '0', frac = ''] = eth.split('.');
    const padded = frac.padEnd(18, '0').slice(0, 18);
    const wei = BigInt(whole) * BigInt('1000000000000000000') + BigInt(padded);
    return `0x${wei.toString(16)}`;
  } catch {
    return '0x0';
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ConfigGenerator() {
  // Basic config
  const [apiKey, setApiKey] = useState('');
  const [defaultChain, setDefaultChain] = useState('84532');
  const [keysUrl] = useState('https://keys.jaw.id');
  const [ens, setEns] = useState('');
  const [sessionExpiry, setSessionExpiry] = useState('7');

  // Paymasters
  const [paymasters, setPaymasters] = useState<PaymasterEntry[]>([
    { id: uid(), chainId: '84532', url: '', context: '' },
  ]);

  // Permissions - Calls
  const [calls, setCalls] = useState<CallPermission[]>([
    { id: uid(), preset: 'any-target-any-fn', target: WILDCARD_TARGET, selector: WILDCARD_SELECTOR },
  ]);

  // Permissions - Spends
  const [spends, setSpends] = useState<SpendPermission[]>([
    { id: uid(), preset: 'native-eth', token: NATIVE_TOKEN, allowance: '0.1', unit: 'day', multiplier: '1' },
  ]);

  const [copied, setCopied] = useState(false);

  // ── Paymaster handlers ───────────────────────────────────────────────────────

  function addPaymaster() {
    setPaymasters([...paymasters, { id: uid(), chainId: '', url: '', context: '' }]);
  }

  function removePaymaster(id: string) {
    setPaymasters(paymasters.filter((p) => p.id !== id));
  }

  function updatePaymaster(id: string, field: keyof PaymasterEntry, value: string) {
    setPaymasters(paymasters.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }

  // ── Call permission handlers ─────────────────────────────────────────────────

  function addCall() {
    setCalls([
      ...calls,
      { id: uid(), preset: 'any-target-any-fn', target: WILDCARD_TARGET, selector: WILDCARD_SELECTOR },
    ]);
  }

  function removeCall(id: string) {
    setCalls(calls.filter((c) => c.id !== id));
  }

  function updateCall(id: string, field: keyof CallPermission, value: string) {
    setCalls(
      calls.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: value };
        if (field === 'preset') {
          switch (value) {
            case 'any-target-any-fn':
              updated.target = WILDCARD_TARGET;
              updated.selector = WILDCARD_SELECTOR;
              break;
            case 'any-target-empty-calldata':
              updated.target = WILDCARD_TARGET;
              updated.selector = EMPTY_CALLDATA_SELECTOR;
              break;
            case 'custom':
              updated.target = '';
              updated.selector = '';
              break;
          }
        }
        return updated;
      })
    );
  }

  // ── Spend permission handlers ────────────────────────────────────────────────

  function addSpend() {
    setSpends([
      ...spends,
      { id: uid(), preset: 'native-eth', token: NATIVE_TOKEN, allowance: '0.1', unit: 'day', multiplier: '1' },
    ]);
  }

  function removeSpend(id: string) {
    setSpends(spends.filter((s) => s.id !== id));
  }

  function updateSpend(id: string, field: keyof SpendPermission, value: string) {
    setSpends(
      spends.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, [field]: value };
        if (field === 'preset') {
          updated.token = value === 'native-eth' ? NATIVE_TOKEN : '';
        }
        return updated;
      })
    );
  }

  // ── Generate output ──────────────────────────────────────────────────────────

  function buildConfig() {
    const config: Record<string, unknown> = {};

    if (apiKey) config.apiKey = apiKey;
    if (defaultChain) config.defaultChain = parseInt(defaultChain, 10);
    if (keysUrl && keysUrl !== 'https://keys.jaw.id') config.keysUrl = keysUrl;
    if (ens) config.ens = ens;
    if (sessionExpiry && sessionExpiry !== '7') config.sessionExpiry = parseInt(sessionExpiry, 10);

    // Paymasters
    const pmEntries = paymasters.filter((p) => p.chainId && p.url);
    if (pmEntries.length > 0) {
      const pm: Record<string, Record<string, unknown>> = {};
      for (const entry of pmEntries) {
        const obj: Record<string, unknown> = { url: entry.url };
        if (entry.context.trim()) {
          try {
            obj.context = JSON.parse(entry.context);
          } catch {
            obj.context = entry.context;
          }
        }
        pm[entry.chainId] = obj;
      }
      config.paymasters = pm;
    }

    // Permissions
    const callPerms = calls
      .filter((c) => c.target)
      .map((c) => {
        const obj: Record<string, string> = { target: c.target };
        if (c.selector) obj.selector = c.selector;
        return obj;
      });

    const spendPerms = spends
      .filter((s) => s.token && s.allowance)
      .map((s) => {
        const obj: Record<string, unknown> = {
          token: s.token,
          allowance: ethToHexWei(s.allowance),
          unit: s.unit,
        };
        if (s.multiplier && s.multiplier !== '1') {
          obj.multiplier = parseInt(s.multiplier, 10);
        } else {
          obj.multiplier = 1;
        }
        return obj;
      });

    if (callPerms.length > 0 || spendPerms.length > 0) {
      const permissions: Record<string, unknown> = {};
      if (callPerms.length > 0) permissions.calls = callPerms;
      if (spendPerms.length > 0) permissions.spends = spendPerms;
      config.permissions = permissions;
    }

    return config;
  }

  function shellQuote(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
  }

  function getCommand() {
    const config = buildConfig();
    return `jaw config write ${shellQuote(JSON.stringify(config))}`;
  }

  function copyCommand() {
    navigator.clipboard.writeText(getCommand());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadConfig() {
    const blob = new Blob([JSON.stringify(buildConfig(), null, 2) + '\n'], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jaw-config.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* ── General ──────────────────────────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>General</div>
        <div style={styles.fieldGroup}>
          <div>
            <label style={styles.label}>API Key</label>
            <input
              style={styles.input}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="jaw_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div>
            <label style={styles.label}>Default Chain ID</label>
            <select style={styles.select} value={defaultChain} onChange={(e) => setDefaultChain(e.target.value)}>
              <optgroup label="Mainnets">
                {Object.entries(MAINNET_CHAINS).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name} ({id})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Testnets">
                {Object.entries(TESTNET_CHAINS).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name} ({id})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>
        <div style={styles.fieldGroup}>
          <div>
            <label style={styles.label}>
              ENS Domain <span style={styles.tag}>optional</span>
            </label>
            <input
              style={styles.input}
              type="text"
              placeholder="mydomain.eth"
              value={ens}
              onChange={(e) => setEns(e.target.value)}
            />
          </div>
          <div>
            <label style={styles.label}>Session Expiry (days)</label>
            <input
              style={styles.input}
              type="number"
              min="1"
              placeholder="7"
              value={sessionExpiry}
              onChange={(e) => setSessionExpiry(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Paymasters ───────────────────────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Paymasters</div>
        {paymasters.map((pm) => (
          <div key={pm.id} style={styles.itemCard}>
            <div style={styles.itemHeader}>
              <span style={styles.itemTitle}>
                {pm.chainId ? KNOWN_CHAINS[parseInt(pm.chainId)] || `Chain ${pm.chainId}` : 'New Paymaster'}
              </span>
              {paymasters.length > 1 && (
                <button style={styles.removeButton} onClick={() => removePaymaster(pm.id)}>
                  Remove
                </button>
              )}
            </div>
            <div style={styles.fieldGroup}>
              <div>
                <label style={styles.label}>Chain ID</label>
                <select
                  style={styles.select}
                  value={pm.chainId}
                  onChange={(e) => updatePaymaster(pm.id, 'chainId', e.target.value)}
                >
                  <option value="">Select chain</option>
                  {Object.entries(KNOWN_CHAINS).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name} ({id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.label}>Paymaster URL</label>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="https://api.pimlico.io/v2/84532/rpc?apikey=..."
                  value={pm.url}
                  onChange={(e) => updatePaymaster(pm.id, 'url', e.target.value)}
                />
              </div>
            </div>
            <div style={styles.fieldGroupFull}>
              <div>
                <label style={styles.label}>
                  Context <span style={styles.tag}>optional</span>
                </label>
                <input
                  style={styles.input}
                  type="text"
                  placeholder='{"sponsorshipPolicyId": "sp_my_policy"}'
                  value={pm.context}
                  onChange={(e) => updatePaymaster(pm.id, 'context', e.target.value)}
                />
                <div style={styles.hint}>JSON object passed to paymaster calls (e.g., Pimlico sponsorship policy)</div>
              </div>
            </div>
          </div>
        ))}
        <button style={styles.addButton} onClick={addPaymaster}>
          + Add Paymaster
        </button>
      </div>

      {/* ── Call Permissions ──────────────────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Call Permissions</div>
        {calls.map((call) => (
          <div key={call.id} style={styles.itemCard}>
            <div style={styles.itemHeader}>
              <span style={styles.itemTitle}>
                {call.preset === 'any-target-any-fn'
                  ? 'Any Target + Any Function'
                  : call.preset === 'any-target-empty-calldata'
                    ? 'Any Target + Empty Calldata'
                    : 'Custom'}
              </span>
              {calls.length > 1 && (
                <button style={styles.removeButton} onClick={() => removeCall(call.id)}>
                  Remove
                </button>
              )}
            </div>
            <div style={styles.fieldGroupFull}>
              <div>
                <label style={styles.label}>Preset</label>
                <select
                  style={styles.select}
                  value={call.preset}
                  onChange={(e) => updateCall(call.id, 'preset', e.target.value)}
                >
                  <option value="any-target-any-fn">Any Target + Any Function (wildcard)</option>
                  <option value="any-target-empty-calldata">Any Target + Empty Calldata (transfers only)</option>
                  <option value="custom">Custom (specify target + selector)</option>
                </select>
              </div>
            </div>
            {call.preset === 'custom' && (
              <div style={styles.fieldGroup}>
                <div>
                  <label style={styles.label}>Target Contract</label>
                  <input
                    style={styles.input}
                    type="text"
                    placeholder="0x..."
                    value={call.target}
                    onChange={(e) => updateCall(call.id, 'target', e.target.value)}
                  />
                </div>
                <div>
                  <label style={styles.label}>Function Selector</label>
                  <input
                    style={styles.input}
                    type="text"
                    placeholder="0xa9059cbb (transfer)"
                    value={call.selector}
                    onChange={(e) => updateCall(call.id, 'selector', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
        <button style={styles.addButton} onClick={addCall}>
          + Add Call Permission
        </button>
      </div>

      {/* ── Spend Permissions ────────────────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Spend Limits</div>
        {spends.map((spend) => (
          <div key={spend.id} style={styles.itemCard}>
            <div style={styles.itemHeader}>
              <span style={styles.itemTitle}>{spend.preset === 'native-eth' ? 'Native ETH' : 'Custom Token'}</span>
              {spends.length > 1 && (
                <button style={styles.removeButton} onClick={() => removeSpend(spend.id)}>
                  Remove
                </button>
              )}
            </div>
            <div style={styles.fieldGroup}>
              <div>
                <label style={styles.label}>Token</label>
                <select
                  style={styles.select}
                  value={spend.preset}
                  onChange={(e) => updateSpend(spend.id, 'preset', e.target.value)}
                >
                  <option value="native-eth">Native ETH</option>
                  <option value="custom-token">Custom Token Address</option>
                </select>
              </div>
              {spend.preset === 'custom-token' && (
                <div>
                  <label style={styles.label}>Token Address</label>
                  <input
                    style={styles.input}
                    type="text"
                    placeholder="0x..."
                    value={spend.token}
                    onChange={(e) => updateSpend(spend.id, 'token', e.target.value)}
                  />
                </div>
              )}
            </div>
            <div style={styles.fieldGroup}>
              <div>
                <label style={styles.label}>Allowance (in ETH/token units)</label>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="0.1"
                  value={spend.allowance}
                  onChange={(e) => updateSpend(spend.id, 'allowance', e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Period</label>
                  <select
                    style={styles.select}
                    value={spend.unit}
                    onChange={(e) => updateSpend(spend.id, 'unit', e.target.value)}
                  >
                    {SPEND_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ width: '5rem' }}>
                  <label style={styles.label}>x</label>
                  <input
                    style={styles.input}
                    type="number"
                    min="1"
                    value={spend.multiplier}
                    onChange={(e) => updateSpend(spend.id, 'multiplier', e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div style={styles.hint}>
              Max {spend.allowance || '0'} {spend.preset === 'native-eth' ? 'ETH' : 'tokens'} per{' '}
              {spend.multiplier !== '1' ? `${spend.multiplier} ` : ''}
              {spend.unit}
              {parseInt(spend.multiplier) > 1 ? 's' : ''}
            </div>
          </div>
        ))}
        <button style={styles.addButton} onClick={addSpend}>
          + Add Spend Limit
        </button>
      </div>

      {/* ── Output ───────────────────────────────────────────────────────── */}
      <div style={styles.output}>
        <div style={styles.outputHeader}>
          <div style={styles.sectionTitle}>Generated Command</div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={styles.copyButton} onClick={downloadConfig}>
              Download config.json
            </button>
            <button style={styles.copyButton} onClick={copyCommand}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <pre style={styles.code}>{getCommand()}</pre>
      </div>
    </div>
  );
}
