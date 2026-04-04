interface Props { domain: string | null; size?: number; }
export function FaviconAvatar({ domain, size = 24 }: Props) {
  if (!domain) return <div style={{ width: size, height: size, background: '#ccc', borderRadius: 4 }} />;
  return (
    <img
      src={`https://${domain}/favicon.ico`}
      width={size}
      height={size}
      alt=""
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}
