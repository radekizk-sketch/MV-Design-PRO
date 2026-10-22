import { useCallback, useMemo, useState, useEffect } from 'react';

import { STATION_INTERNAL_PANEL_MAX_WIDTH_PX } from '../canvas/toolbarLayout';
import { LvDomainView } from './LvDomainView';
import { fetchLvDomainProjectionV1 } from './projectionApi';
import type { LvDomainProjectionV1 } from './types';
import {
  operacjaBezposredniaNn,
  powodyBlokadyNn,
  resolveTematMenuNn,
  type TematMenuNn,
  type TrafienieNn,
} from './operacjeNn';
import { useThemeModeStore } from '../../../../ui2/theme/themeMode';
import { SldContextMenuController } from '../../../context-menu/SldContextMenuController';
import { useAppStateStore } from '../../../app-state';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useSldActionExecutor } from '../../shared/sldActionExecutor';
import { notify } from '../../../notifications/store';

/** Szerokość portalu = szerokość szuflady „wnętrze stacji” (jedna stała, `toolbarLayout`). */
export const LV_DOMAIN_PORTAL_MAX_WIDTH_PX = STATION_INTERNAL_PANEL_MAX_WIDTH_PX;

export interface LvDomainPortalProps {
  readonly caseId: string;
  readonly stationRef: string;
  readonly runId?: string | null;
  readonly scenario?: 'MAX' | 'MIN';
  readonly width: number;
  readonly height: number;
  readonly onClose: () => void;
  /** Tryb podglądu schematu — pozycje menu zmieniające model są blokowane przez wykonawcę. */
  readonly readOnly?: boolean;
}

interface ZadanieMenuNn {
  readonly temat: TematMenuNn;
  readonly clientX: number;
  readonly clientY: number;
}

export function LvDomainPortal({
  caseId,
  stationRef,
  runId = null,
  scenario = 'MAX',
  width,
  height,
  onClose,
  readOnly = false,
}: LvDomainPortalProps): JSX.Element {
  const [projection, setProjection] = useState<LvDomainProjectionV1 | null>(null);
  // Rewizja migawki modelu: zmiana modelu (operacja z menu tego schematu albo z innego
  // miejsca) odświeża projekcję nN — bez tego schemat pokazywałby model sprzed zmiany.
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const activeMode = useAppStateStore((state) => state.activeMode);
  const handleAction = useSldActionExecutor({ readOnly });
  const [menu, setMenu] = useState<ZadanieMenuNn | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Paleta rysunku domeny nN idzie z motywu POWŁOKI — tak samo jak paleta
  // kanwy SN (`SldCanvasV3Workspace`). Bez tego jasna powłoka pokazywałaby
  // czarny arkusz nN: deklaracja motywu bez pokrycia.
  const themeMode = useThemeModeStore((state) => state.mode);

  // Otwarcie innej stacji / przebiegu = nowa projekcja od zera (stan „ładowanie").
  useEffect(() => {
    setProjection(null);
    setError(null);
  }, [caseId, runId, scenario, stationRef]);

  useEffect(() => {
    const controller = new AbortController();
    fetchLvDomainProjectionV1({
      caseId,
      stationRef,
      runId,
      scenario,
      signal: controller.signal,
    })
      .then((wynik) => {
        setProjection(wynik);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'Nie udało się otworzyć domeny nN.');
      });
    return () => controller.abort();
  }, [caseId, runId, scenario, stationRef, snapshot]);

  // Temat menu, blokady pozycji i ładunek operacji bezpośredniej — wszystkie z grafu
  // projekcji, z którego rysuje się schemat (jedno źródło topologii i ról aparatów).
  const graf = projection?.graph ?? null;
  const onMenuKontekstowe = useCallback(
    (trafienie: TrafienieNn, clientX: number, clientY: number) => {
      const temat = resolveTematMenuNn(trafienie, graf);
      setMenu(temat ? { temat, clientX, clientY } : null);
    },
    [graf],
  );
  const kontekstMenu = useMemo(
    () => (menu ? { powodyBlokadyNn: powodyBlokadyNn(menu.temat.kind, menu.temat.ref, graf) } : undefined),
    [menu, graf],
  );
  const zamknijMenu = useCallback(() => setMenu(null), []);

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
        <LvDomainView
          projection={projection}
          width={width}
          height={height}
          theme={themeMode}
          onMenuKontekstowe={onMenuKontekstowe}
        />
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
      <SldContextMenuController
        request={menu ? { kind: menu.temat.kind, elementId: menu.temat.ref, clientX: menu.clientX, clientY: menu.clientY } : null}
        elementName={menu?.temat.nazwa ?? undefined}
        mode={activeMode}
        context={kontekstMenu}
        onAction={(actionId, kind, elementId) => {
          // Pozycja bezpośrednia (scal / kopiuj odpływ): ładunek z TEJ SAMEJ funkcji, z której
          // menu wyliczyło blokadę (`powodyBlokadyNn`), na tym samym grafie projekcji —
          // wykonawca dostaje gotowy wynik, nie liczy go drugi raz z innego źródła.
          const powod = kontekstMenu?.powodyBlokadyNn[actionId];
          if (typeof powod === 'string') notify(powod, 'warning');
          else if (powod === null) handleAction(actionId, kind, elementId, operacjaBezposredniaNn(actionId, elementId, graf));
          else handleAction(actionId, kind, elementId);
          zamknijMenu();
        }}
        onClose={zamknijMenu}
      />
    </section>
  );
}
