// src/components/ui/EmojiPicker.tsx
import { useState, useRef, useEffect } from 'react';

const EMOJIS = [
  '📁', '📂', '💼', '🏠', '🖥️', '🔑', '🏦', '🌐',
  '🛡️', '📧', '🔗', '💻', '🗄️', '☁️', '🎮', '📱',
  '🚀', '🔐', '🌟', '⚙️', '🎯', '📊', '🗂️', '🔒',
  '💡', '🏢', '🎓', '🧪',
];

interface Props {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-9 h-9 rounded-md border border-input bg-background flex items-center justify-center text-xl hover:bg-accent transition-colors"
        title="选择图标"
      >
        {value || '📁'}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 rounded-md border border-border bg-background shadow-md p-2">
          <div className="grid grid-cols-7 gap-1">
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onChange(emoji); setOpen(false); }}
                className={`w-8 h-8 rounded text-lg flex items-center justify-center hover:bg-accent transition-colors ${emoji === value ? 'bg-accent ring-1 ring-primary' : ''}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
