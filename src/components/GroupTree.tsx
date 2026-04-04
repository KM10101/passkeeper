import { useState } from "react";
import type { FormEvent } from "react";
import { FolderOpen, FolderClosed, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { GroupMenu } from "./sidebar/GroupMenu";
import { useGroups } from "../hooks/useGroups";
import { cn } from "../lib/utils";

interface Props {
  selected: number | null;
  onSelect: (id: number | null) => void;
}

export function GroupTree({ selected, onSelect }: Props) {
  const { groups, createGroup, updateGroup, deleteGroup } = useGroups();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      await createGroup({ name: newName.trim(), parentId: null, icon: null, sortOrder: groups.length });
      setNewName("");
      setAdding(false);
    }
  };

  const handleRename = async (id: number, name: string) => {
    const g = groups.find(g => g.id === id)!;
    await updateGroup({ id, name, icon: g.icon, sortOrder: g.sort_order });
  };

  return (
    <div className="flex flex-col gap-0.5 p-2">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm w-full text-left transition-colors",
          selected === null
            ? "bg-primary text-primary-foreground"
            : "hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <FolderOpen className="h-4 w-4 shrink-0" />
        All Entries
      </button>

      {groups.map(group => (
        <div key={group.id} className="group flex items-center gap-1">
          <button
            onClick={() => onSelect(group.id)}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm flex-1 text-left transition-colors",
              selected === group.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <FolderClosed className="h-4 w-4 shrink-0" />
            <span className="truncate">{group.name}</span>
          </button>
          <GroupMenu group={group} onRename={handleRename} onDelete={deleteGroup} />
        </div>
      ))}

      {adding ? (
        <form onSubmit={handleAdd} className="flex gap-1 px-1 mt-1">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Group name"
            className="h-7 text-xs"
            autoFocus
            onBlur={() => setAdding(false)}
          />
          <button type="submit" className="hidden" />
        </form>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start text-muted-foreground text-xs"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3 w-3 mr-1" /> New Group
        </Button>
      )}
    </div>
  );
}
