import { invoke } from '@tauri-apps/api/core';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { save as dialogSave, open as dialogOpen } from '@tauri-apps/plugin-dialog';

export interface Group {
  id: number;
  name: string;
  parent_id: number | null;
  icon: string | null;
  sort_order: number;
  created_at: number;
  entry_count: number;
}

export interface Entry {
  id: number;
  group_id: number | null;
  title: string;
  url: string | null;
  site_title: string | null;
  username: string | null;
  template_type: string;
  tags: string;
  notes: string | null;
  favorite: boolean;
  pinned: boolean;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface DecryptedField {
  id: number;
  field_name: string;
  field_type: string;
  plaintext: string;
  sort_order: number;
}

export interface EntryDetail {
  entry: Entry;
  fields: DecryptedField[];
}

export interface NewEntryField {
  field_name: string;
  field_type: string;
  field_value: string;
  sort_order: number;
}

export interface AppSettings {
  auto_lock_minutes: number;
  show_passwords_by_default: boolean;
  favicon_cache_expiry_days: number;
  http_proxy: string;
  no_proxy: string;
  storage_dir: string;
  timezone: string;
}

export interface SiteMetadata {
  title: string | null;
  favicon_domain: string | null;
}

// Auth
export const unlockVault = (password: string) =>
  invoke<void>('unlock', { password });
export const lockVault = () => invoke<void>('lock');
export const isLocked = () => invoke<boolean>('is_locked');
export const changeMasterPassword = (oldPassword: string, newPassword: string) =>
  invoke<void>('change_master_password', { oldPassword, newPassword });

// Groups
export const listGroups = () => invoke<Group[]>('list_groups');
export const createGroup = (name: string, parentId: number | null, icon: string | null, sortOrder: number) =>
  invoke<Group>('create_group', { name, parentId, icon, sortOrder });
export const updateGroup = (id: number, name: string, icon: string | null, sortOrder: number) =>
  invoke<Group>('update_group', { id, name, icon, sortOrder });
export const deleteGroup = (id: number) => invoke<void>('delete_group', { id });

// Entries
export const listEntries = (groupId?: number, search?: string, tags?: string, favorite?: boolean) =>
  invoke<Entry[]>('list_entries', { groupId, search, tags, favorite: favorite ?? false });
export const getEntry = (id: number) => invoke<EntryDetail>('get_entry', { id });
export const createEntry = (
  groupId: number | null, title: string, url: string | null,
  siteTitle: string | null, username: string | null,
  templateType: string, tags: string, notes: string | null,
  favorite: boolean, fields: NewEntryField[],
) => invoke<Entry>('create_entry', { groupId, title, url, siteTitle, username, templateType, tags, notes, favorite, fields });
export const updateEntry = (
  id: number, groupId: number | null, title: string, url: string | null,
  siteTitle: string | null, username: string | null,
  templateType: string, tags: string, notes: string | null,
  favorite: boolean, fields: NewEntryField[],
) => invoke<Entry>('update_entry', { id, groupId, title, url, siteTitle, username, templateType, tags, notes, favorite, fields });
export const deleteEntry = (id: number) => invoke<void>('delete_entry', { id });
export const pinEntry = (id: number, pinned: boolean) =>
  invoke<Entry>('pin_entry', { id, pinned });
export const reorderEntries = (ids: number[], pinned: boolean) =>
  invoke<void>('reorder_entries', { ids, pinned });

// Metadata
export const fetchSiteMetadata = (url: string) =>
  invoke<SiteMetadata>('fetch_site_metadata', { url });
export const getFavicon = (domain: string) =>
  invoke<number[] | null>('get_favicon', { domain });

// Vault IO
export const exportVault = (exportPassword: string) =>
  invoke<number[]>('export_vault', { exportPassword });
export const importVault = (data: number[], exportPassword: string) =>
  invoke<void>('import_vault', { data, exportPassword });

// Settings
export const getSettings = () => invoke<AppSettings>('get_settings');
export const updateSettings = (
  autoLockMinutes: number,
  showPasswordsByDefault: boolean,
  faviconCacheExpiryDays: number,
  httpProxy: string,
  noProxy: string,
  timezone: string,
) => invoke<AppSettings>('update_settings', {
  autoLockMinutes, showPasswordsByDefault,
  faviconCacheExpiryDays, httpProxy, noProxy, timezone,
});

export const getStorageDir = () => invoke<string>('get_storage_dir');
export const migrateStorage = (newDir: string) =>
  invoke<void>('migrate_storage', { newDir });

// Shell
export const openUrl = (url: string) => shellOpen(url);

// Dialog
export const saveFileDialog = (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
  dialogSave(options);
export const openFileDialog = (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
  dialogOpen({ ...options, multiple: false }) as Promise<string | null>;
export const openDirDialog = () =>
  dialogOpen({ directory: true, multiple: false }) as Promise<string | null>;

// Vault IO – path-based
export const exportVaultToPath = (path: string, exportPassword: string) =>
  invoke<void>('export_vault_to_path', { path, exportPassword });
export const importVaultFromPath = (path: string, exportPassword: string) =>
  invoke<void>('import_vault_from_path', { path, exportPassword });
