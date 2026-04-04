import { Star } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import type { Entry } from "../../lib/tauri";

interface Props {
  entry: Entry;
  selected: boolean;
  onClick: () => void;
}

export function EntryCard({ entry, selected, onClick }: Props) {
  const tags = entry.tags ? entry.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const domain = entry.url ? (() => { try { return new URL(entry.url).hostname; } catch { return null; } })() : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 border-b border-border transition-colors flex items-start gap-3",
        selected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent",
      )}
    >
      {/* Favicon */}
      <div className="shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center overflow-hidden mt-0.5">
        {domain ? (
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
            alt=""
            className="w-6 h-6"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span className="text-xs font-bold text-muted-foreground">
            {entry.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium truncate">{entry.title}</span>
          {entry.favorite && <Star className="h-3 w-3 text-yellow-500 shrink-0 fill-yellow-500" />}
        </div>
        {entry.username && (
          <p className="text-xs text-muted-foreground truncate">{entry.username}</p>
        )}
        {entry.url && (
          <p className="text-xs text-muted-foreground truncate">{domain}</p>
        )}
        {tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1 py-0">{tag}</Badge>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
