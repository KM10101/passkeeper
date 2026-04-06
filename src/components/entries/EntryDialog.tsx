import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import { useGroups } from "../../hooks/useGroups";
import { useEntries } from "../../hooks/useEntries";
import type { EntryDetail } from "../../lib/tauri";
import { FieldTypeCombobox } from "../ui/field-type-combobox";
import { RICH_TYPES } from "./FieldRenderer";
import { cn } from "../../lib/utils";

// ── Types ────────────────────────────────────────────────
interface FieldRow {
  id: number;         // local key only
  field_name: string;
  field_type: string;
  field_value: string;
  sort_order: number;
  error?: string;
}

// ── Constants ────────────────────────────────────────────
const ENCRYPTED_TYPES = new Set(["password", "secret", "token"]);

const QUICK_ADD: Array<{ label: string; field_name: string; field_type: string }> = [
  { label: "用户名", field_name: "username", field_type: "text" },
  { label: "密码",   field_name: "password", field_type: "password" },
  { label: "URL",    field_name: "url",      field_type: "url" },
  { label: "Token",  field_name: "token",    field_type: "token" },
  { label: "邮箱",   field_name: "email",    field_type: "email" },
  { label: "📝 笔记", field_name: "notes",   field_type: "markdown" },
  { label: "💻 代码", field_name: "code",    field_type: "code" },
  { label: "{} JSON", field_name: "data",   field_type: "json" },
];

const TEMPLATES: Array<{ label: string; fields: Array<{ field_name: string; field_type: string }> }> = [
  { label: "账号密码", fields: [
    { field_name: "username", field_type: "text" },
    { field_name: "password", field_type: "password" },
    { field_name: "url",      field_type: "url" },
  ]},
  { label: "API/Token", fields: [
    { field_name: "api_key",  field_type: "token" },
    { field_name: "endpoint", field_type: "url" },
  ]},
  { label: "银行卡", fields: [
    { field_name: "card_number", field_type: "secret" },
    { field_name: "cvv",         field_type: "secret" },
    { field_name: "expiry",      field_type: "date" },
  ]},
  { label: "笔记", fields: [
    { field_name: "content", field_type: "markdown" },
  ]},
];

// ── Validation ────────────────────────────────────────────
function validateField(field_type: string, value: string): string | undefined {
  if (!value) return undefined;
  switch (field_type) {
    case "url":
      if (!/^https?:\/\/.+/.test(value)) return "URL 必须以 http:// 或 https:// 开头";
      break;
    case "email":
      if (!value.includes("@") || !value.split("@")[1]?.includes("."))
        return "请输入有效的邮箱地址";
      break;
    case "number":
      if (!/^\d*\.?\d*$/.test(value)) return "请输入有效的数字";
      break;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "日期格式应为 YYYY-MM-DD";
      break;
  }
  return undefined;
}

// ── Component ─────────────────────────────────────────────
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
  const [tagsInput, setTagsInput] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(true);

  // Reset form when dialog opens/changes
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setTitle(existing.entry.title);
      setTagsInput(existing.entry.tags);
      setGroupId(existing.entry.group_id);
      setFavorite(existing.entry.favorite);
      setFields(existing.fields.map((f, i) => ({
        id: i,
        field_name: f.field_name,
        field_type: f.field_type,
        field_value: f.plaintext,
        sort_order: f.sort_order,
      })));
    } else {
      setTitle("");
      setTagsInput("");
      setGroupId(defaultGroupId ?? null);
      setFavorite(false);
      setFields([]);
    }
    setError(null);
  }, [open, existing, defaultGroupId]);

  const addField = (field_name: string, field_type: string) => {
    setFields(prev => [...prev, {
      id: Date.now() + Math.random(),
      field_name,
      field_type,
      field_value: "",
      sort_order: prev.length,
    }]);
  };

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    const newFields = tpl.fields.map((f, i) => ({
      id: Date.now() + Math.random() + i,
      field_name: f.field_name,
      field_type: f.field_type,
      field_value: "",
      sort_order: fields.length + i,
    }));
    setFields(prev => [...prev, ...newFields]);
  };

  const updateFieldValue = (id: number, value: string) => {
    setFields(prev => prev.map(f => {
      if (f.id !== id) return f;
      return { ...f, field_value: value, error: validateField(f.field_type, value) };
    }));
  };

  const updateFieldName = (id: number, name: string) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, field_name: name } : f));
  };

  const updateFieldType = (id: number, type: string) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, field_type: type, error: undefined } : f));
  };

  const removeField = (id: number) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const hasValidationErrors = fields.some(f => !!f.error);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("标题不能为空"); return; }
    if (hasValidationErrors) { setError("请修正字段格式错误"); return; }

    // Run validation pass on all fields before submit
    const validated = fields.map(f => ({
      ...f,
      error: validateField(f.field_type, f.field_value),
    }));
    if (validated.some(f => !!f.error)) {
      setFields(validated);
      setError("请修正字段格式错误");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const newFields = fields.map((f, i) => ({
        field_name: f.field_name,
        field_type: f.field_type,
        field_value: f.field_value,
        sort_order: i,
      }));
      const args = {
        groupId, title: title.trim(), url: null, siteTitle: null, username: null,
        templateType: "custom", tags: tagsInput.trim(), notes: null, favorite, fields: newFields,
      };
      if (existing) {
        await updateEntry({ id: existing.entry.id, ...args });
      } else {
        await createEntry(args);
      }
      toast.success(existing ? "条目已更新" : "条目已创建");
      onClose();
    } catch (err) {
      const msg = String(err);
      if (msg.includes("DuplicateTitle") || msg.includes("同分组")) {
        setError("同分组下已存在同名条目");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" style={{ resize: 'both', overflow: 'auto', minWidth: '520px', minHeight: '400px', maxWidth: '90vw', maxHeight: '90vh' }}>
        <DialogHeader>
          <DialogTitle>{existing ? "编辑条目" : "新建条目"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">标题 <span className="text-destructive">*</span></Label>
            <Input
              id="title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：GitHub"
              autoFocus
            />
          </div>

          {/* Fields list */}
          <div className="flex flex-col gap-1.5">
            <Label>字段</Label>
            {fields.length === 0 ? (
              <div className="border border-dashed border-border rounded-md p-4 text-center text-sm text-muted-foreground">
                暂无字段，使用下方按钮快速添加
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {fields.map((field) => (
                  <div key={field.id} className="flex flex-col gap-0.5">
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="字段名"
                        value={field.field_name}
                        onChange={e => updateFieldName(field.id, e.target.value)}
                        className="w-[110px] shrink-0 text-sm h-8"
                      />
                      <FieldTypeCombobox
                        value={field.field_type}
                        onChange={v => updateFieldType(field.id, v)}
                      />
                      <FieldValueInput
                        field={field}
                        onChange={v => updateFieldValue(field.id, v)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8"
                        onClick={() => removeField(field.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                    {field.error && (
                      <p className="text-xs text-destructive ml-1">{field.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick add */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">快捷添加</span>
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_ADD.map(qa => (
                <button
                  key={qa.label}
                  type="button"
                  onClick={() => addField(qa.field_name, qa.field_type)}
                  className="text-xs border border-border rounded-md px-2 py-1 hover:bg-accent transition-colors"
                >
                  {qa.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => addField("", "text")}
                className="text-xs border border-dashed border-border rounded-md px-2 py-1 hover:bg-accent transition-colors"
              >
                <Plus className="h-3 w-3 inline mr-0.5" />自定义
              </button>
            </div>
          </div>

          {/* Templates */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">模版（追加字段）</span>
            <div className="flex gap-1.5 flex-wrap">
              {TEMPLATES.map(tpl => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="text-xs bg-muted rounded-md px-2 py-1 hover:bg-accent transition-colors"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Meta (tags, group, favorite) — collapsible */}
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground text-left"
              onClick={() => setShowMeta(v => !v)}
            >
              {showMeta ? "▾" : "▸"} 标签 / 分组 / 收藏
            </button>
            {showMeta && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tags" className="text-xs">标签（逗号分隔）</Label>
                  <Input
                    id="tags"
                    value={tagsInput}
                    onChange={e => setTagsInput(e.target.value)}
                    placeholder="work, personal"
                    className="h-8 text-sm"
                  />
                  {tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="group" className="text-xs">分组</Label>
                  <select
                    id="group"
                    value={groupId ?? ""}
                    onChange={e => setGroupId(e.target.value ? Number(e.target.value) : null)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">无分组</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="favorite" checked={favorite} onCheckedChange={setFavorite} />
                  <Label htmlFor="favorite" className="text-sm">收藏</Label>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={saving || hasValidationErrors}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-component: field value input with show/hide for secrets ──
function FieldValueInput({ field, onChange }: { field: FieldRow; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const isSecret = ENCRYPTED_TYPES.has(field.field_type);
  const isRich = RICH_TYPES.has(field.field_type);

  if (isRich) {
    return (
      <Textarea
        placeholder={`输入 ${field.field_type} 内容…`}
        value={field.field_value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'resize-y min-h-[80px] max-h-[200px] text-sm flex-1',
          field.field_type !== 'markdown' && 'font-mono',
          field.error ? 'border-destructive' : '',
        )}
      />
    );
  }

  return (
    <div className="relative flex-1">
      <Input
        type={isSecret && !show ? "password" : "text"}
        placeholder="值"
        value={field.field_value}
        onChange={e => onChange(e.target.value)}
        className={`h-8 text-sm pr-8 ${field.error ? "border-destructive" : ""}`}
      />
      {isSecret && (
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
