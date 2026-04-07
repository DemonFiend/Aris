import { useState, useEffect, useCallback } from 'react';
import type { CompanionConfig, CompanionPersonality, AdvancedModifier } from '@aris/shared';
import {
  TONE_OPTIONS,
  TRAITS_OPTIONS,
  INTERACTION_FREQUENCY_OPTIONS,
  HUMOR_OPTIONS,
  EXPRESSIVENESS_OPTIONS,
  ADVANCED_MODIFIER_OPTIONS,
  PERSONA_PRESETS,
} from '@aris/shared';

const PERSONALITY_DEFAULTS: Partial<CompanionPersonality> = {
  mode: 'simple',
  tone: 'cheerful',
  traits: 'friendly',
  interactionFrequency: 'occasionally-initiates',
  humor: 'light',
  expressiveness: 'medium',
  advancedModifiers: [],
  customPrompt: null,
  activePreset: null,
};

export function PersonaSettings() {
  const [personality, setPersonality] = useState<CompanionPersonality | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const config = (await window.aris.invoke('companion:get-config')) as CompanionConfig | null;
    if (config?.personality) {
      setPersonality({
        ...PERSONALITY_DEFAULTS,
        ...config.personality,
      } as CompanionPersonality);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (patch: Partial<CompanionPersonality>) => {
      if (!personality) return;
      setSaving(true);
      const updated = { ...personality, ...patch };
      setPersonality(updated);
      const config = (await window.aris.invoke('companion:get-config')) as CompanionConfig;
      await window.aris.invoke('companion:set-config', { ...config, personality: updated });
      setSaving(false);
    },
    [personality],
  );

  const applyPreset = useCallback(
    async (preset: 'supportive-gamer' | 'sassy-gamer' | null) => {
      if (preset === null) {
        await save({ activePreset: null });
        return;
      }
      const presetValues = PERSONA_PRESETS[preset];
      await save({ ...presetValues, activePreset: preset });
    },
    [save],
  );

  const toggleModifier = useCallback(
    async (mod: AdvancedModifier) => {
      if (!personality) return;
      const current = personality.advancedModifiers ?? [];
      const updated = current.includes(mod)
        ? (current.filter((m) => m !== mod) as AdvancedModifier[])
        : ([...current, mod] as AdvancedModifier[]);
      await save({ advancedModifiers: updated });
    },
    [personality, save],
  );

  if (!personality) return null;

  return (
    <div style={containerStyle}>
      <h3 style={headingStyle}>Persona</h3>

      {/* Mode toggle */}
      <div style={rowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={labelStyle}>Mode</div>
          <p style={descStyle}>
            {personality.mode === 'simple'
              ? 'Customize with curated dropdowns'
              : 'Write a fully custom system prompt'}
          </p>
        </div>
        <div style={modeToggleStyle}>
          <button
            style={personality.mode === 'simple' ? modeActiveBtnStyle : modeBtnStyle}
            onClick={() => save({ mode: 'simple' })}
          >
            Simple
          </button>
          <button
            style={personality.mode === 'advanced' ? modeActiveBtnStyle : modeBtnStyle}
            onClick={() => save({ mode: 'advanced' })}
          >
            Advanced
          </button>
        </div>
      </div>

      {personality.mode === 'simple' && (
        <>
          {/* Preset selector */}
          <div style={presetRowStyle}>
            <div style={labelStyle}>Preset</div>
            <div style={presetGroupStyle}>
              <button
                style={personality.activePreset === null ? presetActiveBtnStyle : presetBtnStyle}
                onClick={() => applyPreset(null)}
                disabled={saving}
              >
                Custom
              </button>
              <button
                style={
                  personality.activePreset === 'supportive-gamer'
                    ? presetActiveBtnStyle
                    : presetBtnStyle
                }
                onClick={() => applyPreset('supportive-gamer')}
                disabled={saving}
              >
                Supportive Gamer
              </button>
              <button
                style={
                  personality.activePreset === 'sassy-gamer'
                    ? presetActiveBtnStyle
                    : presetBtnStyle
                }
                onClick={() => applyPreset('sassy-gamer')}
                disabled={saving}
              >
                Sassy Gamer
              </button>
            </div>
          </div>

          <div style={dividerStyle} />

          <SelectRow
            label="Tone"
            value={personality.tone}
            options={TONE_OPTIONS}
            onChange={(v) =>
              save({ tone: v as CompanionPersonality['tone'], activePreset: null })
            }
          />
          <SelectRow
            label="Personality"
            value={personality.traits}
            options={TRAITS_OPTIONS}
            onChange={(v) =>
              save({ traits: v as CompanionPersonality['traits'], activePreset: null })
            }
          />
          <SelectRow
            label="Interaction Frequency"
            value={personality.interactionFrequency}
            options={INTERACTION_FREQUENCY_OPTIONS}
            onChange={(v) =>
              save({
                interactionFrequency: v as CompanionPersonality['interactionFrequency'],
                activePreset: null,
              })
            }
          />
          <SelectRow
            label="Humor"
            value={personality.humor}
            options={HUMOR_OPTIONS}
            onChange={(v) =>
              save({ humor: v as CompanionPersonality['humor'], activePreset: null })
            }
          />
          <SelectRow
            label="Expressiveness"
            value={personality.expressiveness}
            options={EXPRESSIVENESS_OPTIONS}
            onChange={(v) =>
              save({ expressiveness: v as CompanionPersonality['expressiveness'], activePreset: null })
            }
          />
        </>
      )}

      {personality.mode === 'advanced' && (
        <>
          <div style={dividerStyle} />

          <div style={{ padding: 'var(--space-2) 0' }}>
            <div style={labelStyle}>Custom System Prompt</div>
            <p style={descStyle}>Write a full custom persona for Aris</p>
            <textarea
              value={personality.customPrompt ?? ''}
              onChange={(e) => save({ customPrompt: e.target.value || null })}
              rows={6}
              placeholder="You are Aris, a..."
              style={textareaStyle}
            />
          </div>

          <div style={dividerStyle} />

          <div style={{ padding: 'var(--space-2) 0' }}>
            <div style={labelStyle}>Trait Modifiers</div>
            <p style={descStyle}>Toggle additional personality traits</p>
            <div style={chipGroupStyle}>
              {ADVANCED_MODIFIER_OPTIONS.map((mod) => {
                const active = (personality.advancedModifiers ?? []).includes(mod);
                return (
                  <button
                    key={mod}
                    style={active ? chipActiveStyle : chipStyle}
                    onClick={() => toggleModifier(mod)}
                    disabled={saving}
                  >
                    {formatLabel(mod)}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={rowStyle}>
      <div style={labelStyle}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {formatLabel(opt)}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatLabel(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Styles ── */

const containerStyle: React.CSSProperties = {
  padding: 'var(--space-4)',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-3)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-primary)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-3) 0',
  gap: 'var(--space-4)',
};

const presetRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-3) 0',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
};

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-medium)' as any,
  color: 'var(--text-primary)',
};

const descStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 'var(--space-1) 0 0',
  lineHeight: 'var(--leading-normal)',
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  margin: 'var(--space-2) 0',
};

const modeToggleStyle: React.CSSProperties = {
  display: 'flex',
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
  border: '1px solid var(--border-default)',
};

const modeBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-muted)',
  border: 'none',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
};

const modeActiveBtnStyle: React.CSSProperties = {
  ...modeBtnStyle,
  background: 'var(--color-primary)',
  color: '#fff',
  fontWeight: 'var(--font-semibold)' as any,
};

const presetGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  flexWrap: 'wrap',
};

const presetBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-muted)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-full)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

const presetActiveBtnStyle: React.CSSProperties = {
  ...presetBtnStyle,
  background: 'var(--color-primary-subtle)',
  border: '1px solid var(--color-primary)',
  color: 'var(--color-primary)',
  fontWeight: 'var(--font-semibold)' as any,
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
  minWidth: 160,
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 'var(--space-2)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'inherit',
  resize: 'vertical',
  lineHeight: 'var(--leading-relaxed)',
  boxSizing: 'border-box',
};

const chipGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-1)',
  marginTop: 'var(--space-2)',
};

const chipStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-muted)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-full)',
  padding: '2px var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
};

const chipActiveStyle: React.CSSProperties = {
  ...chipStyle,
  background: 'var(--color-primary-subtle)',
  border: '1px solid var(--color-primary)',
  color: 'var(--color-primary)',
  fontWeight: 'var(--font-semibold)' as any,
};
