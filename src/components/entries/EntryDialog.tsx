import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { useGroups } from "../../hooks/useGroups";
import { useEntries } from "../../hooks/useEntries";
import type { EntryDetail } from "../../lib/tauri";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "secret", label: "Secret" },
  { value: "token", label: "Token" },
  { value: "password", label: "Password" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

interface CustomField {
  id: number;
  field_name: string;
  field_type: string;
  field_value: string;
  sort_order: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  existing?: EntryDetail;
  defaultGroupId?: number | null;
}

export function EntryDialog({ open, onClose, existing, defaultGroupId }: Props) {
  const { groups } = useGroups();
  const { createEntry, updateEntry } = useEntries();
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setTitle(existing.entry.title);
      setUsername(existing.entry.username ?? "");
      setUrl(existing.entry.url ?? "");
      setNotes(existing.entry.notes ?? "");
      setTagsInput(existing.entry.tags);
      setGroupId(existing.entry.group_id);
      setFavorite(existing.entry.favorite);
      const pwField = existing.fields.find(f => f.field_name === "password");
      setPassword(pwField?.plaintext ?? "");
      setCustomFields(
        existing.fields
          .filter(f => f.field_name !== "password")
          .map((f, i) => ({
            id: i,
            field_name: f.field_name,
            field_type: f.field_type,
            field_value: f.plaintext,
            sort_order: f.sort_order,
          })),
      );
    } else {
      setTitle(""); setUsername(""); setPassword(""); setUrl("");
      setNotes(""); setTagsInput(""); setGroupId(defaultGroupId ?? null);
      setFavorite(false);
      setCustomFields([
        { id: 0, field_name: "token", field_type: "token", field_value: "", sort_order: 1 },
      ]);
    }
    setError(null);
    setShowPassword(false);
  }, [existing, defaultGroupId, open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true); setError(null);
    try {
      const fields = [
        { field_name: "password", field_type: "password", field_value: password, sort_order: 0 },
        ...customFields.map((f, i) => ({
          field_name: f.field_name,
          field_type: f.field_type,
          field_value: f.field_value,
          sort_order: i + 1,
        })),
      ];
      const args = {
        groupId, title: title.trim(), url: url.trim() || null, siteTitle: null,
        username: username.trim() || null, templateType: "login",
        tags: tagsInput.trim(), notes: notes.trim() || null, favorite, fields,
      };
      if (existing) {
        await updateEntry({ id: existing.entry.id, ...args });
      } else {
        await createEntry(args);
      }
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Entry" : "New Entry"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. GitHub" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="url">URL</Label>
            <Input id="url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="work, personal" />
            {tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group">Group</Label>
            <select
              id="group"
              value={groupId ?? ""}
              onChange={e => setGroupId(e.target.value ? Number(e.target.value) : null)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="favorite" checked={favorite} onCheckedChange={setFavorite} />
            <Label htmlFor="favorite">Favorite</Label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Custom Fields</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() =>
                setCustomFields(prev => [...prev, {
                  id: Date.now() + Math.random(),
                  field_name: "", field_type: "text", field_value: "", sort_order: prev.length + 1,
                }])
              }>
                <Plus className="h-3 w-3 mr-1" /> Add Field
              </Button>
            </div>
            {customFields.map((field, i) => (
              <div key={field.id} className="flex gap-2 items-center">
                <Input
                  placeholder="Name"
                  value={field.field_name}
                  onChange={e => setCustomFields(prev => prev.map((f, idx) => idx === i ? { ...f, field_name: e.target.value } : f))}
                  className="w-1/4"
                />
                <select
                  value={field.field_type}
                  onChange={e => setCustomFields(prev => prev.map((f, idx) => idx === i ? { ...f, field_type: e.target.value } : f))}
                  className="flex h-10 rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-[110px] shrink-0"
                >
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <Input
                  type={["password", "secret", "token"].includes(field.field_type) ? "password" : "text"}
                  placeholder="Value"
                  value={field.field_value}
                  onChange={e => setCustomFields(prev => prev.map((f, idx) => idx === i ? { ...f, field_value: e.target.value } : f))}
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon"
                  onClick={() => setCustomFields(prev => prev.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
