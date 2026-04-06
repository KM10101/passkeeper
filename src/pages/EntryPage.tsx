// src/pages/EntryPage.tsx
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { EntryForm } from "../components/entries/EntryForm";
import type { EntryDetail } from "../lib/tauri";

interface Props {
  mode: 'new' | 'edit';
  existing?: EntryDetail;
  defaultGroupId?: number | null;
  onDone: () => void;
}

export function EntryPage({ mode, existing, defaultGroupId, onDone }: Props) {
  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-6 h-14 border-b border-border bg-background shrink-0">
        <Button variant="ghost" size="icon" onClick={onDone}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold">
          {mode === 'new' ? '新建条目' : '编辑条目'}
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <EntryForm
            existing={existing}
            defaultGroupId={defaultGroupId}
            onSuccess={onDone}
            onCancel={onDone}
          />
        </div>
      </div>
    </div>
  );
}
