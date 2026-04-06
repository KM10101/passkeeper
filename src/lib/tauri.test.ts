import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { save as dialogSave } from '@tauri-apps/plugin-dialog';
import { unlockVault, isLocked, updateSettings, saveFileDialog } from './tauri';

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

  it('updateSettings passes proxyEnabled', async () => {
    (invoke as any).mockResolvedValue({ proxy_enabled: true, auto_lock_minutes: 5, show_passwords_by_default: false, favicon_cache_expiry_days: 7, http_proxy: '', no_proxy: '', storage_dir: '', timezone: '' });
    await updateSettings(5, false, 7, 'http://proxy:8080', '', true, '');
    expect(invoke).toHaveBeenCalledWith('update_settings', expect.objectContaining({
      proxyEnabled: true,
    }));
  });

  it('saveFileDialog passes defaultPath option', async () => {
    (dialogSave as any).mockResolvedValue('/tmp/test.pkv');
    await saveFileDialog({ defaultPath: 'passkeeper-20260406-1830.pkv' });
    expect(dialogSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'passkeeper-20260406-1830.pkv' })
    );
  });
});
