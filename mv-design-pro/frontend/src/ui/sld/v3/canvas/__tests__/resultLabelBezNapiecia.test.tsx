/**
 * Karta GPZ-H5-SLD (d): szyna wyspy BEZ ŹRÓDŁA ZASILANIA na schemacie — stan „bez napięcia”
 * z przyczyną zamiast pustego miejsca (dawniej punkt bez metryk nie dostawał etykiety, więc
 * sekcja SN odcięta od transformatora wyglądała na schemacie jak sekcja bez wyniku).
 *
 * Fikstury z ŻYWEGO scalonego backendu (pomiar 2026-10-22, serwer `uvicorn` na drzewie karty):
 * GPZ H5 110/15 kV, rezerwa transformatorowa jawna (TR2 rezerwowy, wyłącznik jego pola SN
 * normalnie otwarty), scenariusz łączeniowy „łącznik szyn SN otwarty” — sekcja SN 2 nie ma
 * w stanie łączników biegu żadnego źródła. `*.enm.json` = migawka biegu
 * (`GET /api/analysis-runs/{id}/snapshot`), `*.results_v1.json` = `GET /api/execution/runs/
 * {id}/results/v1` biegu rozpływu i biegu zwarcia 3F tego samego scenariusza.
 *
 * Ścieżka natywna: `fetch` zaślepiony odpowiedzią serwera → `pobierzWynikBiegu` →
 * `payloadNakladki` → magazyn nakładki → kanwa (`SldCanvasV3Workspace`) → DOM.
 *
 * Iloczyn cech: rodzaj biegu (rozpływ × zwarcie — od karty GPZ-H5-APARATURA oba wiersze
 * `element_results` niosą znacznik stanu z jednej reguły backendu
 * `enm.canonical_analysis.znaczniki_wiersza`, a nakładka odznakę o dotkliwości WARNING
 * z `domain.result_contract_v1.ZNACZNIKI_STANU_NAKLADKI`) × szyna (odcięta × zasilana) × poziom
 * szczegółu (LOD 1 — jedna linia × LOD 2 — linia przyczyny).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useAppStateStore } from '../../../../app-state';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { useOverlayStore } from '../../../../sld-overlay/overlayStore';
import { useSldDeltaOverlayStore } from '../../../../sld-overlay/sldDeltaOverlayStore';
import { wyczyscRejestrBiegow } from '../../../../../test/biegNieaktualny';
import {
  payloadNakladki,
  pobierzWynikBiegu,
  refyBezNapiecia,
} from '../../../../../ui2/wyniki/kontekst/kontekstWyniku';
import { LINIE_BEZ_NAPIECIA } from '../resultLabels';

const here = dirname(fileURLToPath(import.meta.url));
const czytaj = <T,>(nazwa: string): T =>
  JSON.parse(readFileSync(resolve(here, 'fixtures', nazwa), 'utf8')) as T;

const enm = czytaj<EnergyNetworkModel>('gpzH5RezerwaJawnaBezLsSn.enm.json');
const ROZPLYW = czytaj<{ run_id: string }>('gpzH5RezerwaJawnaBezLsSn.rozplyw.results_v1.json');
const ZWARCIE = czytaj<{ run_id: string }>('gpzH5RezerwaJawnaBezLsSn.zwarcie.results_v1.json');

const GPZ = (enm.substations ?? []).find((s) => (s.gpz_hv_sections ?? []).length > 0)!;
const [SZYNA_SN_1, SZYNA_SN_2] = [...(GPZ.gpz_sections ?? [])]
  .sort((a, b) => a.order - b.order)
  .map((s) => s.bus_ref);

async function wczytaj(odpowiedz: { run_id: string }) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => odpowiedz,
  } as Response);
  return pobierzWynikBiegu(odpowiedz.run_id);
}

function etykietaPunktu(container: HTMLElement, ref: string): SVGGElement | null {
  return container.querySelector(`g[data-testid^="sld-v3-result-label-"][data-result-ref="${ref}"]`);
}

/** Linie TREŚCI etykiety (bez znacznika dotkliwości „⚠" w rogu bloku — ten ma własny test). */
function linie(etykieta: SVGGElement | null): string[] {
  return Array.from(etykieta?.querySelectorAll('text[data-testid^="sld-v3-result-line-"]') ?? []).map(
    (t) => t.textContent ?? '',
  );
}

/** Znacznik dotkliwości z nakładki backendu: atrybut bloku i glif „⚠" (sygnał nie-kolorowy). */
function znacznikDotkliwosci(etykieta: SVGGElement | null): { severity: string | null; glif: boolean } {
  return {
    severity: etykieta?.getAttribute('data-result-severity') ?? null,
    glif: etykieta?.querySelector('text[data-testid^="sld-v3-result-exceedance-"]') != null,
  };
}

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  useSnapshotStore.getState().reset();
  wyczyscRejestrBiegow();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useOverlayStore.getState().clearOverlay();
  useSldDeltaOverlayStore.getState().wyczyscRoznice();
  useAppStateStore.getState().reset();
  useSnapshotStore.setState({ snapshot: enm });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useRawResultOverlayStore.getState().clear();
});

describe('Znacznik BEZ_NAPIECIA z wyniku backendu', () => {
  it('odczyt results/v1: rozpływ — szyna odcięta i jej zacisk pola; zwarcie — szyna odcięta', async () => {
    const rozplyw = await wczytaj(ROZPLYW);
    expect(rozplyw.szynyBezNapiecia).toContain(SZYNA_SN_2);
    expect(rozplyw.szynyBezNapiecia).not.toContain(SZYNA_SN_1);
    expect([...rozplyw.szynyBezNapiecia]).toEqual([...rozplyw.szynyBezNapiecia].sort());
    expect(payloadNakladki(rozplyw).bez_napiecia_refs).toEqual(rozplyw.szynyBezNapiecia);
    // Zwarcie: luka kontraktu zgłoszona przez kartę GPZ-H5-SLD (d) domknięta kartą
    // GPZ-H5-APARATURA — wiersz zwarcia węzła bez impedancji do odniesienia niesie znacznik
    // z przyczyny nieraportowalności (`znaczniki_wiersza_zwarcia`), więc `element_results`
    // zwarcia też go niesie. Front nadal nie dopowiada stanu z braku liczby — czyta znacznik.
    const zwarcie = await wczytaj(ZWARCIE);
    expect(zwarcie.szynyBezNapiecia).toEqual([SZYNA_SN_2]);
  });

  it('kształty wejścia: brak listy, wiersz bez flag, flagi obce, powtórzenia', () => {
    expect(refyBezNapiecia(undefined)).toEqual([]);
    expect(refyBezNapiecia({})).toEqual([]);
    expect(
      refyBezNapiecia([
        { element_ref: 'b', values: { flags: ['BEZ_NAPIECIA'] } },
        { element_ref: 'a', values: { flags: ['SLACK', 'BEZ_NAPIECIA'] } },
        { element_ref: 'b', values: { flags: ['BEZ_NAPIECIA'] } },
        { element_ref: 'c', values: { flags: ['SLACK'] } },
        { element_ref: 'd', values: {} },
        { values: { flags: ['BEZ_NAPIECIA'] } },
      ]),
    ).toEqual(['a', 'b']);
  });
});

describe('Szyna bez napięcia na kanwie (rozpływ × LOD)', () => {
  it.each([1, 2] as const)('LOD %s: sekcja odcięta „bez napięcia”, sekcja zasilana z napięciem', async (lod) => {
    const wynik = await wczytaj(ROZPLYW);
    useRawResultOverlayStore.getState().setPayload(payloadNakladki(wynik));
    const { container } = render(
      <SldCanvasV3Workspace width={1600} height={1000} lodOverride={lod} />,
    );
    const odcieta = linie(etykietaPunktu(container, SZYNA_SN_2));
    const oczekiwane = LINIE_BEZ_NAPIECIA.slice(0, lod === 2 ? 2 : 1).map((l) => l.text);
    expect(odcieta).toEqual(oczekiwane);
    expect(znacznikDotkliwosci(etykietaPunktu(container, SZYNA_SN_2))).toEqual({ severity: 'WARNING', glif: true });
    expect(znacznikDotkliwosci(etykietaPunktu(container, SZYNA_SN_1)).glif).toBe(false);
    const zasilana = linie(etykietaPunktu(container, SZYNA_SN_1));
    expect(zasilana.length).toBeGreaterThan(0);
    expect(zasilana.join(' ')).not.toContain('bez napięcia');
    expect(zasilana[0]).toMatch(/^U /);
  });

  it('zwarcie tego samego scenariusza: sekcja odcięta „bez napięcia” ze znacznika backendu, bez liczby', async () => {
    const wynik = await wczytaj(ZWARCIE);
    useRawResultOverlayStore.getState().setPayload(payloadNakladki(wynik));
    const { container } = render(<SldCanvasV3Workspace width={1600} height={1000} lodOverride={2} />);
    const odcieta = etykietaPunktu(container, SZYNA_SN_2);
    expect(linie(odcieta)).toEqual(LINIE_BEZ_NAPIECIA.map((l) => l.text));
    expect(linie(odcieta).join(' ')).not.toContain('Ik″');
    expect(znacznikDotkliwosci(odcieta)).toEqual({ severity: 'WARNING', glif: true });
    expect(linie(etykietaPunktu(container, SZYNA_SN_1))[0]).toBe('Ik″ 8,9 kA');
  });
});
