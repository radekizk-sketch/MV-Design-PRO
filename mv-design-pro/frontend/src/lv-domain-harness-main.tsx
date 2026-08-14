/**
 * Screenshot Harness — LvDomainView (karta T5b/T5b-2, §0 rozstrzygnięcie 3:
 * "Bez wpięcia nawigacji (T5c) — deterministyczny harness zrzutowy (wzorzec
 * screenshot-harness) na fixturze wieloźródłowej").
 *
 * Wzorzec IDENTYCZNY z `screenshot-harness-main.tsx` (standalone entry HTML,
 * `?fixture=`/`?theme=` query params, `data-status` na korzeniu dla
 * Playwright) — WŁASNA kanwa L2 (`LvDomainView`), nie `SldCanvasV3`; ZERO
 * fetch/routing/kamery (kontrakt komponentu, patrz `LvDomainView.tsx`).
 *
 * T5b-2 (18 P0, dowód wizualny B-02): `?fixture=` wybiera fixture:
 *  - `multi` (domyślna) — 2×TR + sprzęgło + PV bezpośredni + podrozdzielnica
 *    + boundary_link (`multiSourceDomain.ts`).
 *  - `stationC` — incomer JAWNY (QF-TR1) + trzy odpływy w pełnym torze + PV
 *    w PEŁNYM torze (zabezpieczenie+kabel do PCC-LV) — `stationBoardDomain.ts`.
 * `?qbc=open|closed` (WYŁĄCZNIE fixture `multi`) nadpisuje stan sprzęgła
 * `coupler` — dowód hard-check #1/#2 (QBC OPEN→CLOSED zmienia rysunek).
 * `?overlay=` wybiera nakładkę startową (patrz `LvDomainOverlayId`),
 * domyślnie SLD czysty (bez nakładki, werdykt).
 *
 * Used by: e2e/lv-domain-screenshot.spec.ts.
 */
import { createRoot } from 'react-dom/client';

import { LvDomainView } from './ui/sld/v3/lv-domain/LvDomainView';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS } from './ui/sld/v3/lv-domain/fixtures/multiSourceDomain';
import { STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS } from './ui/sld/v3/lv-domain/fixtures/stationBoardDomain';
import type { LvDomainGraphView, LvDomainOverlayId } from './ui/sld/v3/lv-domain/types';

// Karta Z-3 (parytet screenshot-harness-main.tsx): `?theme=` na dokumencie
// dla zrzutów sparowanych jasny/ciemny — kanwa L2 ma stałe tło techniczne
// (jak SldCanvasV3), atrybut ustawiony dla spójności strony oceny.
const theme = new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light_technical' : 'dark_scada';
document.documentElement.setAttribute('data-theme', theme);

const OVERLAY_IDS: readonly LvDomainOverlayId[] = ['loads', 'voltageDrop', 'shortCircuit', 'swz'];

function readOverlayOverride(): LvDomainOverlayId | null {
  const raw = new URLSearchParams(window.location.search).get('overlay');
  return (OVERLAY_IDS as readonly string[]).includes(raw ?? '') ? (raw as LvDomainOverlayId) : null;
}

function readFixtureId(): 'multi' | 'stationC' {
  const raw = new URLSearchParams(window.location.search).get('fixture');
  return raw === 'stationC' ? 'stationC' : 'multi';
}

function readQbcOverride(): 'open' | 'closed' | null {
  const raw = new URLSearchParams(window.location.search).get('qbc');
  return raw === 'open' || raw === 'closed' ? raw : null;
}

function viewWithQbcOverride(view: LvDomainGraphView, qbc: 'open' | 'closed' | null): LvDomainGraphView {
  if (!qbc || view.status !== 'OK') return view;
  return { ...view, branches: view.branches.map((b) => (b.ref_id === 'coupler' ? { ...b, status: qbc } : b)) };
}

function HarnessRoot(): JSX.Element {
  const fixtureId = readFixtureId();
  const qbc = readQbcOverride();
  const view =
    fixtureId === 'stationC'
      ? STATION_BOARD_DOMAIN_VIEW
      : viewWithQbcOverride(MULTI_SOURCE_DOMAIN_VIEW, qbc);
  const upstreamEquivalents = fixtureId === 'stationC' ? STATION_BOARD_UPSTREAM_EQUIVALENTS : MULTI_SOURCE_UPSTREAM_EQUIVALENTS;

  return (
    <div id="lv-domain-harness-root" data-testid="lv-domain-harness-root" data-fixture={fixtureId} data-qbc={qbc ?? 'default'}>
      <LvDomainView
        rootStationId={view.station_ref}
        scenarioId="lv-domain-harness-demo"
        view={view}
        upstreamEquivalents={upstreamEquivalents}
        initialOverlay={readOverlayOverride()}
        /* T5b-4 (P0-V1): REALNY viewport przeglądarki — occupancy/centrowanie
           liczy się względem prawdziwego ekranu (Playwright ustawia stały
           viewport, więc zrzuty pozostają deterministyczne). */
        width={window.innerWidth}
        height={window.innerHeight}
      />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('lv-domain-harness: brak elementu #root');
createRoot(rootEl).render(<HarnessRoot />);
