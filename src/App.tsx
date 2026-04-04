import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./components/layout/ThemeProvider";
import { UnlockPage } from "./pages/UnlockPage";
import { VaultPage } from "./pages/VaultPage";

const queryClient = new QueryClient();

export default function App() {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {unlocked
          ? <VaultPage onLock={() => setUnlocked(false)} />
          : <UnlockPage onUnlocked={() => setUnlocked(true)} />
        }
      </QueryClientProvider>
    </ThemeProvider>
  );
}
