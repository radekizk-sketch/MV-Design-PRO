import { useEffect, useState } from 'react';

import { LvDomainView } from './LvDomainView';
import { fetchLvDomainProjectionV1 } from './projectionApi';
import type { LvDomainProjectionV1 } from './types';
import { useThemeModeStore } from '../../../../ui2/theme/themeMode';

export const LV_DOMAIN_PORTAL_MAX_WIDTH_PX = 760;

export interface LvDomainPortalProps {
  readonly caseId: string;
  readonly stationRef: string;
  readonly runId?: string | null;
  readonly scenario?: 'MAX' | 'MIN';
  readonly width: number;
  readonly height: number;
  readonly onClose: () => void;
}

export function LvDomainPortal({
  caseId,
  stationRef,
  runId = null,
  scenario = 'MAX',
  width,
  height,
  onClose,
}: LvDomainPortalProps): JSX.Element {
  const [projection, setProjection] = useState<LvDomainProjectionV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Paleta rysunku domeny nN idzie z motywu POWŁOKI — tak samo jak paleta
  // kanwy SN (`SldCanvasV3Workspace`). Bez tego jasna powłoka pokazywałaby
  // czarny arkusz nN: deklaracja motywu bez pokrycia.
  const themeMode = useThemeModeStore((state) => state.mode);

  useEffect(() => {
    const controller = new AbortController();
    setProjection(null);
    setError(null);
    fetchLvDomainProjectionV1({
      caseId,
      stationRef,
      runId,
      scenario,
      signal: controller.signal,
    })
      .then(setProjection)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'Nie udało się otworzyć domeny nN.');
      });
    return () => controller.abort();
  }, [caseId, runId, scenario, stationRef]);

  return (
    <section
      data-testid="lv-domain-portal"
      data-station-ref={stationRef}
      data-loading={projection === null && error === null ? 'true' : 'false'}
      className="relative overflow-auto rounded border border-scada-border bg-scada-panel shadow-2xl"
      style={{ width, height }}
      aria-label={`Domena nN stacji ${stationRef}`}
    >
      <button
        type="button"
        onClick={onClose}
        data-testid="lv-domain-portal-close"
        className="absolute right-3 top-3 z-50 rounded border border-scada-border bg-scada-surface px-3 py-1 text-sm text-scada-text hover:bg-scada-hover-nav"
      >
        Zamknij
      </button>
      {projection ? (
        <LvDomainView projection={projection} width={width} height={height} theme={themeMode} />
      ) : error ? (
        <div
          data-testid="lv-domain-portal-error"
          className="p-6 pr-24 font-mono-eng text-sm text-status-important"
        >
          {error}
        </div>
      ) : (
        <div
          data-testid="lv-domain-portal-loading"
          className="p-6 pr-24 font-mono-eng text-sm text-scada-muted"
        >
          Ładowanie domeny nN…
        </div>
      )}
    </section>
  );
}
