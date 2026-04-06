import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import { MoreHorizontal, Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { EmojiPicker } from "./ui/EmojiPicker";
import { useGroups } from "../hooks/useGroups";
import { cn } from "../lib/utils";
import type { Group } from "../lib/tauri";

interface Props {
  selected: number | null;
  onSelect: (id: number | null) => void;
  totalCount: number;
}

// ── GroupItem (card, with inline edit mode) ──────────────────
function GroupItem({
  group,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  group: Group;
  selected: boolean;
  onSelect: () => void;
  onRename: (id: number, name: string, icon: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editIcon, setEditIcon] = useState(group.icon ?? "📁");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editing]);

  const startEdit = () => {
    setEditName(group.name);
    setEditIcon(group.icon ?? "📁");
    setEditing(true);
  };

  const commitEdit = async () => {
    if (!editName.trim()) { setEditing(false); return; }
    await onRename(group.id, editName.trim(), editIcon);
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  if (editing) {
    return (
      <div className="rounded-lg border border-primary ring-1 ring-primary/20 bg-card p-2 flex items-center gap-2">
        <EmojiPicker value={editIcon} onChange={setEditIcon} />
        <Input
          ref={inputRef}
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
          className="h-8 text-sm flex-1"
        />
        <button onClick={commitEdit} className="text-primary hover:text-primary/80 shrink-0">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card shadow-sm transition-all flex items-center gap-2 px-3 py-2 group cursor-pointer",
        selected
          ? "border-primary ring-1 ring-primary/20 shadow-md"
          : "border-border hover:border-border/80 hover:shadow-md",
      )}
      onClick={onSelect}
    >
      <span className="text-xl leading-none shrink-0">{group.icon ?? "📁"}</span>
      <span className="flex-1 text-sm font-medium truncate">{group.name}</span>
      <span className={cn(
        "text-xs rounded-full px-2 py-0.5 shrink-0",
        selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}>
        {group.entry_count}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={e => { e.stopPropagation(); startEdit(); }}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> 重命名
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={e => { e.stopPropagation(); onDelete(group.id); }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" /> 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── AddGroupCard (inline new group form) ─────────────────────
function AddGroupCard({ onAdd }: { onAdd: (name: string, icon: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name.trim(), icon);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-primary ring-1 ring-primary/20 bg-card p-2 flex items-center gap-2"
    >
      <EmojiPicker value={icon} onChange={setIcon} />
      <Input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="分组名称"
        className="h-8 text-sm flex-1"
      />
      <button type="submit" className="text-primary hover:text-primary/80 shrink-0">
        <Check className="h-4 w-4" />
      </button>
    </form>
  );
}

// ── GroupTree ─────────────────────────────────────────────────
export function GroupTree({ selected, onSelect, totalCount }: Props) {
  const { groups, createGroup, updateGroup, deleteGroup } = useGroups();
  const [adding, setAdding] = useState(false);

  const handleAdd = async (name: string, icon: string) => {
    await createGroup({ name, parentId: null, icon, sortOrder: groups.length });
    setAdding(false);
  };

  const handleRename = async (id: number, name: string, icon: string | null) => {
    const g = groups.find(g => g.id === id)!;
    await updateGroup({ id, name, icon, sortOrder: g.sort_order });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">分组</span>
          <button
            onClick={() => setAdding(v => !v)}
            className="w-6 h-6 rounded-md bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition-colors"
            title="新建分组"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* All Entries card */}
        <div
          className={cn(
            "rounded-lg border bg-card shadow-sm flex items-center gap-2 px-3 py-2 cursor-pointer transition-all",
            selected === null
              ? "border-primary ring-1 ring-primary/20 shadow-md"
              : "border-border hover:border-border/80 hover:shadow-md",
          )}
          onClick={() => onSelect(null)}
        >
          <span className="text-xl leading-none">🗂️</span>
          <span className="flex-1 text-sm font-medium">全部条目</span>
          <span className={cn(
            "text-xs rounded-full px-2 py-0.5",
            selected === null ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}>
            {totalCount}
          </span>
        </div>
      </div>

      {/* Scrollable group list */}
      <div className="flex-1 overflow-y-auto bg-muted/40">
        <div className="p-2 flex flex-col gap-2">
          {groups.map(group => (
            <GroupItem
              key={group.id}
              group={group}
              selected={selected === group.id}
              onSelect={() => onSelect(group.id)}
              onRename={handleRename}
              onDelete={deleteGroup}
            />
          ))}
          {adding && (
            <AddGroupCard onAdd={handleAdd} />
          )}
        </div>
      </div>
    </div>
  );
}
