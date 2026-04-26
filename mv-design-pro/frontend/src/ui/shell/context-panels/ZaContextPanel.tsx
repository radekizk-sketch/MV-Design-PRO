/**
 * ZaContextPanel — Panel kontekstu obszaru ZA (Zabezpieczenia).
 *
 * Zakładki:
 *  - Biblioteka (urządzenia / krzywe / szablony) — ProtectionLibraryBrowser
 *  - Diagnostyka (selektywność, sanity check)
 *
 * Catalog-first, no codenames, dark SCADA palette.
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import { ProtectionLibraryBrowser } from '../../protection/ProtectionLibraryBrowser';

type ZaTab = 'library' | 'diagnostics';

const TAB_DEFS: Array<{ id: ZaTab; label: string; testId: string }> = [
  { id: 'library', label: 'Biblioteka', testId: 'za-tab-library' },
  { id: 'diagnostics', label: 'Diagnostyka', testId: 'za-tab-diagnostics' },
];

export function ZaContextPanel() {
  const [activeTab, setActiveTab] = useState<ZaTab>('library');

  return (
    <div
      data-testid="za-context-panel"
      className="flex h-full flex-col overflow-hidden bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Zabezpieczenia
        </span>
      </div>

      <div className="flex shrink-0 border-b border-scada-border bg-scada-bg">
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-testid={tab.testId}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-1 border-r border-scada-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors last:border-r-0',
              activeTab === tab.id
                ? 'bg-scada-active text-scada-sn'
                : 'text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab === 'library' && (
          <div data-testid="za-library-content" className="h-full">
            <ProtectionLibraryBrowser />
          </div>
        )}
        {activeTab === 'diagnostics' && (
          <div
            data-testid="za-diagnostics-content"
            className="flex h-full flex-col gap-2 p-3 text-[11px] text-scada-text"
          >
            <p className="text-scada-muted">
              Diagnostyka selektywności analizuje ustawienia zabezpieczeń względem
              obliczonych zwarć. Aby uruchomić diagnostykę:
            </p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>Wybierz aktywny przypadek z analizą zwarciową (SC_3F, SC_1F)</li>
              <li>Uruchom obliczenia (przycisk Oblicz)</li>
              <li>Otwórz panel <strong>Diagnostyka</strong> w Inspektorze</li>
            </ol>
            <div className="mt-2 rounded border border-scada-border bg-scada-surface p-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">
                Skróty klawiszowe
              </span>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-scada-text">
                <li><kbd>F4</kbd> — tryb TZ (zabezpieczenia)</li>
                <li><kbd>Ctrl+K</kbd> — wyszukaj urządzenie</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
