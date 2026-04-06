// src/components/ui/field-type-combobox.tsx
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export const FIELD_TYPE_OPTIONS = [
  { value: 'text',     label: 'Text',     icon: '📝' },
  { value: 'password', label: 'Password', icon: '🔐' },
  { value: 'url',      label: 'URL',      icon: '🔗' },
  { value: 'email',    label: 'Email',    icon: '📧' },
  { value: 'token',    label: 'Token',    icon: '🔑' },
  { value: 'secret',   label: 'Secret',   icon: '🔒' },
  { value: 'number',   label: 'Number',   icon: '🔢' },
  { value: 'date',     label: 'Date',     icon: '📅' },
  { value: 'markdown', label: 'Markdown', icon: '📖' },
  { value: 'code',     label: 'Code',     icon: '💻' },
  { value: 'json',     label: 'JSON',     icon: '{}' },
  { value: 'yaml',     label: 'YAML',     icon: '⚙️' },
] as const;

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function FieldTypeCombobox({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filtered = FIELD_TYPE_OPTIONS.filter(o =>
    o.value.includes(query.toLowerCase()) ||
    o.label.toLowerCase().includes(query.toLowerCase()),
  );
  const current = FIELD_TYPE_OPTIONS.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setQuery(''); }}
        className="flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-2 text-sm min-w-[120px] hover:bg-accent transition-colors"
      >
        <span className="text-base leading-none">{current?.icon ?? '📝'}</span>
        <span className="flex-1 text-left truncate">{current?.label ?? value}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-48 rounded-md border border-border bg-background shadow-md">
          <div className="p-1.5 border-b border-border">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索类型…"
              className="w-full h-7 px-2 text-xs rounded bg-muted/50 outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">无结果</p>
            ) : filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent transition-colors',
                  opt.value === value && 'bg-accent',
                )}
              >
                <span className="text-base leading-none w-5">{opt.icon}</span>
                <span className="flex-1 text-left">{opt.label}</span>
                {opt.value === value && <Check className="h-3 w-3 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
