import { useState } from 'react';
import { APP_NAME } from '@aris/shared';
import { ProviderSettings } from './ProviderSettings';
import { ChatPanel } from './ChatPanel';

type View = 'chat' | 'settings';

export function App() {
  const [view, setView] = useState<View>('chat');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', color: '#eee', background: '#111', minHeight: '100vh' }}>
      <header style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.2rem' }}>{APP_NAME}</h1>
        <button
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          style={{ background: 'none', border: '1px solid #444', color: '#ccc', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
        >
          {view === 'settings' ? 'Back' : 'Settings'}
        </button>
      </header>

      {view === 'chat' && <ChatPanel />}
      {view === 'settings' && <ProviderSettings />}
    </div>
  );
}
