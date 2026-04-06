// src/components/ui/EmojiPicker.tsx
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPopupPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        popupRef.current && !popupRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="w-9 h-9 rounded-md border border-input bg-background flex items-center justify-center text-xl hover:bg-accent transition-colors"
        title="选择图标"
      >
        {value || '📁'}
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: popupPos.top, left: popupPos.left, zIndex: 9999 }}
          className="rounded-md border border-border bg-background shadow-md p-2"
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
