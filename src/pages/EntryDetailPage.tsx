import { useQuery } from '@tanstack/react-query';
import { getEntry } from '../lib/tauri';
import { TagBadge } from '../components/TagBadge';
import { FaviconAvatar } from '../components/FaviconAvatar';

interface Props { entryId: number; onBack: () => void; }

export function EntryDetailPage({ entryId, onBack }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['entry', entryId],
    queryFn: () => getEntry(entryId),
  });

  if (isLoading) return <p>Loading...</p>;
  if (!data) return <p>Not found.</p>;

  const tags: string[] = JSON.parse(data.entry.tags || '[]');

  const getFaviconDomain = (): string | null => {
    if (!data.entry.url) return null;
    try {
      return new URL(data.entry.url).hostname;
    } catch {
      return null;
    }
  };

  return (
    <div>
      <button onClick={onBack}>← Back</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FaviconAvatar domain={getFaviconDomain()} />
        <h2>{data.entry.title}</h2>
      </div>
      {data.entry.username && <p>Username: {data.entry.username}</p>}
      {data.entry.url && <p>URL: <a href={data.entry.url}>{data.entry.url}</a></p>}
      <div>{tags.map(t => <TagBadge key={t} tag={t} />)}</div>
      <h3>Fields</h3>
      {data.fields.map(f => (
        <div key={f.id}>
          <label>{f.field_name}</label>
          <input type="password" value={f.plaintext} readOnly />
        </div>
      ))}
    </div>
  );
}
