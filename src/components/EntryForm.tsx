import { useState } from 'react';
import type { NewEntryField } from '../lib/tauri';

interface Props {
  initialTitle?: string;
  initialFields?: NewEntryField[];
  onSubmit: (title: string, fields: NewEntryField[]) => void;
}

export function EntryForm({ initialTitle = '', initialFields = [], onSubmit }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [fields, setFields] = useState<NewEntryField[]>(initialFields);

  const addField = () => setFields(f => [...f, { field_name: '', field_value: '', sort_order: f.length }]);

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(title, fields); }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" required />
      {fields.map((f, i) => (
        <div key={i}>
          <input value={f.field_name} onChange={e => setFields(fs => fs.map((x, j) => j === i ? { ...x, field_name: e.target.value } : x))} placeholder="Field name" />
          <input value={f.field_value} onChange={e => setFields(fs => fs.map((x, j) => j === i ? { ...x, field_value: e.target.value } : x))} placeholder="Value" type="password" />
        </div>
      ))}
      <button type="button" onClick={addField}>Add Field</button>
      <button type="submit">Save</button>
    </form>
  );
}
