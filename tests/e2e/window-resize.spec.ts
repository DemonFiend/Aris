import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

const rendererDist = path.resolve(__dirname, '../../packages/renderer/dist');

test.describe('Window minimum size (ARI-137)', () => {
  test('window enforces minimum size of 480x560', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const minSize = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.getMinimumSize();
    });

    expect(minSize[0]).toBe(480);
    expect(minSize[1]).toBe(560);

    await electronApp.close();
  });
});

test.describe('Canvas resize debounce removed (ARI-137)', () => {
  test('compiled renderer JS calls resize directly without 150ms debounce', async () => {
    const assets = fs.readdirSync(path.join(rendererDist, 'assets'));
    const jsFile = assets.find((f) => f.endsWith('.js'));
    expect(jsFile).toBeTruthy();

    const js = fs.readFileSync(path.join(rendererDist, 'assets', jsFile!), 'utf-8');

    // The old debounce used clearTimeout on every resize event — that pattern is now gone.
    // AvatarDisplay no longer uses clearTimeout at all, so any occurrence means the
    // debounce was re-introduced.
    // Note: we search for clearTimeout adjacent to the resize call as a proxy.
    // The debounce block was the only clearTimeout in AvatarDisplay.
    const resizeIndex = js.indexOf('clientWidth');
    expect(resizeIndex).toBeGreaterThan(-1); // resize call still present

    // The debounce wrapped resize in setTimeout(..., 150). Verify that 150 does not
    // appear as a setTimeout delay in the vicinity of the resize call.
    const vicinity = js.slice(Math.max(0, resizeIndex - 200), resizeIndex + 200);
    const debouncedPattern = /setTimeout\([^)]*,\s*150\s*\)/;
    expect(debouncedPattern.test(vicinity)).toBe(false);
  });
});

test.describe('Window Resize', () => {
  test('built CSS includes height:100% on html, body, and #root for proper resize', async () => {
    // Find the CSS asset in the renderer build
    const assets = fs.readdirSync(path.join(rendererDist, 'assets'));
    const cssFile = assets.find((f) => f.endsWith('.css'));
    expect(cssFile).toBeTruthy();

    const css = fs.readFileSync(path.join(rendererDist, 'assets', cssFile!), 'utf-8');

    // The fix for window resize (ARI-107): html, body, #root must have height:100%
    // so the flex layout fills the viewport immediately without needing settings visit
    expect(css).toContain('html,body,#root{height:100%');
  });

  test('App root style uses height 100% instead of minHeight 100vh', async () => {
    // Verify the compiled JS uses height:\"100%\" for the root element
    const assets = fs.readdirSync(path.join(rendererDist, 'assets'));
    const jsFile = assets.find((f) => f.endsWith('.js'));
    expect(jsFile).toBeTruthy();

    const js = fs.readFileSync(path.join(rendererDist, 'assets', jsFile!), 'utf-8');

    // The root style should use height: "100%" not minHeight: "100vh"
    // In minified output, this appears as height:"100%"
    expect(js).toContain('height:"100%"');
    // Ensure we don't still have the old minHeight: "100vh" for the root layout
    expect(js).not.toContain('minHeight:"100vh"');
  });
});
