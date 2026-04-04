interface Props { tag: string; }
export function TagBadge({ tag }: Props) {
  return <span style={{ background: '#e0e0e0', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}>{tag}</span>;
}
