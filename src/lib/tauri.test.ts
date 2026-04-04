import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { unlockVault, isLocked } from './tauri';

describe('tauri IPC wrappers', () => {
  it('unlockVault calls invoke with correct command', async () => {
    (invoke as any).mockResolvedValue(undefined);
    await unlockVault('mypassword');
    expect(invoke).toHaveBeenCalledWith('unlock', { password: 'mypassword' });
  });

  it('isLocked returns boolean', async () => {
    (invoke as any).mockResolvedValue(true);
    const result = await isLocked();
    expect(result).toBe(true);
  });
});
