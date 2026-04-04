import type { ReactNode } from "react";
import { Moon, Sun, Lock } from "lucide-react";
import { Button } from "../ui/button";
import { useTheme } from "./ThemeProvider";

interface AppShellProps {
  sidebar: ReactNode;
  entryList: ReactNode;
  detail: ReactNode;
  onLock: () => void;
}

export function AppShell({ sidebar, entryList, detail, onLock }: AppShellProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* TopBar */}
      <header className="flex items-center px-4 h-12 border-b border-border shrink-0">
        <span className="font-bold text-primary text-lg">PassKeeper</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onLock} title="Lock vault">
          <Lock className="h-4 w-4" />
        </Button>
      </header>

      {/* Three columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: 220px */}
        <aside className="w-[220px] shrink-0 border-r border-border flex flex-col overflow-y-auto">
          {sidebar}
        </aside>

        {/* Entry list: 320px */}
        <section className="w-[320px] shrink-0 border-r border-border flex flex-col overflow-y-auto">
          {entryList}
        </section>

        {/* Detail: flex-1 */}
        <main className="flex-1 overflow-y-auto">
          {detail}
        </main>
      </div>
    </div>
  );
}
