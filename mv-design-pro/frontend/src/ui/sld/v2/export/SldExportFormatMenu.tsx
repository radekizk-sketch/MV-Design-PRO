/**
 * SldExportFormatMenu — Etap 15 dostawy
 * (Plan: "Eksport SVG / PDF / PNG / DXF / IEC 61850 / CIM").
 *
 * Dropdown z wieloma formatami eksportu SLD:
 * - SVG (light_technical) - PowerFactory/PSS/E compatibility
 * - PDF (vektorowy, tytułowy blok)
 * - PNG (rasterowy)
 * - DXF (CAD: AutoCAD/Revit/Archicad)
 * - SCD (IEC 61850 Substation Configuration Description dla SCADA)
 * - CIM (IEC 61970/61968 dla interoperability)
 *
 * Każdy format z opisem use-case w tytule (tooltip).
 */

import { useState, type RefObject } from 'react';

import { downloadSldSvg, downloadSldSvgBySelector } from './downloadSldExport';
import { generateDxf } from './exportDxf';
import { generateIec61850Scd } from './exportIec61850';
import { generateCimRdfXml } from './exportCim';

export type SldExportFormat = 'svg' | 'pdf' | 'png' | 'dxf' | 'iec61850' | 'cim';

interface FormatDescriptor {
  readonly id: SldExportFormat;
  readonly label: string;
  readonly description: string;
  readonly extension: string;
  readonly mime: string;
}

const FORMAT_DESCRIPTORS: readonly FormatDescriptor[] = [
  {
    id: 'svg',
    label: 'SVG (light_technical)',
    description: 'Wektorowy schemat dla PowerFactory / PSS/E / dokumentacji online.',
    extension: 'svg',
    mime: 'image/svg+xml',
  },
  {
    id: 'pdf',
    label: 'PDF (tytułowy blok)',
    description: 'Drukowalny schemat z blokiem tytułowym OSD/SEP.',
    extension: 'pdf',
    mime: 'application/pdf',
  },
  {
    id: 'png',
    label: 'PNG (raster)',
    description: 'Rasterowy obraz schematu (do prezentacji, e-mail).',
    extension: 'png',
    mime: 'image/png',
  },
  {
    id: 'dxf',
    label: 'DXF (CAD)',
    description: 'AutoCAD / Revit / Archicad — integracja z dokumentacją CAD.',
    extension: 'dxf',
    mime: 'application/dxf',
  },
  {
    id: 'iec61850',
    label: 'SCD (IEC 61850)',
    description: 'Substation Configuration Description dla systemów SCADA (WinCC, SIMATIC).',
    extension: 'scd.xml',
    mime: 'application/xml',
  },
  {
    id: 'cim',
    label: 'CIM (IEC 61970/61968)',
    description: 'Common Information Model — interoperability między systemami EMS/DMS.',
    extension: 'cim.xml',
    mime: 'application/rdf+xml',
  },
];

interface SldExportFormatMenuProps {
  svgRef?: RefObject<SVGSVGElement>;
  svgSelector?: string;
  projectName?: string;
  caseLabel?: string;
  className?: string;
  onExported?: (filename: string, format: SldExportFormat) => void;
  onError?: (message: string) => void;
  /** SCHEMAT-10 S4 (V12K-135/136): nadpisuje domyślną ścieżkę SVG (v2
   *  `downloadSldSvgBySelector` — substytucja WYŁĄCZNIE `currentColor`,
   *  `exportSvg.ts`). Kanwa v3 koduje kolor jako hex konkretny (nie
   *  `currentColor`), więc dostarcza WŁASNĄ funkcję (paleta pełnej tabeli
   *  tokenów + kadr fit-do-treści, `v3/export/exportPalette.ts` +
   *  `exportFrame.ts`) — inaczej dropdown reklamowałby „SVG (light_technical)"
   *  bez realnego pokrycia (phantom). Zwraca nazwę pliku jak
   *  `downloadSldSvg`, albo `null` gdy nie ma czego eksportować. Brak propa =
   *  zachowanie v2 sprzed tej karty (zero zmiany dla wołających v2). */
  onExportSvgOverride?: () => string | null;
}

function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildFileName(projectName: string | undefined, caseLabel: string | undefined, ext: string): string {
  const base = [projectName ?? 'projekt', caseLabel ?? 'wariant']
    .map((s) => s.toLowerCase().replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('_');
  return `${base || 'sld'}.${ext}`;
}

export function SldExportFormatMenu({
  svgRef,
  svgSelector = '[data-testid="sld-canvas-root"]',
  projectName,
  caseLabel,
  className,
  onExported,
  onError,
  onExportSvgOverride,
}: SldExportFormatMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<SldExportFormat | null>(null);

  const handleExport = (format: SldExportFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      const descriptor = FORMAT_DESCRIPTORS.find((d) => d.id === format)!;
      const filename = buildFileName(projectName, caseLabel, descriptor.extension);

      if (format === 'svg') {
        const out = onExportSvgOverride
          ? onExportSvgOverride()
          : svgRef?.current != null
            ? downloadSldSvg(svgRef.current, { projectName, caseLabel })
            : downloadSldSvgBySelector(svgSelector, { projectName, caseLabel });
        if (out === null) {
          onError?.('Nie znaleziono elementu SVG do eksportu.');
          return;
        }
        onExported?.(out, format);
      } else if (format === 'dxf') {
        const content = generateDxf({ title: caseLabel ?? 'SLD', lines: [], texts: [] });
        downloadText(content, filename, descriptor.mime);
        onExported?.(filename, format);
      } else if (format === 'iec61850') {
        const content = generateIec61850Scd({
          substations: [],
          projectId: projectName ?? 'Projekt',
        });
        downloadText(content, filename, descriptor.mime);
        onExported?.(filename, format);
      } else if (format === 'cim') {
        const content = generateCimRdfXml({
          substations: [],
          voltageLevels: [],
          bays: [],
          acLineSegments: [],
          powerTransformers: [],
          breakers: [],
        });
        downloadText(content, filename, descriptor.mime);
        onExported?.(filename, format);
      } else {
        // pdf/png nie obsługiwane przez ten dropdown (osobne kanały)
        onError?.(`Format ${format.toUpperCase()} eksportowany przez dedykowany kanał (SldExportPdf/Png).`);
      }
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
          {FORMAT_DESCRIPTORS.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                role="menuitem"
                disabled={busy !== null}
                onClick={() => handleExport(d.id)}
                title={d.description}
                data-testid={`sld-export-format-${d.id}`}
                className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm text-scada-text hover:bg-scada-panel disabled:opacity-50"
              >
                <span className="font-semibold">{d.label}</span>
                <span className="ml-auto text-[10px] text-scada-muted">.{d.extension}</span>
                {busy === d.id ? <span className="text-[10px] text-amber-400">…</span> : null}
              </button>
              <p className="px-2 pb-1 text-[10px] text-scada-muted">{d.description}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
