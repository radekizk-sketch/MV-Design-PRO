/**
 * T2-WYNIKI (PLAN_SLD_NN_TOPOLOGIA_2026-08 §T2) — test INTEGRACYJNY: klik
 * NATYWNY (`userEvent`, wymóg karty §Testy) w aparat odpływu nN na kanwie v3
 * otwiera ISTNIEJĄCY mechanizm (`SldDetailDrawer`, zakładka „Wyniki odpływu
 * nN") z panelem wyników — zero nowego kanału selekcji.
 *
 * Fixture: `gpzFeeder.enm.json` (REALNA, już renderowana przez pipeline v3 w
 * `theme/__tests__/palette.test.ts`) ROZSZERZONA w PAMIĘCI TESTU o jeden
 * aparat odpływu nN (switch, catalog_namespace `APARAT_NN_MCB`,
 * `materialized_params` — TA SAMA struktura co backendowy test SWZ,
 * `test_service.py::_enm`) — plik fixture NIETKNIĘTY.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';

afterEach(() => {
  cleanup();
  useRawResultOverlayStore.getState().clear();
});

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', 'scene', '__tests__', 'fixtures', 'gpzFeeder.enm.json');
const baseEnm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const STATION_REF = 'stn/980a625dd13777cd339a1a173a2a2864/station';
const NN_BUS_REF = 'stn/980a625dd13777cd339a1a173a2a2864/nn_bus';
const BREAKER_REF = 'brc/nn-mcb-1';
const FAR_BUS_REF = 'bus/nn-feeder-far';

/** Rozszerzenie ENM o JEDEN aparat odpływu nN katalogowo związany (MCB) —
 *  TA SAMA struktura pól co backendowy test SWZ (skopiowana, patrz nagłówek
 *  modułu). Fixture bazowa NIETKNIĘTA (kopia głęboka przez JSON round-trip). */
function enmWithNnFeeder(): EnergyNetworkModel {
  const clone = JSON.parse(JSON.stringify(baseEnm)) as EnergyNetworkModel;
  clone.buses = [
    ...clone.buses,
    { id: FAR_BUS_REF, ref_id: FAR_BUS_REF, name: 'Odpływ nN — punkt daleki', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
  ];
  clone.branches = [
    ...clone.branches,
    {
      id: BREAKER_REF, ref_id: BREAKER_REF, name: 'MCB odpływu 1', tags: [], meta: {},
      type: 'breaker', from_bus_ref: NN_BUS_REF, to_bus_ref: FAR_BUS_REF, status: 'closed',
      catalog_namespace: 'APARAT_NN_MCB',
      materialized_params: { in_a: 16, curve_class: 'B' },
    } as unknown as EnergyNetworkModel['branches'][number],
  ];
  return clone;
}

function uchwytTrafienia(container: HTMLElement, testId: string): Element | null {
  return container.querySelector(`[data-hit-for="${testId}"][data-hit-role="obrys"]`);
}

describe('T2-WYNIKI — klik natywny w aparat odpływu nN otwiera panel wyników (mechanizm ISTNIEJĄCY)', () => {
  it('scena v3 renderuje symbol nnBreaker z ownerRef = ref ENM aparatu (dowód wpięcia w istniejący klik)', () => {
    const enm = enmWithNnFeeder();
    const scene = buildSceneV3(enm, 2);
    const sym = scene.symbols.find((s) => s.symbolId === 'nnBreaker' && s.meta?.ownerRef === BREAKER_REF);
    expect(sym, 'symbol nnBreaker z ownerRef aparatu obecny na L2').toBeTruthy();
    expect(sym!.meta!.elementKind).toBe('apparatus');
  });

  it('klik natywny (userEvent) w symbol nnBreaker otwiera SldDetailDrawer z zakładką „Wyniki odpływu nN" i panelem sekcji', async () => {
    const enm = enmWithNnFeeder();
    const scene = buildSceneV3(enm, 2);
    const sym = scene.symbols.find((s) => s.symbolId === 'nnBreaker' && s.meta?.ownerRef === BREAKER_REF);
    expect(sym).toBeTruthy();

    useSnapshotStore.getState().reset();
    useSelectionStore.getState().clearSelection();
    useRawResultOverlayStore.getState().clear();
    useSnapshotStore.setState({ snapshot: enm });

    const user = userEvent.setup();
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} lodOverride={2} />);

    const hit = uchwytTrafienia(container, sym!.meta!.testId!);
    expect(hit, 'uchwyt trafienia symbolu nnBreaker obecny w DOM').toBeTruthy();

    // KLIK NATYWNY (userEvent, nie fireEvent syntetyczny) — Zero-Debt Rule
    // pkt 5: test interakcji zaczyna od ścieżki natywnej.
    await user.click(hit!);

    const tab = await screen.findByTestId('sld-v2-detail-drawer-tab-wyniki-nn');
    expect(tab).toBeTruthy();
    await user.click(tab);

    expect(screen.getByTestId('nn-circuit-results-panel')).toBeTruthy();
    expect(screen.getByTestId('nn-circuit-section-swz')).toBeTruthy();
    expect(screen.getByTestId('nn-circuit-section-ib')).toBeTruthy();
    // Brak przebiegu załadowany ⇒ Ib w stanie brak_wynikow z akcją realną.
    expect(screen.getByTestId('nn-circuit-section-ib-brak')).toBeTruthy();
    expect(screen.getByTestId('nn-circuit-section-ib-akcja')).toBeTruthy();
  });
});
