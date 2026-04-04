import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../lib/tauri', () => ({
  isLocked: vi.fn().mockResolvedValue(true),
  unlockVault: vi.fn().mockResolvedValue(undefined),
  lockVault: vi.fn().mockResolvedValue(undefined),
}));

import { useVault } from './useVault';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient() }, children);

describe('useVault', () => {
  it('exposes unlock and lock functions', () => {
    const { result } = renderHook(() => useVault(), { wrapper });
    expect(typeof result.current.unlock).toBe('function');
    expect(typeof result.current.lock).toBe('function');
  });
});
