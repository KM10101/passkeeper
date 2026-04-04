import { useState } from 'react';
import { unlockVault } from '../lib/tauri';

interface Props { onUnlocked: () => void; }

export function UnlockPage({ onUnlocked }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await unlockVault(password);
      onUnlocked();
    } catch {
      setError('Invalid master password');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>PassKeeper</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Master password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
        />
        <button type="submit">Unlock</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
