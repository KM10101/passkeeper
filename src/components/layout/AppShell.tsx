import { useState, useCallback, useRef, type ReactNode } from "react";
import { Moon, Sun, Lock, Settings } from "lucide-react";
import { Button } from "../ui/button";
import { useTheme } from "./ThemeProvider";

interface AppShellProps {
  sidebar: ReactNode;
  entryList: ReactNode;
  detail: ReactNode;
  onLock: () => void;
  onSettings: () => void;
}

export function AppShell({ sidebar, entryList, detail, onLock, onSettings }: AppShellProps) {
  const { theme, toggleTheme } = useTheme();
  const [sidebarW, setSidebarW] = useState(220);
  const [listW, setListW] = useState(320);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback((
    setter: (w: number) => void,
    min: number,
    getMax: () => number,
  ) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = setter === setSidebarW ? sidebarW : listW;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      setter(Math.max(min, Math.min(getMax(), startW + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarW, listW]);

  const getContainerWidth = () => containerRef.current?.offsetWidth ?? 1100;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center px-4 h-12 border-b border-border shrink-0">
        <span className="font-bold text-primary text-lg">PassKeeper</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onSettings} title="Settings">
          <Settings className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onLock} title="Lock vault">
          <Lock className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden" ref={containerRef}>
        {/* Sidebar */}
        <aside className="shrink-0 border-r border-border flex flex-col overflow-y-auto" style={{ width: sidebarW }}>
          {sidebar}
        </aside>

        {/* Drag handle 1 */}
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors active:bg-primary/50"
          onMouseDown={startDrag(setSidebarW, 160, () => getContainerWidth() - listW - 300)}
        />

        {/* Entry list */}
        <section className="shrink-0 border-r border-border flex flex-col overflow-y-auto" style={{ width: listW }}>
          {entryList}
        </section>

        {/* Drag handle 2 */}
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors active:bg-primary/50"
          onMouseDown={startDrag(setListW, 200, () => getContainerWidth() - sidebarW - 300)}
        />

        {/* Detail */}
        <main className="flex-1 overflow-y-auto">
          {detail}
        </main>
      </div>
    </div>
  );
}
