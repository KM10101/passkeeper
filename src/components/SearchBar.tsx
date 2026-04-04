interface Props { value: string; onChange: (v: string) => void; }
export function SearchBar({ value, onChange }: Props) {
  return (
    <input
      type="search"
      placeholder="Search entries..."
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '8px' }}
    />
  );
}
