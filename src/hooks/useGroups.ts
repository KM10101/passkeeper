import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listGroups, createGroup, updateGroup, deleteGroup } from '../lib/tauri';

export function useGroups() {
  const qc = useQueryClient();
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  });

  const create = useMutation({
    mutationFn: ({ name, parentId, icon, sortOrder }: { name: string; parentId: number | null; icon: string | null; sortOrder: number }) =>
      createGroup(name, parentId, icon, sortOrder),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });

  const update = useMutation({
    mutationFn: ({ id, name, icon, sortOrder }: { id: number; name: string; icon: string | null; sortOrder: number }) =>
      updateGroup(id, name, icon, sortOrder),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });

  return { groups, createGroup: create.mutateAsync, updateGroup: update.mutateAsync, deleteGroup: remove.mutateAsync };
}
