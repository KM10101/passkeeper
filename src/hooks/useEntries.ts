import { useQuery } from '@tanstack/react-query';
import { listEntries } from '../lib/tauri';

export function useEntries(groupId?: number | null, search?: string) {
  return useQuery({
    queryKey: ['entries', groupId, search],
    queryFn: () => listEntries(groupId ?? undefined, search),
  });
}
