import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, Upload, Lock, FolderOpen } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import {
  getSettings, updateSettings, exportVaultToPath, importVaultFromPath,
  saveFileDialog, openFileDialog, getStorageDir, migrateStorage, openDirDialog,
} from "../lib/tauri";

interface Props { onBack: () => void; }

export function SettingsPage({ onBack }: Props) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: currentStorageDir } = useQuery({ queryKey: ["storage_dir"], queryFn: getStorageDir });

  const [autoLock, setAutoLock] = useState(5);
  const [showPw, setShowPw] = useState(false);
  const [faviconExpiry, setFaviconExpiry] = useState(7);
  const [httpProxy, setHttpProxy] = useState("");
  const [noProxy, setNoProxy] = useState("");
  const [storageDirInput, setStorageDirInput] = useState("");
  const [exportPassword, setExportPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Sync local state when settings load
  useEffect(() => {
    if (!settings) return;
    setAutoLock(settings.auto_lock_minutes);
    setShowPw(settings.show_passwords_by_default);
    setFaviconExpiry(settings.favicon_cache_expiry_days);
    setHttpProxy(settings.http_proxy);
    setNoProxy(settings.no_proxy);
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: () => updateSettings(autoLock, showPw, faviconExpiry, httpProxy, noProxy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("设置已保存");
    },
    onError: (e) => toast.error(`保存失败: ${e}`),
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
    } finally { setBusy(false); }
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
    } finally { setBusy(false); }
  };

  const handlePickStorageDir = async () => {
    const dir = await openDirDialog();
    if (dir) setStorageDirInput(dir);
  };

  const handleMigrateStorage = async () => {
    if (!storageDirInput.trim()) { toast.error("请选择或输入目录路径"); return; }
    setBusy(true);
    try {
      await migrateStorage(storageDirInput.trim());
      toast.success("存储路径已保存，重启后生效");
      setStorageDirInput("");
    } catch (e) {
      toast.error(`迁移失败: ${e}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-6 h-14 border-b border-border bg-background shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold">设置</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-8">

          {/* Security */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">安全</h2>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="autolock" className="text-sm font-medium">自动锁定</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">无操作后自动锁定（分钟）</p>
                </div>
                <Input id="autolock" type="number" min={1} max={60} value={autoLock}
                  onChange={e => setAutoLock(Number(e.target.value))} className="w-20 text-center" />
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
                  <Lock className="h-3.5 w-3.5 mr-1.5" /> 保存设置
                </Button>
              </div>
            </div>
          </section>

          {/* Favicon & Proxy */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">网络与图标</h2>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="favicon-expiry" className="text-sm font-medium">图标缓存有效期</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">超过此天数重新抓取</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input id="favicon-expiry" type="number" min={1} max={365} value={faviconExpiry}
                    onChange={e => setFaviconExpiry(Number(e.target.value))} className="w-20 text-center" />
                  <span className="text-sm text-muted-foreground">天</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="http-proxy" className="text-sm font-medium">HTTP 代理</Label>
                <Input id="http-proxy" value={httpProxy} onChange={e => setHttpProxy(e.target.value)}
                  placeholder="http://127.0.0.1:7890" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="no-proxy" className="text-sm font-medium">不走代理</Label>
                <Input id="no-proxy" value={noProxy} onChange={e => setNoProxy(e.target.value)}
                  placeholder="localhost,127.0.0.1,.internal.com" />
                <p className="text-xs text-muted-foreground">逗号分隔，支持 .domain.com 通配</p>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                  <Lock className="h-3.5 w-3.5 mr-1.5" /> 保存
                </Button>
              </div>
            </div>
          </section>

          {/* Storage */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">数据存储</h2>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium">当前存储路径</p>
                <p className="text-xs text-muted-foreground mt-0.5 break-all font-mono">
                  {currentStorageDir || "加载中..."}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="storage-dir" className="text-sm font-medium">自定义路径</Label>
                <div className="flex gap-2">
                  <Input id="storage-dir" value={storageDirInput}
                    onChange={e => setStorageDirInput(e.target.value)}
                    placeholder="留空使用默认路径" className="flex-1" />
                  <Button type="button" variant="outline" size="icon" onClick={handlePickStorageDir}>
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">保存后重启应用生效，数据文件将自动复制到新位置</p>
              </div>
              <Button variant="outline" onClick={handleMigrateStorage} disabled={busy || !storageDirInput.trim()}>
                保存并迁移数据
              </Button>
            </div>
          </section>

          {/* Backup */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">备份与恢复</h2>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-medium">导出备份</h3>
                <p className="text-xs text-muted-foreground mt-0.5">将所有数据加密导出为 .pkv 文件</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="export-pw" className="text-xs">导出密码</Label>
                <Input id="export-pw" type="password" placeholder="设置备份密码"
                  value={exportPassword} onChange={e => setExportPassword(e.target.value)} />
              </div>
              <Button variant="outline" onClick={handleExport} disabled={busy}>
                <Download className="h-4 w-4 mr-2" /> 选择位置并导出
              </Button>
            </div>
            <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-medium">导入数据</h3>
                <p className="text-xs text-muted-foreground mt-0.5">从 .pkv 备份文件导入数据</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import-pw" className="text-xs">备份密码</Label>
                <Input id="import-pw" type="password" placeholder="输入备份密码"
                  value={importPassword} onChange={e => setImportPassword(e.target.value)} />
              </div>
              <Button variant="outline" onClick={handleImport} disabled={busy}>
                <Upload className="h-4 w-4 mr-2" /> 选择文件并导入
              </Button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
