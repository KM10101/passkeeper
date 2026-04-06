import { useState, useEffect } from "react";
import { GripVertical, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "../ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import type { Entry } from "../../lib/tauri";

interface Props {
  entry: Entry;
  selected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
}

export function EntryCard({ entry, selected, onClick, onEdit, onPin, onDelete }: Props) {
  const tags = entry.tags ? entry.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const domain = entry.url ? (() => { try { return new URL(entry.url).hostname; } catch { return null; } })() : null;

  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [entry.id]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "w-full text-left rounded-lg border border-border bg-card shadow-sm transition-all flex items-stretch group",
        selected
          ? "border-primary ring-1 ring-primary/20 shadow-md"
          : "hover:border-border/80 hover:shadow-md",
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex items-center px-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0"
        onClick={e => e.stopPropagation()}
        tabIndex={-1}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Card body — clickable */}
      <button
        onClick={onClick}
        className="flex items-start gap-3 px-2 py-2.5 flex-1 min-w-0 text-left"
      >
        {/* Favicon */}
        <div className="shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center overflow-hidden mt-0.5">
          {domain && !imgError ? (
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
              alt=""
              className="w-6 h-6"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">
              {entry.title.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium truncate">{entry.title}</span>
            {entry.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
          </div>
          {entry.username && (
            <p className="text-xs text-muted-foreground truncate">{entry.username}</p>
          )}
          {!entry.username && domain && (
            <p className="text-xs text-muted-foreground truncate">{domain}</p>
          )}
          {tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1 py-0">{tag}</Badge>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* ⋯ menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center px-2 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> 编辑
          </DropdownMenuItem>
          <DropdownMenuItem onClick={e => { e.stopPropagation(); onPin(); }}>
            {entry.pinned
              ? <><PinOff className="h-3.5 w-3.5 mr-2" /> 取消置顶</>
              : <><Pin className="h-3.5 w-3.5 mr-2" /> 置顶</>
            }
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" /> 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
