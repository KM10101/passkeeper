// src/components/entries/EntryForm.tsx
import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import React from "react";
import { Eye, EyeOff, Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useGroups } from "../../hooks/useGroups";
import { useEntries } from "../../hooks/useEntries";
import { useTemplates } from "../../hooks/useTemplates";
import type { EntryDetail } from "../../lib/tauri";
import { FieldTypeCombobox } from "../ui/field-type-combobox";
import { RICH_TYPES } from "./FieldRenderer";
import { cn } from "../../lib/utils";

interface FieldRow {
  id: number;
  field_name: string;
  field_type: string;
  field_value: string;
  sort_order: number;
  error?: string;
}

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

let _nextFieldId = 1;
const nextFieldId = () => _nextFieldId++;

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

function FieldValueInput({ field, onChange }: { field: FieldRow; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const isSecret = ENCRYPTED_TYPES.has(field.field_type);
  const isRich = RICH_TYPES.has(field.field_type);
  const isMultiline = isRich || field.field_type === 'text' || field.field_type === 'secret';

  if (isMultiline) {
    return (
      <div className="relative flex-1">
        <Textarea
          placeholder={isRich ? `输入 ${field.field_type} 内容…` : '值'}
          value={field.field_value}
          onChange={e => onChange(e.target.value)}
          className={cn(
            'resize-y min-h-[60px] max-h-[200px] text-sm',
            isRich && field.field_type !== 'markdown' ? 'font-mono' : '',
            isSecret ? 'pr-8' : '',
            field.error ? 'border-destructive' : '',
          )}
          style={isSecret && !show ? { WebkitTextSecurity: 'disc' } as React.CSSProperties : undefined}
        />
        {isSecret && (
          <button type="button" onClick={() => setShow(v => !v)}
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="relative flex-1">
      <Input
        type={isSecret && !show ? 'password' : 'text'}
        placeholder="值"
        value={field.field_value}
        onChange={e => onChange(e.target.value)}
        className={`h-8 text-sm pr-8 ${field.error ? 'border-destructive' : ''}`}
      />
      {isSecret && (
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

function SortableFieldRow({ field, onChangeName, onChangeType, onChangeValue, onRemove }: {
  field: FieldRow;
  onChangeName: (id: number, v: string) => void;
  onChangeType: (id: number, v: string) => void;
  onChangeValue: (id: number, v: string) => void;
  onRemove: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }} className="flex flex-col gap-0.5">
      <div className="flex gap-2 items-center">
        <button type="button" className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
        <Input placeholder="字段名" value={field.field_name}
          onChange={e => onChangeName(field.id, e.target.value)}
          className="w-[110px] shrink-0 text-sm h-8" />
        <FieldTypeCombobox value={field.field_type} onChange={v => onChangeType(field.id, v)} />
        <FieldValueInput field={field} onChange={v => onChangeValue(field.id, v)} />
        <Button type="button" variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => onRemove(field.id)}>
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
      {field.error && <p className="text-xs text-destructive ml-1">{field.error}</p>}
    </div>
  );
}

interface EntryFormProps {
  existing?: EntryDetail;
  defaultGroupId?: number | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function EntryForm({ existing, defaultGroupId, onSuccess, onCancel }: EntryFormProps) {
  const { groups } = useGroups();
  const { createEntry, updateEntry } = useEntries();
  const { templates } = useTemplates();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(true);

  useEffect(() => {
    if (existing) {
      setTitle(existing.entry.title);
      setTagsInput(existing.entry.tags);
      setGroupId(existing.entry.group_id);
      setFavorite(existing.entry.favorite);
      setFields(existing.fields.map(f => ({
        id: nextFieldId(), field_name: f.field_name, field_type: f.field_type,
        field_value: f.plaintext, sort_order: f.sort_order,
      })));
    } else {
      setTitle(""); setTagsInput(""); setGroupId(defaultGroupId ?? null);
      setFavorite(false); setFields([]);
    }
    setError(null);
  }, [existing, defaultGroupId]);

  const addField = (name: string, type: string) =>
    setFields(prev => [...prev, { id: nextFieldId(), field_name: name, field_type: type, field_value: "", sort_order: prev.length }]);

  const applyTemplate = (fields_def: Array<{ name: string; field_type: string }>) => {
    setFields(prev => [...prev, ...fields_def.map((f, i) => ({
      id: nextFieldId(),
      field_name: f.name, field_type: f.field_type, field_value: "", sort_order: prev.length + i,
    }))]);
  };

  const updateFieldValue = (id: number, value: string) =>
    setFields(prev => prev.map(f => f.id !== id ? f : { ...f, field_value: value, error: validateField(f.field_type, value) }));
  const updateFieldName = (id: number, name: string) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, field_name: name } : f));
  const updateFieldType = (id: number, type: string) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, field_type: type, error: undefined } : f));
  const removeField = (id: number) =>
    setFields(prev => prev.filter(f => f.id !== id));

  const handleFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFields(prev => {
      const o = prev.findIndex(f => f.id === active.id);
      const n = prev.findIndex(f => f.id === over.id);
      return arrayMove(prev, o, n);
    });
  };

  const hasValidationErrors = fields.some(f => !!f.error);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("标题不能为空"); return; }
    const validated = fields.map(f => ({ ...f, error: validateField(f.field_type, f.field_value) }));
    if (validated.some(f => !!f.error)) { setFields(validated); setError("请修正字段格式错误"); return; }
    setSaving(true); setError(null);
    try {
      const newFields = fields.map((f, i) => ({
        field_name: f.field_name, field_type: f.field_type, field_value: f.field_value, sort_order: i,
      }));
      const args = { groupId, title: title.trim(), url: null, siteTitle: null, username: null,
        templateType: "custom", tags: tagsInput.trim(), notes: null, favorite, fields: newFields };
      if (existing) { await updateEntry({ id: existing.entry.id, ...args }); }
      else { await createEntry(args); }
      toast.success(existing ? "条目已更新" : "条目已创建");
      onSuccess();
    } catch (err) {
      const msg = String(err);
      setError(msg.includes("DuplicateTitle") || msg.includes("同分组") ? "同分组下已存在同名条目" : msg);
    } finally { setSaving(false); }
  };

  const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">标题 <span className="text-destructive">*</span></Label>
        <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：GitHub" autoFocus />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>字段</Label>
        {fields.length === 0 ? (
          <div className="border border-dashed border-border rounded-md p-4 text-center text-sm text-muted-foreground">
            暂无字段，使用下方按钮快速添加
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd}>
            <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {fields.map(field => (
                  <SortableFieldRow key={field.id} field={field}
                    onChangeName={updateFieldName} onChangeType={updateFieldType}
                    onChangeValue={updateFieldValue} onRemove={removeField} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">快捷添加</span>
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_ADD.map(qa => (
            <button key={qa.label} type="button" onClick={() => addField(qa.field_name, qa.field_type)}
              className="text-xs border border-border rounded-md px-2 py-1 hover:bg-accent transition-colors">
              {qa.label}
            </button>
          ))}
          <button type="button" onClick={() => addField("", "text")}
            className="text-xs border border-dashed border-border rounded-md px-2 py-1 hover:bg-accent transition-colors">
            <Plus className="h-3 w-3 inline mr-0.5" />自定义
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">模版（追加字段）</span>
        <div className="flex gap-1.5 flex-wrap">
          {templates.map(tpl => {
            let tplFields: Array<{ name: string; field_type: string }> = [];
            try { tplFields = JSON.parse(tpl.fields); } catch { /* ignore */ }
            return (
              <button key={tpl.id} type="button" onClick={() => applyTemplate(tplFields)}
                className="text-xs bg-muted rounded-md px-2 py-1 hover:bg-accent transition-colors">
                {tpl.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground text-left"
          onClick={() => setShowMeta(v => !v)}>
          {showMeta ? "▾" : "▸"} 标签 / 分组 / 收藏
        </button>
        {showMeta && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tags" className="text-xs">标签（逗号分隔）</Label>
              <Input id="tags" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
                placeholder="work, personal" className="h-8 text-sm" />
              {tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="group" className="text-xs">分组</Label>
              <select id="group" value={groupId ?? ""}
                onChange={e => setGroupId(e.target.value ? Number(e.target.value) : null)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button type="submit" disabled={saving || hasValidationErrors}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </form>
  );
}
