import { useState } from 'react';
import { GroupTree } from '../components/GroupTree';
import { EntryList } from '../components/EntryList';
import { useVault } from '../hooks/useVault';

interface Props { onLock: () => void; }

export function VaultPage({ onLock }: Props) {
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null);
  const { lock } = useVault();

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: 200, borderRight: '1px solid #ccc', padding: 8 }}>
        <GroupTree selected={selectedGroup} onSelect={setSelectedGroup} />
        <button onClick={() => { lock(); onLock(); }}>Lock</button>
      </aside>
      <main style={{ flex: 1, padding: 8 }}>
        <EntryList
          groupId={selectedGroup}
          selectedEntryId={selectedEntry}
          onSelect={setSelectedEntry}
          onNewEntry={() => {}}
        />
      </main>
    </div>
  );
}
