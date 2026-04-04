import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isLocked, unlockVault, lockVault } from '../lib/tauri';

export function useVault() {
  const qc = useQueryClient();
  const { data: locked = true } = useQuery({
    queryKey: ['locked'],
    queryFn: isLocked,
    refetchInterval: 5000,
  });

  const unlock = useMutation({
    mutationFn: (password: string) => unlockVault(password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locked'] }),
  });

  const lock = useMutation({
    mutationFn: () => lockVault(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locked'] }),
  });

  return { locked, unlock: unlock.mutateAsync, lock: lock.mutateAsync };
}
