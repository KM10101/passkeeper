import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function TimezoneCombobox({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus filter input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Get all IANA timezone strings from the browser
  const allZones: string[] = (Intl as any).supportedValuesOf?.('timeZone') ?? [];

  const filtered = allZones.filter(tz =>
    tz.toLowerCase().includes(query.toLowerCase())
  );

  const displayLabel = value || '系统默认';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setQuery(''); }}
        className="flex items-center gap-1.5 h-8 w-full rounded-md border border-input bg-background px-3 text-sm hover:bg-accent transition-colors"
      >
        <span className="flex-1 text-left truncate">{displayLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-md border border-border bg-background shadow-md">
          <div className="p-1.5 border-b border-border">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索时区…"
              className="w-full h-7 px-2 text-xs rounded bg-muted/50 outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {/* System default option */}
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent transition-colors',
                value === '' && 'bg-accent',
              )}
            >
              <span className="flex-1 text-left">系统默认</span>
              {value === '' && <Check className="h-3 w-3 text-primary shrink-0" />}
            </button>
            {filtered.map(tz => (
              <button
                key={tz}
                type="button"
                onClick={() => { onChange(tz); setOpen(false); }}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent transition-colors',
                  value === tz && 'bg-accent',
                )}
              >
                <span className="flex-1 text-left">{tz}</span>
                {value === tz && <Check className="h-3 w-3 text-primary shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">无结果</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
