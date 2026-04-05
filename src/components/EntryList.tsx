import { useState } from "react";
import { Search, Plus, Pin } from "lucide-react";
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { EntryCard } from "./entries/EntryCard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "./ui/alert-dialog";
import { useEntries } from "../hooks/useEntries";
import { toast } from "sonner";
import type { Entry } from "../lib/tauri";

interface Props {
  groupId: number | null;
  selectedEntryId: number | null;
  onSelect: (id: number) => void;
  onNewEntry: () => void;
  onEditEntry: (id: number) => void;
}

export function EntryList({ groupId, selectedEntryId, onSelect, onNewEntry, onEditEntry }: Props) {
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const { entries, deleteEntry, pinEntry, reorderEntries } = useEntries(groupId ?? undefined, search || undefined);

  const pinned = entries.filter(e => e.pinned);
  const normal = entries.filter(e => !e.pinned);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent, isPinned: boolean) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const section = isPinned ? pinned : normal;
    const oldIndex = section.findIndex(e => e.id === active.id);
    const newIndex = section.findIndex(e => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...section];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    try {
      await reorderEntries({ ids: reordered.map(e => e.id), pinned: isPinned });
    } catch {
      toast.error("排序保存失败");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEntry(deleteTarget.id);
      toast.success(`"${deleteTarget.title}" 已删除`);
      setDeleteTarget(null);
    } catch {
      toast.error("删除失败");
    }
  };

  const handlePin = async (entry: Entry) => {
    try {
      await pinEntry({ id: entry.id, pinned: !entry.pinned });
      toast.success(entry.pinned ? "已取消置顶" : "已置顶");
    } catch {
      toast.error("操作失败");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sticky search + new button */}
      <div className="sticky top-0 z-10 bg-background p-2 border-b border-border flex gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索..."
            className="pl-7 h-8 text-sm"
          />
        </div>
        <Button size="sm" className="h-8 px-2" onClick={onNewEntry}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Entry list */}
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
          <>
            {/* Pinned section */}
            {pinned.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30">
                  <Pin className="h-3 w-3" /> 置顶
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter}
                  onDragEnd={e => handleDragEnd(e, true)}>
                  <SortableContext items={pinned.map(e => e.id)} strategy={verticalListSortingStrategy}>
                    {pinned.map(entry => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        selected={entry.id === selectedEntryId}
                        onClick={() => onSelect(entry.id)}
                        onEdit={() => onEditEntry(entry.id)}
                        onPin={() => handlePin(entry)}
                        onDelete={() => setDeleteTarget(entry)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </>
            )}

            {/* Normal section */}
            {normal.length > 0 && (
              <>
                {pinned.length > 0 && (
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30">
                    其他
                  </div>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter}
                  onDragEnd={e => handleDragEnd(e, false)}>
                  <SortableContext items={normal.map(e => e.id)} strategy={verticalListSortingStrategy}>
                    {normal.map(entry => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        selected={entry.id === selectedEntryId}
                        onClick={() => onSelect(entry.id)}
                        onEdit={() => onEditEntry(entry.id)}
                        onPin={() => handlePin(entry)}
                        onDelete={() => setDeleteTarget(entry)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 "{deleteTarget?.title}"？</AlertDialogTitle>
            <AlertDialogDescription>此操作无法撤销，该条目的所有数据将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
