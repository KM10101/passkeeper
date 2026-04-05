import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, Upload, Lock } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import {
  getSettings, updateSettings, exportVaultToPath, importVaultFromPath,
  saveFileDialog, openFileDialog,
} from "../lib/tauri";

interface Props { onBack: () => void; }

export function SettingsPage({ onBack }: Props) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [autoLock, setAutoLock] = useState(settings?.auto_lock_minutes ?? 5);
  const [showPw, setShowPw] = useState(settings?.show_passwords_by_default ?? false);
  const [exportPassword, setExportPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const saveSettings = useMutation({
    mutationFn: () => updateSettings(autoLock, showPw),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("设置已保存");
    },
  });

  const handleExport = async () => {
    if (!exportPassword) { toast.error("请输入导出密码"); return; }
    const path = await saveFileDialog({
      title: "导出备份",
      filters: [{ name: "PassKeeper Vault", extensions: ["pkv"] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      await exportVaultToPath(path, exportPassword);
      toast.success("备份已导出");
      setExportPassword("");
    } catch (e) {
      toast.error(`导出失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!importPassword) { toast.error("请输入备份密码"); return; }
    const path = await openFileDialog({
      title: "选择备份文件",
      filters: [{ name: "PassKeeper Vault", extensions: ["pkv"] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      await importVaultFromPath(path, importPassword);
      toast.success("数据已导入");
      qc.invalidateQueries();
      setImportPassword("");
    } catch (e) {
      toast.error(`导入失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center gap-3 px-6 h-14 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold">Settings</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Auto-lock */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">安全</h2>
          <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="autolock" className="text-sm font-medium">自动锁定</Label>
                <p className="text-xs text-muted-foreground mt-0.5">无操作后自动锁定（分钟）</p>
              </div>
              <Input
                id="autolock"
                type="number"
                min={1}
                max={60}
                value={autoLock}
                onChange={e => setAutoLock(Number(e.target.value))}
                className="w-20 text-center"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="showpw" className="text-sm font-medium">默认显示密码</Label>
                <p className="text-xs text-muted-foreground mt-0.5">打开条目时密码默认可见</p>
              </div>
              <Switch id="showpw" checked={showPw} onCheckedChange={setShowPw} />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                <Lock className="h-3.5 w-3.5 mr-1.5" />
                保存设置
              </Button>
            </div>
          </div>
        </section>

        {/* Export */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">备份与恢复</h2>
          <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium">导出备份</h3>
              <p className="text-xs text-muted-foreground mt-0.5">将所有数据加密导出为 .pkv 文件</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="export-pw" className="text-xs">导出密码</Label>
              <Input
                id="export-pw"
                type="password"
                placeholder="设置备份密码"
                value={exportPassword}
                onChange={e => setExportPassword(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={handleExport} disabled={busy}>
              <Download className="h-4 w-4 mr-2" />
              选择位置并导出
            </Button>
          </div>

          {/* Import */}
          <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium">导入数据</h3>
              <p className="text-xs text-muted-foreground mt-0.5">从 .pkv 备份文件导入数据（不覆盖现有条目）</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-pw" className="text-xs">备份密码</Label>
              <Input
                id="import-pw"
                type="password"
                placeholder="输入备份密码"
                value={importPassword}
                onChange={e => setImportPassword(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={handleImport} disabled={busy}>
              <Upload className="h-4 w-4 mr-2" />
              选择文件并导入
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
