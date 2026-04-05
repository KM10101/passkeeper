import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { EntryCard } from "./entries/EntryCard";
import { useEntries } from "../hooks/useEntries";

interface Props {
  groupId: number | null;
  selectedEntryId: number | null;
  onSelect: (id: number) => void;
  onNewEntry: () => void;
}

export function EntryList({ groupId, selectedEntryId, onSelect, onNewEntry }: Props) {
  const [search, setSearch] = useState("");
  const { entries } = useEntries(groupId ?? undefined, search || undefined);

  return (
    <div className="flex flex-col h-full">
      {/* Search + New button */}
      <div className="p-2 border-b border-border flex gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-7 h-8 text-sm"
          />
        </div>
        <Button size="sm" className="h-8 px-2" onClick={onNewEntry}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Entry cards */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </div>
            <p className="text-sm">{search ? "无搜索结果" : "暂无条目"}</p>
            {!search && (
              <button onClick={onNewEntry} className="text-xs text-primary hover:underline">
                创建第一条记录
              </button>
            )}
          </div>
        ) : (
          entries.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              selected={entry.id === selectedEntryId}
              onClick={() => onSelect(entry.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
