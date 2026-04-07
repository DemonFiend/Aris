import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const rendererDist = path.resolve(__dirname, '../../packages/renderer/dist');

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
