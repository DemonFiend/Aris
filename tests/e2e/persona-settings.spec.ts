import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Persona settings', () => {
  test('companion config includes persona personality fields with defaults', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const config = await window.evaluate(async () => {
      try {
        return await (window as any).aris.invoke('companion:get-config');
      } catch {
        return null;
      }
    });

    expect(config).toBeTruthy();
    expect(config.personality).toBeTruthy();
    expect(config.personality.mode).toBeDefined();
    expect(config.personality.tone).toBeDefined();
    expect(config.personality.traits).toBeDefined();
    expect(config.personality.interactionFrequency).toBeDefined();
    expect(config.personality.humor).toBeDefined();
    expect(config.personality.expressiveness).toBeDefined();
    expect(Array.isArray(config.personality.advancedModifiers)).toBe(true);

    await electronApp.close();
  });

  test('persona settings persist after save', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      try {
        const config = await (window as any).aris.invoke('companion:get-config');
        const updatedPersonality = {
          ...config.personality,
          tone: 'dramatic',
          traits: 'mischievous',
          humor: 'sarcastic',
          expressiveness: 'high',
          mode: 'simple',
          activePreset: null,
        };
        await (window as any).aris.invoke('companion:set-config', {
          ...config,
          personality: updatedPersonality,
        });
        const readback = await (window as any).aris.invoke('companion:get-config');
        return {
          ok: true,
          tone: readback.personality.tone,
          traits: readback.personality.traits,
          humor: readback.personality.humor,
          expressiveness: readback.personality.expressiveness,
        };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    });

    expect(result.ok).toBe(true);
    expect((result as any).tone).toBe('dramatic');
    expect((result as any).traits).toBe('mischievous');
    expect((result as any).humor).toBe('sarcastic');
    expect((result as any).expressiveness).toBe('high');

    await electronApp.close();
  });

  test('advanced mode with custom prompt persists', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      try {
        const config = await (window as any).aris.invoke('companion:get-config');
        const updatedPersonality = {
          ...config.personality,
          mode: 'advanced',
          customPrompt: 'You are a hyper-competitive gaming commentator.',
          advancedModifiers: ['bold', 'competitive'],
        };
        await (window as any).aris.invoke('companion:set-config', {
          ...config,
          personality: updatedPersonality,
        });
        const readback = await (window as any).aris.invoke('companion:get-config');
        return {
          ok: true,
          mode: readback.personality.mode,
          customPrompt: readback.personality.customPrompt,
          advancedModifiers: readback.personality.advancedModifiers,
        };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    });

    expect(result.ok).toBe(true);
    expect((result as any).mode).toBe('advanced');
    expect((result as any).customPrompt).toBe('You are a hyper-competitive gaming commentator.');
    expect((result as any).advancedModifiers).toContain('bold');
    expect((result as any).advancedModifiers).toContain('competitive');

    // Reset to defaults
    await window.evaluate(async () => {
      const config = await (window as any).aris.invoke('companion:get-config');
      await (window as any).aris.invoke('companion:set-config', {
        ...config,
        personality: { ...config.personality, mode: 'simple', customPrompt: null, advancedModifiers: [] },
      });
    });

    await electronApp.close();
  });

  test('preset application sets all 5 selector values', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const result = await window.evaluate(async () => {
      try {
        const config = await (window as any).aris.invoke('companion:get-config');
        // Apply supportive-gamer preset values manually (as the UI would)
        const preset = {
          tone: 'warm',
          traits: 'supportive',
          interactionFrequency: 'frequently-initiates',
          humor: 'light',
          expressiveness: 'high',
          advancedModifiers: ['energetic', 'affectionate'],
          activePreset: 'supportive-gamer',
        };
        await (window as any).aris.invoke('companion:set-config', {
          ...config,
          personality: { ...config.personality, ...preset },
        });
        const readback = await (window as any).aris.invoke('companion:get-config');
        return {
          ok: true,
          tone: readback.personality.tone,
          traits: readback.personality.traits,
          interactionFrequency: readback.personality.interactionFrequency,
          humor: readback.personality.humor,
          expressiveness: readback.personality.expressiveness,
          activePreset: readback.personality.activePreset,
        };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    });

    expect(result.ok).toBe(true);
    expect((result as any).tone).toBe('warm');
    expect((result as any).traits).toBe('supportive');
    expect((result as any).interactionFrequency).toBe('frequently-initiates');
    expect((result as any).humor).toBe('light');
    expect((result as any).expressiveness).toBe('high');
    expect((result as any).activePreset).toBe('supportive-gamer');

    await electronApp.close();
  });
});
