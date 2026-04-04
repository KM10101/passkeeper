import { useState } from "react";
import type { FormEvent } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import type { Group } from "../../lib/tauri";

interface GroupMenuProps {
  group: Group;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function GroupMenu({ group, onRename, onDelete }: GroupMenuProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);

  const handleRename = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== group.name) {
      await onRename(group.id, name.trim());
    }
    setRenaming(false);
  };

  if (renaming) {
    return (
      <form onSubmit={handleRename} className="flex gap-1 px-1">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          className="h-6 text-xs"
          autoFocus
          onBlur={() => setRenaming(false)}
        />
      </form>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
          <MoreHorizontal className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => { setName(group.name); setRenaming(true); }}>
          <Pencil className="mr-2 h-3 w-3" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => onDelete(group.id)}
        >
          <Trash2 className="mr-2 h-3 w-3" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
