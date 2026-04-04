import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UnlockPage } from './pages/UnlockPage';
import { VaultPage } from './pages/VaultPage';

const queryClient = new QueryClient();

export default function App() {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      {unlocked
        ? <VaultPage onLock={() => setUnlocked(false)} />
        : <UnlockPage onUnlocked={() => setUnlocked(true)} />
      }
    </QueryClientProvider>
  );
}
