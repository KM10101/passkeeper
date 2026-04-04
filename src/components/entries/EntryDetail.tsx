import { useState } from "react";
import { Eye, EyeOff, Copy, Star, Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useEntries } from "../../hooks/useEntries";
import { getEntry } from "../../lib/tauri";
import { useQuery } from "@tanstack/react-query";

interface Props {
  entryId: number;
  onEdit: () => void;
  onDeleted: () => void;
}

function FieldRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [show, setShow] = useState(false);
  const copy = () => navigator.clipboard.writeText(value);
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm flex-1 break-all font-mono">
          {secret && !show ? "••••••••" : value}
        </span>
        {secret && (
          <button onClick={() => setShow(v => !v)} className="text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
        <button onClick={copy} className="text-muted-foreground hover:text-foreground">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function EntryDetail({ entryId, onEdit, onDeleted }: Props) {
  const { deleteEntry } = useEntries();
  const { data: detail, isLoading } = useQuery({
    queryKey: ["entry", entryId],
    queryFn: () => getEntry(entryId),
  });

  if (isLoading || !detail) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>;
  }

  const { entry, fields } = detail;
  const tags = entry.tags ? entry.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const domain = entry.url ? (() => { try { return new URL(entry.url).hostname; } catch { return null; } })() : null;
  const pwField = fields.find(f => f.field_name === "password");
  const customFields = fields.filter(f => f.field_name !== "password");

  const handleDelete = async () => {
    if (confirm(`Delete "${entry.title}"?`)) {
      try {
        await deleteEntry(entry.id);
        onDeleted();
      } catch (err) {
        console.error("Failed to delete entry", err);
      }
    }
  };

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {domain ? (
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=48`} alt="" className="w-8 h-8"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span className="text-xl font-bold text-muted-foreground">{entry.title.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold truncate">{entry.title}</h2>
            {entry.favorite && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />}
          </div>
          {entry.url && (
            <a href={entry.url} target="_blank" rel="noreferrer"
              className="text-sm text-primary hover:underline truncate block">{domain}</a>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="outline" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </div>
      )}
      <div className="flex flex-col">
        {entry.username && <FieldRow label="Username" value={entry.username} />}
        {pwField && <FieldRow label="Password" value={pwField.plaintext} secret />}
        {entry.url && <FieldRow label="URL" value={entry.url} />}
        {entry.notes && <FieldRow label="Notes" value={entry.notes} />}
        {customFields.map(f => <FieldRow key={f.id} label={f.field_name} value={f.plaintext} secret />)}
      </div>
    </div>
  );
}
