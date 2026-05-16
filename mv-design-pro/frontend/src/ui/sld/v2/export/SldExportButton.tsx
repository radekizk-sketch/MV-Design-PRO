/**
 * SLD Export Button — P0.7 / V12K-007 UI integration.
 *
 * Standalone React component dla przycisku "Pobierz SVG" w UI. Może być
 * osadzony w SldWorkDock, SldViewPage, lub gdziekolwiek indziej — bez
 * zależności od istniejących komponentów SLD (tylko od export utility).
 *
 * USAGE
 * -----
 *   <SldExportButton
 *     svgRef={canvasRef}
 *     projectName="GPZ Plonsk"
 *     caseLabel="Wariant bazowy"
 *   />
 *
 * Reference:
 * - docs/v12xx/REJESTR_KONFLIKTOW.md V12K-007 (eksport light_technical)
 * - docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md AC-10 (eksport SVG działa)
 * - frontend/src/ui/sld/v2/export/downloadSldExport.ts
 */

import { useCallback, useState, type RefObject } from 'react';

import { downloadSldSvg, downloadSldSvgBySelector } from './downloadSldExport';

interface SldExportButtonProps {
  /**
   * Ref do SVG elementu (preferowane). Gdy podany, ma pierwszeństwo nad
   * selectorem (bezpośredni dostęp uniknie problemów z DOM update).
   */
  svgRef?: RefObject<SVGSVGElement>;
  /**
   * Selektor CSS / [data-testid] do SVG (fallback gdy ref niedostępny).
   * Komponent znajdzie pierwszy <svg> wewnątrz lub użyje elementu jeśli to <svg>.
   */
  svgSelector?: string;
  /** Nazwa projektu do nazwy pliku + metadata. */
  projectName?: string;
  /** Identyfikator case'a / snapshota. */
  caseLabel?: string;
  /** Custom label przycisku (default: "Pobierz SVG"). */
  label?: string;
  /** Optional className do dodania do button (Tailwind / styled). */
  className?: string;
  /** Callback po udanym eksporcie (otrzymuje filename hint). */
  onExported?: (filename: string) => void;
  /** Callback gdy eksport się nie powiódł (brak svg, błąd serializacji). */
  onError?: (message: string) => void;
}

export function SldExportButton({
  svgRef,
  svgSelector = '[data-testid="sld-canvas-root"]',
  projectName,
  caseLabel,
  label = 'Pobierz SVG',
  className,
  onExported,
  onError,
}: SldExportButtonProps): JSX.Element {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(() => {
    if (busy) return;
    setBusy(true);
    try {
      const options = { projectName, caseLabel };
      let filename: string | null = null;
      if (svgRef?.current) {
        filename = downloadSldSvg(svgRef.current, options);
      } else {
        filename = downloadSldSvgBySelector(svgSelector, options);
      }
      if (filename === null) {
        onError?.('Nie znaleziono elementu SVG do eksportu.');
        return;
      }
      onExported?.(filename);
    } catch (exc) {
      onError?.(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setBusy(false);
    }
  }, [busy, projectName, caseLabel, svgRef, svgSelector, onError, onExported]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={label}
      data-testid="sld-export-svg-button"
      className={
        className ??
        'inline-flex items-center gap-2 rounded-md border border-scada-border bg-scada-panel-raised px-3 py-1.5 text-sm text-scada-text hover:bg-scada-panel disabled:opacity-50'
      }
    >
      {busy ? 'Eksportowanie…' : label}
    </button>
  );
}
