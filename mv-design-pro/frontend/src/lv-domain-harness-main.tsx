/**
 * Screenshot Harness — LvDomainView (karta T5b, §0 rozstrzygnięcie 3:
 * "Bez wpięcia nawigacji (T5c) — deterministyczny harness zrzutowy (wzorzec
 * screenshot-harness) na fixturze wieloźródłowej").
 *
 * Wzorzec IDENTYCZNY z `screenshot-harness-main.tsx` (standalone entry HTML,
 * `?fixture=`/`?theme=` query params, `data-status` na korzeniu dla
 * Playwright) — WŁASNA kanwa L2 (`LvDomainView`), nie `SldCanvasV3`; ZERO
 * fetch/routing/kamery (kontrakt komponentu, patrz `LvDomainView.tsx`).
 *
 * Fixtura domyślna: `MULTI_SOURCE_DOMAIN_VIEW` (2×TR + sprzęgło + PV +
 * podrozdzielnica + boundary_link) — karta §0 pkt 4 "test wieloźródłowości
 * OBOWIĄZKOWY". `?overlay=` wybiera nakładkę startową (patrz
 * `LvDomainOverlayId`), domyślnie SLD czysty (bez nakładki, werdykt).
 *
 * Used by: e2e/lv-domain-screenshot.spec.ts.
 */
import { createRoot } from 'react-dom/client';

import { LvDomainView } from './ui/sld/v3/lv-domain/LvDomainView';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS } from './ui/sld/v3/lv-domain/fixtures/multiSourceDomain';
import type { LvDomainOverlayId } from './ui/sld/v3/lv-domain/types';

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

function HarnessRoot(): JSX.Element {
  return (
    <div id="lv-domain-harness-root" data-testid="lv-domain-harness-root">
      <LvDomainView
        rootStationId={MULTI_SOURCE_DOMAIN_VIEW.station_ref}
        scenarioId="lv-domain-harness-demo"
        view={MULTI_SOURCE_DOMAIN_VIEW}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
        initialOverlay={readOverlayOverride()}
        width={1024}
        height={768}
      />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('lv-domain-harness: brak elementu #root');
createRoot(rootEl).render(<HarnessRoot />);
