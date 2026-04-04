import { useEntries } from '../hooks/useEntries';
interface Props { groupId: number | null; search: string; onSelect: (id: number) => void; }
export function EntryList({ groupId, search, onSelect }: Props) {
  const { data: entries = [] } = useEntries(groupId, search);
  if (entries.length === 0) return <p>No entries found.</p>;
  return (
    <ul>
      {entries.map(e => (
        <li key={e.id} onClick={() => onSelect(e.id)} style={{ cursor: 'pointer' }}>
          <strong>{e.title}</strong>
          {e.username && <span> — {e.username}</span>}
        </li>
      ))}
    </ul>
  );
}
