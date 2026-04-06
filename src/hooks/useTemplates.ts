import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, resetBuiltinTemplate } from '../lib/tauri';

export function useTemplates() {
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: listTemplates,
  });

  const create = useMutation({
    mutationFn: ({ name, fields }: { name: string; fields: string }) =>
      createTemplate(name, fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const update = useMutation({
    mutationFn: ({ id, name, fields }: { id: number; name: string; fields: string }) =>
      updateTemplate(id, name, fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const reset = useMutation({
    mutationFn: (id: number) => resetBuiltinTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  return {
    templates,
    createTemplate: create.mutateAsync,
    updateTemplate: update.mutateAsync,
    deleteTemplate: remove.mutateAsync,
    resetBuiltinTemplate: reset.mutateAsync,
  };
}
