import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import { MoreHorizontal, Pencil, Trash2, Check, X, Plus, GripVertical, Pin, PinOff } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { EmojiPicker } from "./ui/EmojiPicker";
import { useGroups } from "../hooks/useGroups";
import { cn } from "../lib/utils";
import type { Group } from "../lib/tauri";
import { toast } from "sonner";

interface Props {
  selected: number | null;
  onSelect: (id: number | null) => void;
  totalCount: number;
}

function GroupItem({
  group, selected, onSelect, onRename, onDelete, onTogglePin,
}: {
  group: Group;
  selected: boolean;
  onSelect: () => void;
  onRename: (id: number, name: string, icon: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onTogglePin: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editIcon, setEditIcon] = useState(group.icon ?? "📁");
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editing]);

  const commitEdit = async () => {
    if (!editName.trim()) { setEditing(false); return; }
    await onRename(group.id, editName.trim(), editIcon);
    setEditing(false);
  };

  if (editing) {
    return (
      <div ref={setNodeRef} style={style} className="rounded-lg border border-primary ring-1 ring-primary/20 bg-card p-2 flex items-center gap-2">
        <EmojiPicker value={editIcon} onChange={setEditIcon} />
        <Input
          ref={inputRef}
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
          className="h-8 text-sm flex-1"
        />
        <button onClick={commitEdit} className="text-primary hover:text-primary/80 shrink-0">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-card shadow-sm transition-all flex items-center gap-2 px-3 py-2 group cursor-pointer",
        selected
          ? "border-primary ring-1 ring-primary/20 shadow-md"
          : "border-border hover:border-border/80 hover:shadow-md",
        group.is_pinned && "bg-primary/5 border-primary/20",
      )}
      onClick={onSelect}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0"
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-xl leading-none shrink-0">{group.icon ?? "📁"}</span>
      <span className="flex-1 text-sm font-medium truncate">{group.name}</span>
      {group.is_pinned && <Pin className="h-3 w-3 text-primary/60 shrink-0" />}
      <span className={cn(
        "text-xs rounded-full px-2 py-0.5 shrink-0",
        selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}>
        {group.entry_count}
      </span>
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
        onClick={e => { e.stopPropagation(); onTogglePin(group.id); }}
        title={group.is_pinned ? "取消置顶" : "置顶"}
      >
        {group.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
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
          <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditName(group.name); setEditIcon(group.icon ?? "📁"); setEditing(true); }}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> 编辑
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

function AddGroupCard({ onAdd, onCancel }: { onAdd: (name: string, icon: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0); }, []);
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("分组名称不能为空"); return; }
    await onAdd(name.trim(), icon);
  };
  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-primary ring-1 ring-primary/20 bg-card p-2 flex items-center gap-2">
      <EmojiPicker value={icon} onChange={setIcon} />
      <Input ref={inputRef} value={name} onChange={e => setName(e.target.value)} placeholder="分组名称" className="h-8 text-sm flex-1" />
      <button type="submit" className="text-primary hover:text-primary/80 shrink-0"><Check className="h-4 w-4" /></button>
      <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-4 w-4" /></button>
    </form>
  );
}

export function GroupTree({ selected, onSelect, totalCount }: Props) {
  const { groups, createGroup, updateGroup, deleteGroup, toggleGroupPin, reorderGroups } = useGroups();
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor));

  const handleAdd = async (name: string, icon: string) => {
    if (groups.some(g => g.name === name)) { toast.error("同名分组已存在"); return; }
    try {
      await createGroup({ name, parentId: null, icon, sortOrder: groups.length });
      setAdding(false);
    } catch { toast.error("创建失败，请重试"); }
  };

  const handleRename = async (id: number, name: string, icon: string | null) => {
    const g = groups.find(g => g.id === id)!;
    await updateGroup({ id, name, icon, sortOrder: g.sort_order });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex(g => g.id === active.id);
    const newIndex = groups.findIndex(g => g.id === over.id);
    const reordered = arrayMove(groups, oldIndex, newIndex);
    reorderGroups(reordered.map((g, i) => ({ id: g.id, sort_order: i })));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">分组</span>
          <button
            onClick={() => setAdding(true)}
            className="w-6 h-6 rounded-md bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition-colors"
            title="新建分组"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
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
          <span className={cn("text-xs rounded-full px-2 py-0.5", selected === null ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            {totalCount}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-muted/40">
        <div className="p-2 flex flex-col gap-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={groups.map(g => g.id)} strategy={verticalListSortingStrategy}>
              {groups.map(group => (
                <GroupItem
                  key={group.id}
                  group={group}
                  selected={selected === group.id}
                  onSelect={() => onSelect(group.id)}
                  onRename={handleRename}
                  onDelete={deleteGroup}
                  onTogglePin={toggleGroupPin}
                />
              ))}
            </SortableContext>
          </DndContext>
          {adding && <AddGroupCard onAdd={handleAdd} onCancel={() => setAdding(false)} />}
        </div>
      </div>
    </div>
  );
}
