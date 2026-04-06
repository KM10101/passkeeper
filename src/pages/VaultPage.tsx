import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/layout/AppShell";
import { GroupTree } from "../components/GroupTree";
import { EntryList } from "../components/EntryList";
import { EntryDetail } from "../components/entries/EntryDetail";
import { EntryPage } from "./EntryPage";
import { useVault } from "../hooks/useVault";
import { useEntries } from "../hooks/useEntries";
import { getEntry } from "../lib/tauri";
import { SettingsPage } from "./SettingsPage";

interface EditorState {
  mode: 'new' | 'edit';
  defaultGroupId?: number | null;
  entryId?: number;
}

interface Props { onLock: () => void; }

export function VaultPage({ onLock }: Props) {
  const { lock } = useVault();
  const { entries: allEntries } = useEntries(undefined);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const { data: editingDetail } = useQuery({
    queryKey: ["entry", editorState?.entryId],
    queryFn: () => getEntry(editorState!.entryId!),
    enabled: editorState?.mode === 'edit' && editorState.entryId !== undefined,
  });

  const handleLock = async () => { await lock(); onLock(); };

  const openNewEntry = () =>
    setEditorState({ mode: 'new', defaultGroupId: selectedGroupId });

  const openEditEntry = (id: number) =>
    setEditorState({ mode: 'edit', entryId: id });

  const handleEditorDone = () => setEditorState(null);

  if (showSettings) return <SettingsPage onBack={() => setShowSettings(false)} />;

  if (editorState) {
    return (
      <EntryPage
        mode={editorState.mode}
        existing={editorState.mode === 'edit' ? editingDetail : undefined}
        defaultGroupId={editorState.defaultGroupId}
        onDone={handleEditorDone}
      />
    );
  }

  return (
    <AppShell
      onLock={handleLock}
      onSettings={() => setShowSettings(true)}
      sidebar={
        <GroupTree
          selected={selectedGroupId}
          onSelect={id => { setSelectedGroupId(id); setSelectedEntryId(null); }}
          totalCount={allEntries.length}
        />
      }
      entryList={
        <EntryList
          groupId={selectedGroupId}
          selectedEntryId={selectedEntryId}
          onSelect={setSelectedEntryId}
          onNewEntry={openNewEntry}
          onEditEntry={id => { setSelectedEntryId(id); openEditEntry(id); }}
        />
      }
      detail={
        selectedEntryId !== null ? (
          <EntryDetail
            entryId={selectedEntryId}
            onEdit={() => openEditEntry(selectedEntryId)}
            onDeleted={() => setSelectedEntryId(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <p className="text-sm">Select an entry to view details</p>
          </div>
        )
      }
    />
  );
}
