import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test.describe('CSP blob: URL support', () => {
  test('should allow fetch on blob: URLs (Three.js/VRM loading)', async () => {
    const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');
    const electronApp = await electron.launch({ args: [appPath] });

    const window = await electronApp.firstWindow();

    // Collect CSP violations during the test
    const cspViolations: string[] = [];
    window.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Content Security Policy') && text.includes('blob:')) {
        cspViolations.push(text);
      }
    });

    // Create a blob URL and fetch it — this is what Three.js does for VRM loading
    const fetchResult = await window.evaluate(async () => {
      const blob = new Blob([JSON.stringify({ test: true })], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const response = await fetch(url);
        const data = await response.json();
        URL.revokeObjectURL(url);
        return { success: true, data };
      } catch (err: any) {
        URL.revokeObjectURL(url);
        return { success: false, error: err.message };
      }
    });

    expect(fetchResult.success).toBe(true);
    expect(fetchResult.data).toEqual({ test: true });
    expect(cspViolations).toHaveLength(0);

    await electronApp.close();
  });

  test('should allow inline styles (React style attributes)', async () => {
    const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');
    const electronApp = await electron.launch({ args: [appPath] });

    const window = await electronApp.firstWindow();

    // Collect CSP violations for inline styles
    const styleViolations: string[] = [];
    window.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Content Security Policy') && text.includes('style')) {
        styleViolations.push(text);
      }
    });

    // Apply an inline style — this is what React does for all style={{}} props
    const result = await window.evaluate(() => {
      const el = document.createElement('div');
      el.style.backgroundColor = 'red';
      el.style.width = '10px';
      el.style.height = '10px';
      document.body.appendChild(el);
      const computed = window.getComputedStyle(el);
      const applied = computed.backgroundColor !== '' && computed.width === '10px';
      document.body.removeChild(el);
      return applied;
    });

    expect(result).toBe(true);
    expect(styleViolations).toHaveLength(0);

    await electronApp.close();
  });

});
