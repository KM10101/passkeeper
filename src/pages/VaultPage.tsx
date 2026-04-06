import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/layout/AppShell";
import { GroupTree } from "../components/GroupTree";
import { EntryList } from "../components/EntryList";
import { EntryDetail } from "../components/entries/EntryDetail";
import { EntryDialog } from "../components/entries/EntryDialog";
import { useVault } from "../hooks/useVault";
import { useEntries } from "../hooks/useEntries";
import { getEntry } from "../lib/tauri";
import { SettingsPage } from "./SettingsPage";

interface Props { onLock: () => void; }

export function VaultPage({ onLock }: Props) {
  const { lock } = useVault();
  const { entries: allEntries } = useEntries(undefined);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const { data: editingDetail } = useQuery({
    queryKey: ["entry", editingEntryId],
    queryFn: () => getEntry(editingEntryId!),
    enabled: editingEntryId !== null,
  });

  const handleLock = async () => {
    await lock();
    onLock();
  };

  const openNewEntry = () => {
    setEditingEntryId(null);
    setDialogOpen(true);
  };

  const openEditEntry = (id: number) => {
    setEditingEntryId(id);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingEntryId(null);
  };

  if (showSettings) {
    return <SettingsPage onBack={() => setShowSettings(false)} />;
  }

  return (
    <>
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
            onEditEntry={(id) => {
              setSelectedEntryId(id);
              openEditEntry(id);
            }}
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

      <EntryDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        existing={editingDetail}
        defaultGroupId={selectedGroupId}
      />
    </>
  );
}
