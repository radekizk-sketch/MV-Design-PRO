import { useEffect, useMemo, useRef, useState } from 'react';

import type { EnergyNetworkModel } from '../../types/enm';
import { projectEnmSnapshotToSld } from '../sld/enmSnapshotToSldSymbols';
import { SLDView } from '../sld/SLDView';

interface WizardSldPreviewProps {
  enm: EnergyNetworkModel;
}

export function WizardSldPreview({ enm }: WizardSldPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 720, height: 420 });

  const projection = useMemo(
    () => projectEnmSnapshotToSld((enm ?? null) as unknown as Record<string, unknown> | null),
    [enm],
  );
  const symbols = projection.symbols;

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setCanvasSize({
        width: Math.max(Math.floor(entry.contentRect.width), 640),
        height: Math.max(Math.floor(entry.contentRect.height), 320),
      });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (symbols.length === 0) {
    return (
      <div
        data-testid="wizard-sld-preview"
        className="rounded-md border border-dashed border-chrome-300 bg-white px-6 py-8 text-center"
      >
        <div className="text-sm font-medium text-chrome-600">Brak elementow do wyswietlenia</div>
        <div className="mt-1 text-xs text-chrome-400">
          Dodaj GPZ, pola, odcinki i stacje w poprzednich krokach.
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="wizard-sld-preview"
      className="overflow-hidden rounded-md border border-chrome-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-chrome-200 px-3 py-2 text-xs text-chrome-500">
        <span>Kanoniczny schemat jednokreskowy</span>
        <span>{symbols.length} elementow</span>
      </div>
      <div ref={containerRef} className="h-[420px] bg-slate-950/95">
        <SLDView
          symbols={symbols}
          connections={projection.connections}
          canonicalAnnotations={projection.canonicalAnnotations}
          width={canvasSize.width}
          height={canvasSize.height}
          fitOnMount={true}
          showGrid={true}
        />
      </div>
    </div>
  );
}
