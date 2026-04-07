import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');

test.describe('Chat message persistence', () => {
  test('messages remain visible after switching to settings and back', async () => {
    const electronApp = await electron.launch({ args: [appPath] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector('#root > *', { timeout: 10_000 });

    // Dismiss first-launch wizard if it appears (fresh test DB has no setup flag)
    const isWizard = await window.locator('text=Welcome to Aris').isVisible().catch(() => false);
    if (isWizard) {
      // Click through all non-complete steps (skip 4×), then finish
      for (let i = 0; i < 4; i++) {
        await window.click('button:has-text("Skip")');
      }
      await window.click('button:has-text("Start chatting")');
      await window.waitForSelector('button[title="Chat history"]', { timeout: 10_000 });
    }

    // Seed a conversation with messages directly via IPC
    const { convId } = await window.evaluate(async () => {
      const conv = await (window as any).aris.invoke('conversations:create', 'Test persistence chat');
      const convId = (conv as { id: string }).id;
      await (window as any).aris.invoke('messages:add', convId, 'user', 'Hello Aris!');
      await (window as any).aris.invoke('messages:add', convId, 'assistant', 'Hello! How can I help you today?');
      return { convId };
    });

    expect(convId).toBeTruthy();

    // Open conversation sidebar
    await window.click('button[title="Chat history"]');
    await window.waitForSelector('text=Chat History', { timeout: 5_000 });

    // Click the seeded conversation
    await window.click('text=Test persistence chat');

    // Sidebar should close; wait for ChatPanel to appear
    await window.waitForSelector('textarea[placeholder*="Message Aris"]', { timeout: 5_000 });

    // Expand message history panel
    await window.click('button:has-text("Messages")');

    // Verify messages loaded from DB
    await window.waitForSelector('text=Hello Aris!', { timeout: 5_000 });
    await window.waitForSelector('text=Hello! How can I help you today?', { timeout: 5_000 });

    // Navigate to settings (unmounts ChatPanel)
    await window.click('button[title="Settings"]');
    await window.waitForSelector('text=Settings', { timeout: 5_000 });

    // Assert ChatPanel is gone
    await expect(window.locator('textarea[placeholder*="Message Aris"]')).toHaveCount(0);

    // Navigate back to chat (remounts ChatPanel, reloads messages from DB)
    await window.click('button[title="Back to chat"]');
    await window.waitForSelector('textarea[placeholder*="Message Aris"]', { timeout: 5_000 });

    // Expand message history panel again (chatExpanded persists in App state, but panel is freshly rendered)
    const expandBtn = window.locator('button:has-text("Messages")');
    // If the panel is already expanded (chatExpanded was true), messages should be visible;
    // if not, expand it.
    const msgVisible = await window.locator('text=Hello Aris!').isVisible().catch(() => false);
    if (!msgVisible) {
      await expandBtn.click();
    }

    // Messages must still be present after the view round-trip
    await window.waitForSelector('text=Hello Aris!', { timeout: 5_000 });
    await window.waitForSelector('text=Hello! How can I help you today?', { timeout: 5_000 });

    await electronApp.close();
  });
});
