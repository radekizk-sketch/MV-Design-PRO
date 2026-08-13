/**
 * SldExportFormatMenu — wybór formatu eksportu schematu.
 *
 * S9-6 (audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` E-1/E-2/E-6): komponent
 * jest odtąd WYŁĄCZNIE wyborem pozycji — nie zna żadnego formatu i niczego nie
 * generuje. Wcześniej trzymał DWIE rozjeżdżające się listy: opisową
 * (`FORMAT_DESCRIPTORS`) i wykonawczą (`if (format === …)`), przez co menu
 * oferowało sześć pozycji, z których trzy nie robiły nic (PDF, PNG — brak
 * pliku i brak komunikatu), a trzy wołały generatory z PUSTYMI tablicami
 * wejścia, dając „udane" pliki bez ani jednej encji (DXF 176 B, SCD 169 B,
 * CIM 220 B — pomiar karty S9-6).
 *
 * Teraz lista pozycji pochodzi z JEDNEGO źródła prawdy
 * (`v3/export/formats.ts` — `SLD_EXPORT_FORMATS`), a wykonanie dostarcza
 * wołający jednym propem `onExport`, którego implementacja jest mapą
 * `Record<SldExportFormat, …>` (`v3/export/sldExport.ts`), więc kompilator
 * pilnuje, żeby oferta i pokrycie nie mogły się rozjechać.
 */

import { useState } from 'react';

import { SLD_EXPORT_FORMATS, type SldExportFormat } from '../../v3/export/formats';

export type { SldExportFormat };

export interface SldExportFormatMenuProps {
  /**
   * Wykonuje eksport wybranego formatu i zwraca nazwę zapisanego pliku albo
   * `null`, gdy nie ma czego eksportować (brak rysunku/modelu). Błąd budowy
   * pliku ma polecieć WYJĄTKIEM — menu pokaże komunikat przez `onError`.
   */
  readonly onExport: (format: SldExportFormat) => string | null;
  readonly className?: string;
  readonly onExported?: (filename: string, format: SldExportFormat) => void;
  readonly onError?: (message: string) => void;
}

export function SldExportFormatMenu({ onExport, className, onExported, onError }: SldExportFormatMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<SldExportFormat | null>(null);

  const handleExport = (format: SldExportFormat): void => {
    if (busy) return;
    setBusy(format);
    try {
      const filename = onExport(format);
      if (filename === null) {
        onError?.('Nie ma czego wyeksportować — najpierw wczytaj model sieci.');
        return;
      }
      onExported?.(filename, format);
    } catch (exc) {
      onError?.(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  return (
    <div className={`relative inline-block ${className ?? ''}`} data-testid="sld-export-format-menu">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-scada-border bg-scada-panel-raised px-3 py-1.5 text-sm text-scada-text hover:bg-scada-panel"
        data-testid="sld-export-menu-toggle"
        aria-expanded={open}
        title="Wybierz format eksportu schematu"
      >
        Eksportuj schemat ▾
      </button>
      {open ? (
        <ul
          role="menu"
          className="absolute right-0 z-50 mt-1 w-72 rounded-md border border-scada-border bg-scada-panel-raised p-1 shadow-lg"
          data-testid="sld-export-menu-items"
        >
          {SLD_EXPORT_FORMATS.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                role="menuitem"
                disabled={busy !== null}
                onClick={() => handleExport(d.id)}
                title={d.descriptionPl}
                data-testid={`sld-export-format-${d.id}`}
                className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm text-scada-text hover:bg-scada-panel disabled:opacity-50"
              >
                <span className="font-semibold">{d.labelPl}</span>
                <span className="ml-auto text-[10px] text-scada-muted">.{d.extension}</span>
                {busy === d.id ? <span className="text-[10px] text-amber-400">…</span> : null}
              </button>
              <p className="px-2 pb-1 text-[10px] text-scada-muted">{d.descriptionPl}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
