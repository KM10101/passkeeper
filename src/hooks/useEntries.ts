import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listEntries, createEntry, updateEntry, deleteEntry,
  pinEntry, reorderEntries, type NewEntryField,
} from '../lib/tauri';

export function useEntries(groupId?: number, search?: string) {
  const qc = useQueryClient();
  const { data: entries = [] } = useQuery({
    queryKey: ['entries', groupId, search],
    queryFn: () => listEntries(groupId, search),
  });
  const create = useMutation({
    mutationFn: (args: { groupId: number | null; title: string; url: string | null; siteTitle: string | null; username: string | null; templateType: string; tags: string; notes: string | null; favorite: boolean; fields: NewEntryField[] }) =>
      createEntry(args.groupId, args.title, args.url, args.siteTitle, args.username, args.templateType, args.tags, args.notes, args.favorite, args.fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  const update = useMutation({
    mutationFn: (args: { id: number; groupId: number | null; title: string; url: string | null; siteTitle: string | null; username: string | null; templateType: string; tags: string; notes: string | null; favorite: boolean; fields: NewEntryField[] }) =>
      updateEntry(args.id, args.groupId, args.title, args.url, args.siteTitle, args.username, args.templateType, args.tags, args.notes, args.favorite, args.fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['entry'] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      pinEntry(id, pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  });
  const reorder = useMutation({
    mutationFn: ({ ids, pinned }: { ids: number[]; pinned: boolean }) =>
      reorderEntries(ids, pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  });
  return {
    entries,
    createEntry: create.mutateAsync,
    updateEntry: update.mutateAsync,
    deleteEntry: remove.mutateAsync,
    pinEntry: pin.mutateAsync,
    reorderEntries: reorder.mutateAsync,
  };
}
