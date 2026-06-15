import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { TRANSITIONS, transitionsByCategory } from "@/lib/transitions/registry";
import { CATEGORY_LABEL, type TransitionCategory, type TransitionDef } from "@/lib/transitions/types";
import { TransitionCard } from "./TransitionCard";

const FAV_KEY = "lle.transitions.favorites";
const RECENT_KEY = "lle.transitions.recent";
const USAGE_KEY = "lle.transitions.usage";
const RECENT_MAX = 6;

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(s))); } catch { /* ignore */ }
}
function loadList(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") as string[]; } catch { return []; }
}
function saveList(key: string, l: string[]) {
  try { localStorage.setItem(key, JSON.stringify(l)); } catch { /* ignore */ }
}
function loadUsage(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(USAGE_KEY) ?? "{}") as Record<string, number>; }
  catch { return {}; }
}

export type TransitionPickHandlers = {
  onApply: (def: TransitionDef) => void;
  onDragStart: (def: TransitionDef, e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
};

export function TransitionsPanel({ onApply, onDragStart, onDragEnd }: TransitionPickHandlers) {
  const [q, setQ] = useState("");
  const [favs, setFavs] = useState<Set<string>>(() => loadSet(FAV_KEY));
  const [recent, setRecent] = useState<string[]>(() => loadList(RECENT_KEY));
  const usage = useMemo(loadUsage, [recent]);

  useEffect(() => saveSet(FAV_KEY, favs), [favs]);
  useEffect(() => saveList(RECENT_KEY, recent), [recent]);

  const toggleFav = (id: string) => {
    setFavs(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const markUsed = (def: TransitionDef) => {
    setRecent(prev => {
      const n = [def.id, ...prev.filter(x => x !== def.id)].slice(0, RECENT_MAX);
      return n;
    });
    try {
      const u = loadUsage();
      u[def.id] = (u[def.id] ?? 0) + 1;
      localStorage.setItem(USAGE_KEY, JSON.stringify(u));
    } catch { /* ignore */ }
  };

  const handleApply = (def: TransitionDef) => {
    markUsed(def);
    onApply(def);
  };
  const handleDragStart = (def: TransitionDef, e: React.DragEvent) => {
    markUsed(def);
    onDragStart(def, e);
  };

  const norm = q.trim().toLowerCase();
  const filtered = norm
    ? TRANSITIONS.filter(t => t.name.toLowerCase().includes(norm) || t.id.includes(norm))
    : TRANSITIONS;
  const byCat = useMemo(() => {
    const m = {} as Record<TransitionCategory, TransitionDef[]>;
    for (const t of filtered) (m[t.category] ||= []).push(t);
    return m;
  }, [filtered]);

  const favDefs = TRANSITIONS.filter(t => favs.has(t.id));
  const recentDefs = recent
    .map(id => TRANSITIONS.find(t => t.id === id))
    .filter((x): x is TransitionDef => !!x);
  const topUsed = Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => TRANSITIONS.find(t => t.id === id))
    .filter((x): x is TransitionDef => !!x);

  const cardProps = (def: TransitionDef) => ({
    def,
    favorite: favs.has(def.id),
    onToggleFavorite: () => toggleFav(def.id),
    onClick: () => handleApply(def),
    onDragStart: (e: React.DragEvent) => handleDragStart(def, e),
    onDragEnd,
  });

  const categories = Object.keys(transitionsByCategory()) as TransitionCategory[];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 text-xs">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar transição..."
          className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:border-primary/60"
        />
      </div>

      <div className="rounded-md border border-dashed border-border bg-card/40 px-2 py-1.5 text-[10px] text-muted-foreground">
        Arraste entre dois clipes encostados, ou clique para aplicar ao clipe selecionado.
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {!norm && favDefs.length > 0 && (
          <Section title="★ Favoritas">
            <div className="grid grid-cols-2 gap-1.5">
              {favDefs.map(def => <TransitionCard key={def.id} {...cardProps(def)} />)}
            </div>
          </Section>
        )}

        {!norm && recentDefs.length > 0 && (
          <Section title="↻ Recentes">
            <div className="grid grid-cols-2 gap-1.5">
              {recentDefs.map(def => <TransitionCard key={def.id} {...cardProps(def)} recent />)}
            </div>
          </Section>
        )}

        {!norm && topUsed.length > 0 && (
          <Section title="✦ Mais usadas">
            <div className="grid grid-cols-2 gap-1.5">
              {topUsed.map(def => <TransitionCard key={def.id} {...cardProps(def)} />)}
            </div>
          </Section>
        )}

        {categories.map(cat => {
          const list = byCat[cat];
          if (!list || list.length === 0) return null;
          return (
            <Section key={cat} title={CATEGORY_LABEL[cat]}>
              <div className="grid grid-cols-2 gap-1.5">
                {list.map(def => <TransitionCard key={def.id} {...cardProps(def)} />)}
              </div>
            </Section>
          );
        })}

        {norm && filtered.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-muted-foreground">
            Nenhuma transição encontrada.
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{title}</div>
      {children}
    </div>
  );
}
