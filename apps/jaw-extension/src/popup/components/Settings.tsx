import * as Select from '@radix-ui/react-select';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  getSettings,
  setSettings,
  subscribeSettings,
  type Settings as SettingsType,
} from '../../shared/settings.js';
import { listChains } from '../lib/chains.js';

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack }: SettingsProps): React.JSX.Element {
  const [draft, setDraft] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [original, setOriginal] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Ref kept in sync with `original` so the subscriber closure (mounted once)
  // always sees the latest stored snapshot without needing to re-subscribe.
  const originalRef = useRef<SettingsType>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled) return;
      setDraft(s);
      setOriginal(s);
      originalRef.current = s;
    });
    // Keep `original` in sync if a second popup writes settings concurrently.
    // We refresh `draft` ONLY if the user hasn't started editing yet (i.e.
    // draft still equals original) — otherwise we'd clobber an in-flight edit.
    const unsubscribe = subscribeSettings((next) => {
      if (cancelled) return;
      const prev = originalRef.current;
      setDraft((d) => {
        const dirty = d.showTestnets !== prev.showTestnets || d.defaultChainId !== prev.defaultChainId;
        return dirty ? d : next;
      });
      setOriginal(next);
      originalRef.current = next;
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // For the default-chain dropdown we ALWAYS show every supported chain
  // (mainnets + testnets) so the user can pin a testnet even if they want
  // testnets hidden from the chain switcher. Independent concerns.
  const chainOptions = listChains({ includeTestnets: true });

  const dirty = draft.showTestnets !== original.showTestnets || draft.defaultChainId !== original.defaultChainId;

  const save = async (): Promise<void> => {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setSettings({
        showTestnets: draft.showTestnets,
        defaultChainId: draft.defaultChainId,
      });
      // Reload the extension so the offscreen SDK picks up the new options.
      // JAW.create() is one-shot; we can't mutate the seeded chain list
      // post-construction. Reload is the cleanest user-facing affordance.
      chrome.runtime.reload();
    } catch (err) {
      setSaving(false);
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <button type="button" onClick={onBack} style={styles.backBtn} aria-label="Back">
          ←
        </button>
        <strong style={styles.title}>Settings</strong>
        <span style={styles.spacer} />
      </header>

      <section style={styles.section}>
        <div style={styles.row}>
          <div>
            <p style={styles.label}>Show testnets</p>
            <p style={styles.hint}>Include Sepolia + L2 testnets in the chain switcher.</p>
          </div>
          <Toggle
            checked={draft.showTestnets ?? false}
            onChange={(v) => setDraft((d) => ({ ...d, showTestnets: v }))}
          />
        </div>

        <div style={styles.divider} />

        <div style={styles.col}>
          <p style={styles.label}>Default chain</p>
          <p style={styles.hint}>Chain JAW will switch to on first connect.</p>
          <Select.Root
            value={draft.defaultChainId === null ? 'auto' : String(draft.defaultChainId)}
            onValueChange={(v) => setDraft((d) => ({ ...d, defaultChainId: v === 'auto' ? null : Number(v) }))}
          >
            <Select.Trigger style={styles.selectTrigger}>
              <Select.Value placeholder="Auto" />
              <Select.Icon style={styles.selectIcon}>▾</Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content position="popper" sideOffset={6} style={styles.selectContent}>
                <Select.ScrollUpButton style={styles.scrollBtn}>▲</Select.ScrollUpButton>
                <Select.Viewport style={styles.selectViewport}>
                  <Select.Item value="auto" style={styles.selectItem}>
                    <Select.ItemText>Auto (use SDK default)</Select.ItemText>
                  </Select.Item>
                  {chainOptions.map((c) => (
                    <Select.Item key={c.id} value={String(c.id)} style={styles.selectItem}>
                      <Select.ItemText>{c.name}</Select.ItemText>
                      {c.isTestnet && <span style={styles.badge}>test</span>}
                    </Select.Item>
                  ))}
                </Select.Viewport>
                <Select.ScrollDownButton style={styles.scrollBtn}>▼</Select.ScrollDownButton>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      </section>

      <footer style={styles.footer}>
        {saveError && <p style={styles.err}>{saveError}</p>}
        {dirty && !saveError && <p style={styles.warn}>Changes apply after the extension reloads.</p>}
        <div style={styles.btnRow}>
          <button type="button" onClick={onBack} style={styles.btn}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            style={{ ...styles.btn, ...styles.primary, opacity: dirty && !saving ? 1 : 0.5 }}
          >
            {saving ? 'Reloading…' : 'Save & reload'}
          </button>
        </div>
      </footer>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
}

function Toggle({ checked, onChange }: ToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        ...styles.toggle,
        background: checked ? '#22c55e' : 'rgba(128,128,128,0.35)',
      }}
    >
      <span
        style={{
          ...styles.toggleKnob,
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column' },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(128,128,128,0.18)',
    gap: 8,
  },
  backBtn: {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(128,128,128,0.3)',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 14,
  },
  title: { fontSize: 14, fontWeight: 600, flex: 1, textAlign: 'center' },
  spacer: { width: 28 },
  section: { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  col: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 500, margin: 0 },
  hint: { fontSize: 11, opacity: 0.6, margin: '2px 0 0', lineHeight: 1.4 },
  divider: { height: 1, background: 'rgba(128,128,128,0.18)', margin: '4px 0' },
  selectTrigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    border: '1px solid rgba(128,128,128,0.3)',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    justifyContent: 'space-between',
    minWidth: 200,
  },
  selectIcon: { fontSize: 10, opacity: 0.6 },
  selectContent: {
    minWidth: 200,
    maxHeight: 'var(--radix-select-content-available-height, 260px)',
    background: 'var(--jaw-popup-bg, #fff)',
    color: 'inherit',
    border: '1px solid rgba(128,128,128,0.3)',
    borderRadius: 8,
    padding: 4,
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    overflow: 'hidden',
  },
  selectViewport: { maxHeight: 'inherit', overflowY: 'auto', padding: 2 },
  selectItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '6px 8px',
    fontSize: 12,
    cursor: 'pointer',
    outline: 'none',
    borderRadius: 4,
  },
  scrollBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 18,
    fontSize: 10,
    opacity: 0.6,
    background: 'var(--jaw-popup-bg, #fff)',
  },
  badge: {
    fontSize: 9,
    padding: '1px 5px',
    borderRadius: 4,
    background: 'rgba(245,158,11,0.18)',
    color: '#f59e0b',
    fontWeight: 600,
  },
  toggle: {
    width: 36,
    height: 20,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    padding: 2,
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    transition: 'background 120ms ease',
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 120ms ease',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid rgba(128,128,128,0.18)',
    marginTop: 'auto',
  },
  warn: { fontSize: 11, color: '#f59e0b', margin: '0 0 8px' },
  err: { fontSize: 11, color: '#ef4444', margin: '0 0 8px' },
  btnRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  btn: {
    padding: '8px 10px',
    border: '1px solid rgba(128,128,128,0.3)',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 12,
  },
  primary: {
    background: 'rgba(34,197,94,0.15)',
    borderColor: 'rgba(34,197,94,0.4)',
    color: '#22c55e',
  },
};
