/**
 * CommandPalette — paleta komend inżynierskich (Ctrl+Shift+P).
 *
 * Etap 6 dostawy. Fuzzy search po:
 *   - Wszystkich powierzchniach E-XX z screenCanonRegistry (Pulpit projektu,
 *     Środowisko SLD, Konfigurator GPZ, Konfigurator pola SN, ...).
 *   - Wszystkich akcjach SLD_MENU_REGISTRY (Wstaw GPZ, Dodaj sekcję, ...).
 *   - Akcjach skrótowych: Oblicz, Przejdź do wyników, Otwórz ENM Inspector.
 *
 * Wybór akcji nawiguje do odpowiedniego ekranu albo wywołuje callback handler.
 *
 * Ergonomia: ↑/↓ nawigacja, Enter wykonanie, Esc zamknięcie.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';

import { SCREEN_CANON_REGISTRY } from '../workspace/screenCanonRegistry';
import { useNetworkBuildStore } from './networkBuildStore';
import {
  SLD_MENU_REGISTRY,
  type SldElementKindForMenu,
  type SldMenuAction,
} from '../sld/v2/command/SldCommandService';

interface CommandEntry {
  readonly id: string;
  readonly category: 'screen' | 'menu' | 'shortcut';
  readonly label: string;
  readonly description: string;
  readonly keywords: string;
  readonly run: () => void;
}

export interface CommandPaletteProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /**
   * Opcjonalne dodatkowe komendy (np. uruchomienie obliczeń) wstrzykiwane
   * z poziomu shellu — aby nie duplikować zależności od stores.
   */
  readonly extraCommands?: ReadonlyArray<Omit<CommandEntry, 'category'>>;
}

const SLD_KIND_LABEL_PL: Readonly<Record<SldElementKindForMenu, string>> = {
  background: 'Tło SLD',
  gpz: 'GPZ',
  section: 'Sekcja SN',
  bay: 'Pole SN',
  apparatus: 'Aparat pola SN',
  cable_segment_sn: 'Kabel SN',
  overhead_line_sn: 'Linia napowietrzna SN',
  station: 'Stacja',
  zksn: 'ZK SN',
  branch_pole: 'Słup rozgałęźny SN',
  der_pv: 'PV',
  der_bess: 'BESS',
  der_fw: 'Farma wiatrowa',
  // Karta SLD-P (GAP P-1): kind generyczny DER na kanwie v3.
  der: 'Źródło OZE / generator',
};

function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 - Math.abs(t.length - q.length);
  // Prosty fuzzy: każda litera musi pojawić się w kolejności.
  let qi = 0;
  let consecutive = 0;
  let bestStreak = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi += 1;
      consecutive += 1;
      bestStreak = Math.max(bestStreak, consecutive);
    } else {
      consecutive = 0;
    }
  }
  if (qi === q.length) {
    return Math.max(1, 50 - q.length + bestStreak);
  }
  return 0;
}

export function CommandPalette({
  isOpen,
  onClose,
  extraCommands,
}: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);

  // Reset state przy otwarciu.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setHighlightedIndex(0);
      // Focus input.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const allCommands = useMemo<CommandEntry[]>(() => {
    const entries: CommandEntry[] = [];

    // 1) Powierzchnie E-XX (tylko widoczne w nawigacji).
    for (const screen of Object.values(SCREEN_CANON_REGISTRY)) {
      if (!screen.visibleInNavigation) continue;
      entries.push({
        id: `screen:${screen.id}`,
        category: 'screen',
        label: screen.labelFull,
        description: `Otwórz widok: ${screen.labelFull}`,
        keywords: `${screen.id} ${screen.labelFull} ${screen.labelShort}`,
        run: () => {
          openRouteSurface(screen.id, {
            titlePl: screen.labelFull,
            subjectKind: 'helper_context',
          });
          onClose();
        },
      });
    }

    // 2) Akcje SLD_MENU_REGISTRY (poza tłem).
    for (const kind of Object.keys(SLD_MENU_REGISTRY) as SldElementKindForMenu[]) {
      if (kind === 'background') continue;
      for (const action of SLD_MENU_REGISTRY[kind] as readonly SldMenuAction[]) {
        entries.push({
          id: `menu:${kind}:${action.id}`,
          category: 'menu',
          label: `${SLD_KIND_LABEL_PL[kind]} → ${action.labelPl}`,
          description: `Dostępne po zaznaczeniu elementu: ${SLD_KIND_LABEL_PL[kind]}`,
          keywords: `${SLD_KIND_LABEL_PL[kind]} ${action.labelPl} ${action.id}`,
          run: () => {
            // Akcje SLD wymagają kontekstu (elementu na kanwie). Z palety
            // pokazujemy informację, że trzeba użyć prawego kliku.
            // Tutaj nie wykonujemy mutacji modelu — to gwarancja, że
            // CommandPalette jest deterministyczne i bezpieczne.
            const message = `Akcja "${action.labelPl}" dostępna z menu kontekstowego SLD (prawy klik na elemencie typu: ${SLD_KIND_LABEL_PL[kind]}).`;
            // notify zaimportujemy w shellu; tutaj używamy event'a okna.
            window.dispatchEvent(
              new CustomEvent('mvdesignpro:command-palette-info', { detail: message }),
            );
            onClose();
          },
        });
      }
    }

    // 3) Dodatkowe komendy z shellu.
    if (extraCommands) {
      for (const cmd of extraCommands) {
        entries.push({ ...cmd, category: 'shortcut' });
      }
    }

    return entries;
  }, [openRouteSurface, onClose, extraCommands]);

  const results = useMemo(() => {
    const scored = allCommands.map((cmd) => ({
      cmd,
      score: fuzzyScore(query, cmd.keywords),
    }));
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [allCommands, query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((idx) => Math.min(idx + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((idx) => Math.max(idx - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = results[highlightedIndex];
        if (selected) {
          selected.cmd.run();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [results, highlightedIndex, onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      data-testid="command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Paleta komend inżynierskich"
    >
      <div
        className="w-[640px] max-w-[95vw] overflow-hidden rounded-lg border border-scada-border bg-scada-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-scada-border bg-scada-surface px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            data-testid="command-palette-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Wyszukaj akcję, ekran, komendę..."
            className="w-full bg-transparent text-sm text-scada-text placeholder:text-scada-muted focus:outline-none"
          />
        </div>
        <div data-testid="command-palette-results" className="max-h-[480px] overflow-auto">
          {results.length === 0 && (
            <div
              data-testid="command-palette-empty"
              className="p-4 text-sm text-scada-muted"
            >
              Nie znaleziono komend pasujących do zapytania "{query}".
            </div>
          )}
          {results.map((entry, index) => (
            <button
              key={entry.cmd.id}
              type="button"
              data-testid={`command-palette-item-${entry.cmd.id}`}
              data-active={index === highlightedIndex}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => entry.cmd.run()}
              className={clsx(
                'flex w-full items-start gap-3 px-4 py-2 text-left',
                index === highlightedIndex
                  ? 'bg-scada-hover-nav text-scada-text'
                  : 'text-scada-muted hover:bg-scada-hover-nav',
              )}
            >
              <span
                className={clsx(
                  'mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest',
                  entry.cmd.category === 'screen'
                    ? 'bg-sygnal-info-tlo text-sygnal-info-tusz'
                    : entry.cmd.category === 'menu'
                      ? 'bg-sygnal-uwaga-tlo text-sygnal-uwaga-tusz'
                      : 'bg-sygnal-ok-tlo text-sygnal-ok-tusz',
                )}
              >
                {entry.cmd.category === 'screen'
                  ? 'EKRAN'
                  : entry.cmd.category === 'menu'
                    ? 'KONTEKST'
                    : 'AKCJA'}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{entry.cmd.label}</span>
                <span className="block text-xs text-scada-muted">{entry.cmd.description}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-scada-border bg-scada-surface px-4 py-2 text-[11px] text-scada-muted">
          ↑↓ nawigacja · Enter wybierz · Esc zamknij
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
