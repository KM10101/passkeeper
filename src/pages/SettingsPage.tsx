import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../lib/tauri';
import { useState } from 'react';

interface Props { onBack: () => void; }

export function SettingsPage({ onBack }: Props) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const [autoLock, setAutoLock] = useState(settings?.auto_lock_minutes ?? 5);
  const [showPw, setShowPw] = useState(settings?.show_passwords_by_default ?? false);

  const save = useMutation({
    mutationFn: () => updateSettings(autoLock, showPw),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <div>
      <button onClick={onBack}>← Back</button>
      <h2>Settings</h2>
      <label>
        Auto-lock after (minutes):
        <input type="number" value={autoLock} onChange={e => setAutoLock(Number(e.target.value))} min={1} />
      </label>
      <label>
        <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} />
        Show passwords by default
      </label>
      <button onClick={() => save.mutate()}>Save</button>
    </div>
  );
}
