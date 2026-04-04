import { useGroups } from '../hooks/useGroups';
interface Props { selected: number | null; onSelect: (id: number | null) => void; }
export function GroupTree({ selected, onSelect }: Props) {
  const { groups } = useGroups();
  return (
    <nav>
      <button onClick={() => onSelect(null)} style={{ fontWeight: selected === null ? 'bold' : 'normal' }}>
        All Entries
      </button>
      {groups.map(g => (
        <button key={g.id} onClick={() => onSelect(g.id)} style={{ display: 'block', fontWeight: selected === g.id ? 'bold' : 'normal' }}>
          {g.icon && <span>{g.icon}</span>} {g.name}
        </button>
      ))}
    </nav>
  );
}
