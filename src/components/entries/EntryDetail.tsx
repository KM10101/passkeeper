import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Copy, Star, Pencil, Trash2, ExternalLink, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "../ui/alert-dialog";
import { useEntries } from "../../hooks/useEntries";
import { getEntry, openUrl } from "../../lib/tauri";
import type { DecryptedField, NewEntryField } from "../../lib/tauri";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const ENCRYPTED_TYPES = new Set(["password", "secret", "token"]);

function FieldRow({
  field,
  onSave,
  onDelete,
  canDelete,
}: {
  field: DecryptedField;
  onSave: (id: number, newValue: string) => Promise<void>;
  onDelete: (id: number) => void;
  canDelete: boolean;
}) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(field.plaintext);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEncrypted = ENCRYPTED_TYPES.has(field.field_type);
  const isUrl = field.field_type === "url";

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const copy = () => {
    navigator.clipboard.writeText(field.plaintext);
    toast.success(`${field.field_name} 已复制`);
  };

  const commitEdit = async () => {
    if (saving || editValue === field.plaintext) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(field.id, editValue);
      setEditing(false);
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditValue(field.plaintext);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground capitalize">{field.field_name}</span>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Input
              ref={inputRef}
              type={isEncrypted ? "password" : "text"}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") cancelEdit();
              }}
              onBlur={commitEdit}
              className="h-7 text-sm flex-1"
              disabled={saving}
            />
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </>
        ) : (
          <>
            <span
              className="text-sm flex-1 break-all font-mono cursor-text hover:bg-accent/50 rounded px-1 -mx-1 transition-colors"
              onClick={() => { setEditing(true); setEditValue(field.plaintext); }}
              title="点击编辑"
            >
              {isEncrypted && !show ? "••••••••" : field.plaintext}
            </span>
            {isEncrypted && (
              <button onClick={() => setShow(v => !v)} className="text-muted-foreground hover:text-foreground shrink-0">
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            )}
            {isUrl && field.plaintext && (
              <button onClick={() => openUrl(field.plaintext)} className="text-muted-foreground hover:text-foreground shrink-0">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={copy} className="text-muted-foreground hover:text-foreground shrink-0">
              <Copy className="h-3.5 w-3.5" />
            </button>
            {canDelete && (
              <button onClick={() => onDelete(field.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface Props {
  entryId: number;
  onEdit: () => void;
  onDeleted: () => void;
}

export function EntryDetail({ entryId, onEdit, onDeleted }: Props) {
  const { deleteEntry, updateEntry } = useEntries();
  const qc = useQueryClient();
  const { data: detail, isLoading } = useQuery({
    queryKey: ["entry", entryId],
    queryFn: () => getEntry(entryId),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [localFields, setLocalFields] = useState<DecryptedField[]>([]);
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldValue, setNewFieldValue] = useState("");

  useEffect(() => {
    if (detail) setLocalFields(detail.fields);
  }, [detail]);

  if (isLoading || !detail) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>;
  }

  const { entry } = detail;
  const tags = entry.tags ? entry.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const domain = entry.url ? (() => { try { return new URL(entry.url).hostname; } catch { return null; } })() : null;
  const pwField = localFields.find(f => f.field_name === "password");
  const customFields = localFields.filter(f => f.field_name !== "password");

  const buildNewEntryFields = (fields: DecryptedField[]): NewEntryField[] =>
    fields.map(f => ({
      field_name: f.field_name,
      field_type: f.field_type,
      field_value: f.plaintext,
      sort_order: f.sort_order,
    }));

  const persistFields = async (fields: DecryptedField[]) => {
    await updateEntry({
      id: entry.id, groupId: entry.group_id, title: entry.title,
      url: entry.url, siteTitle: entry.site_title, username: entry.username,
      templateType: entry.template_type, tags: entry.tags,
      notes: entry.notes ?? null, favorite: entry.favorite,
      fields: buildNewEntryFields(fields),
    });
    qc.invalidateQueries({ queryKey: ["entry", entryId] });
  };

  const handleFieldSave = async (fieldId: number, newValue: string) => {
    const original = localFields;
    const updated = localFields.map(f =>
      f.id === fieldId ? { ...f, plaintext: newValue } : f
    );
    setLocalFields(updated);
    try {
      await persistFields(updated);
      toast.success("字段已更新");
    } catch (err) {
      setLocalFields(original);
      throw err;
    }
  };

  const handleFieldDelete = async (fieldId: number) => {
    const original = localFields;
    const updated = localFields.filter(f => f.id !== fieldId);
    setLocalFields(updated);
    try {
      await persistFields(updated);
      toast.success("字段已删除");
    } catch {
      setLocalFields(original);
      toast.error("删除失败");
    }
  };

  const handleAddField = async () => {
    if (!newFieldName.trim()) return;
    const newField: DecryptedField = {
      id: Date.now(),
      field_name: newFieldName.trim(),
      field_type: newFieldType,
      plaintext: newFieldValue,
      sort_order: localFields.length,
    };
    const updated = [...localFields, newField];
    setLocalFields(updated);
    await persistFields(updated);
    setNewFieldName(""); setNewFieldType("text"); setNewFieldValue(""); setAddingField(false);
    toast.success("字段已添加");
  };

  const handleDelete = async () => {
    await deleteEntry(entry.id);
    toast.success(`"${entry.title}" 已删除`);
    onDeleted();
  };

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Header */}
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
            <button
              onClick={() => openUrl(entry.url!)}
              className="text-sm text-primary hover:underline truncate block text-left"
            >
              {domain}
            </button>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="outline" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </div>
      )}

      {/* Fields */}
      <div className="flex flex-col">
        {entry.username && (
          <div className="flex flex-col gap-0.5 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground">Username</span>
            <div className="flex items-center gap-2">
              <span className="text-sm flex-1 break-all font-mono">{entry.username}</span>
              <button onClick={() => { navigator.clipboard.writeText(entry.username!); toast.success("Username 已复制"); }}
                className="text-muted-foreground hover:text-foreground">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        {pwField && (
          <FieldRow field={pwField} onSave={handleFieldSave} onDelete={handleFieldDelete} canDelete={false} />
        )}
        {entry.url && (
          <div className="flex flex-col gap-0.5 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground">URL</span>
            <div className="flex items-center gap-2">
              <span className="text-sm flex-1 break-all font-mono">{entry.url}</span>
              <button onClick={() => openUrl(entry.url!)} className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { navigator.clipboard.writeText(entry.url!); toast.success("URL 已复制"); }}
                className="text-muted-foreground hover:text-foreground">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        {entry.notes && (
          <div className="flex flex-col gap-0.5 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground">Notes</span>
            <span className="text-sm whitespace-pre-wrap">{entry.notes}</span>
          </div>
        )}
        {customFields.map(f => (
          <FieldRow key={f.id} field={f} onSave={handleFieldSave} onDelete={handleFieldDelete} canDelete />
        ))}
      </div>

      {/* Add field */}
      {addingField ? (
        <div className="flex gap-2 items-center mt-2">
          <Input placeholder="Field name" value={newFieldName} onChange={e => setNewFieldName(e.target.value)}
            className="w-1/4 h-8 text-sm" onKeyDown={e => { if (e.key === "Escape") setAddingField(false); }} />
          <select
            value={newFieldType}
            onChange={e => setNewFieldType(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none w-[100px] shrink-0"
          >
            {["text","secret","token","password","url","email","number","date"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <Input placeholder="Value" value={newFieldValue} onChange={e => setNewFieldValue(e.target.value)}
            className="flex-1 h-8 text-sm"
            type={["password","secret","token"].includes(newFieldType) ? "password" : "text"} />
          <button onClick={handleAddField} className="text-primary hover:text-primary/80">
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => setAddingField(false)} className="text-muted-foreground hover:text-foreground">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingField(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-1 w-fit"
        >
          <Plus className="h-3.5 w-3.5" /> Add field
        </button>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 "{entry.title}"？</AlertDialogTitle>
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
