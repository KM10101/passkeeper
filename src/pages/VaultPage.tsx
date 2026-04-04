import { useState } from 'react';
import { GroupTree } from '../components/GroupTree';
import { EntryList } from '../components/EntryList';
import { SearchBar } from '../components/SearchBar';
import { useVault } from '../hooks/useVault';

interface Props { onLock: () => void; }

export function VaultPage({ onLock }: Props) {
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [_selectedEntry, setSelectedEntry] = useState<number | null>(null);
  const { lock } = useVault();

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: 200, borderRight: '1px solid #ccc', padding: 8 }}>
        <GroupTree selected={selectedGroup} onSelect={setSelectedGroup} />
        <button onClick={() => { lock(); onLock(); }}>Lock</button>
      </aside>
      <main style={{ flex: 1, padding: 8 }}>
        <SearchBar value={search} onChange={setSearch} />
        <EntryList groupId={selectedGroup} search={search} onSelect={setSelectedEntry} />
      </main>
    </div>
  );
}
