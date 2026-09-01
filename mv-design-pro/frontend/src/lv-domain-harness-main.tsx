/**
 * Screenshot Harness — LvDomainView (karta T5b/T5b-2, §0 rozstrzygnięcie 3:
 * "Bez wpięcia nawigacji (T5c) — deterministyczny harness zrzutowy (wzorzec
 * screenshot-harness) na fixturze wieloźródłowej").
 *
 * Wzorzec IDENTYCZNY z `screenshot-harness-main.tsx` (standalone entry HTML,
 * `?fixture=`/`?theme=` query params, `data-status` na korzeniu dla
 * Playwright) — WŁASNA kanwa domeny nN (`LvDomainView`), nie `SldCanvasV3`;
 * ZERO fetch/routing/kamery (kontrakt komponentu, patrz `LvDomainView.tsx`).
 *
 * Parametry:
 *  - `?fixture=` wybiera fixture:
 *     `multi` (domyślna) — 2×TR + sprzęgło + PV bezpośredni + podrozdzielnica
 *       + boundary_link (`multiSourceDomain.ts`);
 *     `stationC` — incomer JAWNY (QF-TR1) + trzy odpływy w pełnym torze + PV
 *       w PEŁNYM torze (zabezpieczenie+kabel do PCC-LV) — `stationBoardDomain.ts`;
 *     `island` — energizacja i wyspy: szyna BEZ NAPIĘCIA za otwartym
 *       łącznikiem + wyspa zasilana wyłącznie z DER (`islandDomain.ts`).
 *  - `?qbc=open|closed` (WYŁĄCZNIE fixture `multi`) nadpisuje stan sprzęgła
 *    `coupler` — dowód hard-check #1/#2 (QBC OPEN→CLOSED zmienia rysunek).
 *  - `?overlay=` wybiera nakładkę startową (patrz `LvDomainOverlayId`),
 *    domyślnie SLD czysty (bez nakładki, werdykt).
 *  - `?lod=0|1|2` wybiera poziom szczegółowości projekcji (domyślnie 2 —
 *    pełny). Geometria jest ta sama na każdym poziomie; różni się WYŁĄCZNIE
 *    warstwa etykiet/opisu i postać nakładki wyników.
 *  - `?theme=light|dark` przełącza motyw rysunku (kanoniczne tryby powłoki
 *    `light_technical`/`dark_scada`) — paleta kanwy IDZIE Z MOTYWU.
 *
 * Used by: e2e/lv-domain-screenshot.spec.ts.
 */
import { createRoot } from 'react-dom/client';

import { LvDomainView } from './ui/sld/v3/lv-domain/LvDomainView';
import { paletaNnDlaMotywu } from './ui/sld/v3/lv-domain/visualGrammar';
import { ISLAND_DOMAIN_UPSTREAM_EQUIVALENTS, ISLAND_DOMAIN_VIEW } from './ui/sld/v3/lv-domain/fixtures/islandDomain';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS } from './ui/sld/v3/lv-domain/fixtures/multiSourceDomain';
import { buildLvDomainProjectionFixture } from './ui/sld/v3/lv-domain/fixtures/projectionFixture';
import { STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS } from './ui/sld/v3/lv-domain/fixtures/stationBoardDomain';
import type { PoziomLod } from './ui/sld/v3/lv-domain/visualGrammar';
import type { LvDomainGraphView, LvDomainOverlayId, UpstreamEquivalentSnapshot } from './ui/sld/v3/lv-domain/types';
import type { ThemeMode } from './ui2/theme/themeMode';

const params = new URLSearchParams(window.location.search);

// Motyw: atrybut `data-theme` na dokumencie (styk z powłoką) ORAZ paleta
// kanwy — jedno źródło, żeby zrzut jasny NIE był ciemnym rysunkiem na jasnej
// stronie (deklaracja motywu bez pokrycia była zastanym długiem tej kanwy).
const theme: ThemeMode = params.get('theme') === 'light' ? 'light_technical' : 'dark_scada';
document.documentElement.setAttribute('data-theme', theme);
const paleta = paletaNnDlaMotywu(theme);
document.documentElement.style.background = paleta.tlo;
document.body.style.background = paleta.tlo;

const OVERLAY_IDS: readonly LvDomainOverlayId[] = ['loads', 'voltageDrop', 'shortCircuit', 'swz'];

function readOverlayOverride(): LvDomainOverlayId | null {
  const raw = params.get('overlay');
  return (OVERLAY_IDS as readonly string[]).includes(raw ?? '') ? (raw as LvDomainOverlayId) : null;
}

function readFixtureId(): 'multi' | 'stationC' | 'island' {
  const raw = params.get('fixture');
  if (raw === 'stationC') return 'stationC';
  if (raw === 'island') return 'island';
  return 'multi';
}

function readQbcOverride(): 'open' | 'closed' | null {
  const raw = params.get('qbc');
  return raw === 'open' || raw === 'closed' ? raw : null;
}

function readLod(): PoziomLod {
  const raw = params.get('lod');
  if (raw === '0') return 0;
  if (raw === '1') return 1;
  return 2;
}

function viewWithQbcOverride(view: LvDomainGraphView, qbc: 'open' | 'closed' | null): LvDomainGraphView {
  if (!qbc || view.status !== 'OK') return view;
  return { ...view, branches: view.branches.map((b) => (b.ref_id === 'coupler' ? { ...b, status: qbc } : b)) };
}

const FIXTURES: Readonly<Record<'multi' | 'stationC' | 'island', {
  readonly view: LvDomainGraphView;
  readonly upstream: readonly UpstreamEquivalentSnapshot[];
}>> = {
  multi: { view: MULTI_SOURCE_DOMAIN_VIEW, upstream: MULTI_SOURCE_UPSTREAM_EQUIVALENTS },
  stationC: { view: STATION_BOARD_DOMAIN_VIEW, upstream: STATION_BOARD_UPSTREAM_EQUIVALENTS },
  island: { view: ISLAND_DOMAIN_VIEW, upstream: ISLAND_DOMAIN_UPSTREAM_EQUIVALENTS },
};

function HarnessRoot(): JSX.Element {
  const fixtureId = readFixtureId();
  const qbc = readQbcOverride();
  const lod = readLod();
  const fixture = FIXTURES[fixtureId];
  const view = fixtureId === 'multi' ? viewWithQbcOverride(fixture.view, qbc) : fixture.view;
  const projection = buildLvDomainProjectionFixture({ graph: view, upstreamEquivalents: fixture.upstream });

  return (
    <div
      id="lv-domain-harness-root"
      data-testid="lv-domain-harness-root"
      data-fixture={fixtureId}
      data-qbc={qbc ?? 'default'}
      data-lod={lod}
      data-theme-mode={theme}
    >
      <LvDomainView
        projection={projection}
        initialOverlay={readOverlayOverride()}
        lod={lod}
        theme={theme}
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
rootEl.style.background = paleta.tlo;
createRoot(rootEl).render(<HarnessRoot />);
