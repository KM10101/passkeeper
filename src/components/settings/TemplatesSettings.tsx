// src/components/settings/TemplatesSettings.tsx
import { useState } from "react";
import { Plus, Pencil, Trash2, RotateCcw, GripVertical } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTemplates } from "../../hooks/useTemplates";
import { FieldTypeCombobox } from "../ui/field-type-combobox";
import type { Template } from "../../lib/tauri";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

interface TemplateFieldRow {
  id: number;
  name: string;
  field_type: string;
}

let _nextTplFieldId = 1;
const nextTplFieldId = () => _nextTplFieldId++;

function SortableTplField({
  field,
  onChangeName,
  onChangeType,
  onRemove,
}: {
  field: TemplateFieldRow;
  onChangeName: (id: number, v: string) => void;
  onChangeType: (id: number, v: string) => void;
  onRemove: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex gap-2 items-center">
      <button type="button" className="cursor-grab text-muted-foreground shrink-0" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <Input placeholder="字段名" value={field.name}
        onChange={e => onChangeName(field.id, e.target.value)}
        className="text-sm h-8 flex-1" />
      <FieldTypeCombobox value={field.field_type} onChange={v => onChangeType(field.id, v)} />
      <button type="button" onClick={() => onRemove(field.id)}
        className="text-muted-foreground hover:text-destructive shrink-0">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function TemplateEditor({
  template,
  onSave,
  onCancel,
}: {
  template: Template | null;
  onSave: (name: string, fieldsJson: string) => Promise<void>;
  onCancel: () => void;
}) {
  const parseFields = (json: string): TemplateFieldRow[] => {
    try {
      return (JSON.parse(json) as Array<{ name: string; field_type: string }>)
        .map(f => ({ id: nextTplFieldId(), name: f.name, field_type: f.field_type }));
    } catch { return []; }
  };

  const [name, setName] = useState(template?.name ?? "");
  const [fields, setFields] = useState<TemplateFieldRow[]>(
    template ? parseFields(template.fields) : []
  );
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const o = fields.findIndex(f => f.id === active.id);
    const n = fields.findIndex(f => f.id === over.id);
    setFields(arrayMove(fields, o, n));
  };

  const addField = () =>
    setFields(prev => [...prev, { id: nextTplFieldId(), name: "", field_type: "text" }]);

  const updateField = (id: number, key: 'name' | 'field_type', value: string) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));

  const removeField = (id: number) =>
    setFields(prev => prev.filter(f => f.id !== id));

  const handleSave = async () => {
    if (!name.trim()) { toast.error("模版名称不能为空"); return; }
    const fieldsJson = JSON.stringify(fields.map(f => ({ name: f.name, field_type: f.field_type })));
    setSaving(true);
    try { await onSave(name.trim(), fieldsJson); }
    catch (e) { toast.error(`保存失败: ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="border border-border rounded-lg p-4 flex flex-col gap-3 mt-2">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">模版名称</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="模版名称" className="h-8 text-sm" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">字段</Label>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {fields.map(field => (
                <SortableTplField key={field.id} field={field}
                  onChangeName={(id, v) => updateField(id, 'name', v)}
                  onChangeType={(id, v) => updateField(id, 'field_type', v)}
                  onRemove={removeField} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button type="button" onClick={addField}
          className="text-xs border border-dashed border-border rounded-md px-2 py-1.5 hover:bg-accent transition-colors text-muted-foreground w-fit">
          <Plus className="h-3 w-3 inline mr-1" />添加字段
        </button>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>取消</Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}

export function TemplatesSettings() {
  const { templates, createTemplate, updateTemplate, deleteTemplate, resetBuiltinTemplate } = useTemplates();
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);

  const handleSaveNew = async (name: string, fields: string) => {
    try {
      await createTemplate({ name, fields });
      toast.success("模版已创建");
      setEditingId(null);
    } catch (e) { toast.error(`创建失败: ${e}`); }
  };

  const handleSaveEdit = async (id: number, name: string, fields: string) => {
    try {
      await updateTemplate({ id, name, fields });
      toast.success("模版已更新");
      setEditingId(null);
    } catch (e) { toast.error(`更新失败: ${e}`); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteTemplate(id); toast.success("模版已删除"); }
    catch (e) { toast.error(`删除失败: ${e}`); }
  };

  const handleReset = async (id: number) => {
    try { await resetBuiltinTemplate(id); toast.success("已重置为默认"); }
    catch (e) { toast.error(`重置失败: ${e}`); }
  };

  return (
    <div className="flex flex-col gap-3">
      {templates.map(tpl => {
        let fieldCount = 0;
        try { fieldCount = JSON.parse(tpl.fields).length; } catch { /* */ }
        return (
          <div key={tpl.id}>
            <div className={cn(
              "rounded-lg border border-border p-3 flex items-center gap-2",
              editingId === tpl.id && "border-primary ring-1 ring-primary/20",
            )}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{tpl.name}</p>
                <p className="text-xs text-muted-foreground">{fieldCount} 个字段{tpl.is_builtin && " · 内置"}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingId(editingId === tpl.id ? null : tpl.id)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                  title="编辑"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {tpl.is_builtin ? (
                  <button type="button" onClick={() => handleReset(tpl.id)}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded" title="重置为默认">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button type="button" onClick={() => handleDelete(tpl.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded" title="删除">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {editingId === tpl.id && (
              <TemplateEditor
                template={tpl}
                onSave={(name, fields) => handleSaveEdit(tpl.id, name, fields)}
                onCancel={() => setEditingId(null)}
              />
            )}
          </div>
        );
      })}

      {editingId === 'new' ? (
        <TemplateEditor template={null} onSave={handleSaveNew} onCancel={() => setEditingId(null)} />
      ) : (
        <button
          type="button"
          onClick={() => setEditingId('new')}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Plus className="h-4 w-4" /> 新建模版
        </button>
      )}
    </div>
  );
}
