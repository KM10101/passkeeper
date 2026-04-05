import { useState } from "react";
import type { FormEvent } from "react";
import { Moon, Sun, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useTheme } from "../components/layout/ThemeProvider";
import { unlockVault } from "../lib/tauri";

interface Props { onUnlocked: () => void; }

export function UnlockPage({ onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await unlockVault(password);
      onUnlocked();
    } catch {
      setError("密码错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
            <ShieldCheck className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">PassKeeper</h1>
            <p className="text-sm text-muted-foreground mt-1">输入主密码以解锁密码库</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">主密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="h-11"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button type="submit" disabled={loading} className="w-full h-11 text-base">
            {loading ? "解锁中…" : "解锁"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          所有数据本地加密存储，从不上传
        </p>
      </div>
    </div>
  );
}
