// src/components/entries/FieldRenderer.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
// @ts-ignore
import javascript from 'highlight.js/lib/languages/javascript';
// @ts-ignore
import typescript from 'highlight.js/lib/languages/typescript';
// @ts-ignore
import python from 'highlight.js/lib/languages/python';
// @ts-ignore
import bash from 'highlight.js/lib/languages/bash';
// @ts-ignore
import sql from 'highlight.js/lib/languages/sql';
// @ts-ignore
import json from 'highlight.js/lib/languages/json';
// @ts-ignore
import yaml from 'highlight.js/lib/languages/yaml';
// @ts-ignore
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('xml', xml);

export const RICH_TYPES = new Set(['markdown', 'code', 'json', 'yaml']);

function highlight(value: string, language?: string): string {
  if (language) {
    try { return hljs.highlight(value, { language }).value; } catch { /* fall through */ }
  }
  try { return hljs.highlightAuto(value).value; } catch { return escapeHtml(value); }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatJson(value: string): string {
  try { return JSON.stringify(JSON.parse(value), null, 2); }
  catch { return value; }
}

interface Props {
  fieldType: string;
  value: string;
}

export function FieldRenderer({ fieldType, value }: Props) {
  if (!value) {
    return <span className="text-muted-foreground italic text-xs">空</span>;
  }

  if (fieldType === 'markdown') {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      </div>
    );
  }

  let code: string;
  let lang: string | undefined;
  if (fieldType === 'json') {
    code = formatJson(value);
    lang = 'json';
  } else if (fieldType === 'yaml') {
    code = value;
    lang = 'yaml';
  } else {
    // 'code' — autodetect
    code = value;
    lang = undefined;
  }

  return (
    <pre className="hljs rounded-md bg-muted/50 dark:bg-muted/20 border border-border p-3 text-xs overflow-x-auto">
      <code dangerouslySetInnerHTML={{ __html: highlight(code, lang) }} />
    </pre>
  );
}
