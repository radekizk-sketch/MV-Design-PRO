/**
 * Decyzja architekta 2026-11-04 pkt 2: tabela aparatów karty pola ma cztery kolumny (Aparat ·
 * Uᵣ · Iᵣ · Iₖ), a typ katalogowy, I_p, tₖ i położenie łącznika są w karcie APARATU, którą
 * otwiera klik w wiersz. Obietnica: wiersz otwiera TĘ SAMĄ kartę, co klik w symbol aparatu
 * na kanwie — ten sam kontekst inspektora (rodzaj, ref pola, ref urządzenia, temat menu
 * z symbolem aparatu), ta sama selekcja i ta sama treść karty.
 *
 * Iloczyn cech:
 *   aparat {każdy rekord `primary_devices` rysowany symbolem toru pól sieci referencyjnej
 *           — wyłącznik, rozłącznik, odłącznik, uziemnik, przekładniki, głowica…}
 *   × wejście do karty pola {wskazanie spoza kanwy (drzewo / wyszukiwarka)}
 *   × tryb {MODEL_EDIT, RESULT_VIEW}
 *   → kontekst i selekcja po kliknięciu wiersza ≡ kontekst i selekcja po kliknięciu symbolu.
 *
 * Ścieżka natywna: klik w przycisk wiersza (`fireEvent.click`, jak użytkownik) i klik
 * w uchwyt trafienia kanwy (`data-hit-for`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useAppStateStore } from '../../../app-state';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useRawResultOverlayStore } from '../../../sld-overlay/rawResultOverlayStore';
import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { buildSceneV3 } from '../../../sld/v3/scene/buildScene';
import { SldCanvasV3Workspace } from '../../../sld/v3/canvas/SldCanvasV3Workspace';
import { buildCanvasModelIndex, elementTypeForKind } from '../../../sld/v3/canvas/canvasMenuSubject';
import { useKontekstElementuKanwy } from '../../../sld/shared/kontekstElementuKanwy';
import { wskazanieAparatuPola } from '../stanPaneluElementu';
import { InspektorKanwyTestowy } from './inspektorKanwyTestowy';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '..', '..', '..', '..');

function wczytaj(sciezka: string): EnergyNetworkModel {
  const surowy = JSON.parse(readFileSync(resolve(SRC, sciezka), 'utf8')) as { readonly enm: EnergyNetworkModel } | EnergyNetworkModel;
  return 'enm' in surowy ? surowy.enm : surowy;
}

/** Dwie drogi aparatury pola w modelu: gałęzie pola (`equipment_refs`, sieć 52 stacji)
 *  i rekordy aparatów (`primary_devices`, migawka macierzy z backendu). */
const SIECI: readonly (readonly [string, EnergyNetworkModel])[] = [
  ['52 stacje (gałęzie pola)', wczytaj('ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json')],
  ['macierz (rekordy aparatów)', wczytaj('harness-fixtures/generated/macierz_scena_migawka.json')],
];

interface PrzypadekAparatu {
  readonly siec: string;
  readonly enm: EnergyNetworkModel;
  readonly symbolId: string;
  readonly testId: string;
  readonly poleRef: string;
  readonly aparatRef: string;
}

/** Symbole aparatów pola z refem urządzenia — jeden reprezentant na (sieć × rodzaj symbolu). */
const PRZYPADKI: readonly PrzypadekAparatu[] = SIECI.flatMap(([siec, enm]) => {
  const wgRodzaju = new Map<string, PrzypadekAparatu>();
  for (const s of buildSceneV3(enm).symbols) {
    const poleRef = s.meta?.ownerRef;
    const aparatRef = s.meta?.deviceRef;
    if (s.meta?.elementKind !== 'apparatus' || !poleRef || !aparatRef || !s.meta.testId) continue;
    const pole = (enm.bays ?? []).find((b) => b.ref_id === poleRef);
    if (!pole) continue;
    const wPolu = (pole.primary_devices ?? []).some((d) => d.device_ref === aparatRef) || pole.equipment_refs.includes(aparatRef);
    if (!wPolu || wgRodzaju.has(s.symbolId)) continue;
    wgRodzaju.set(s.symbolId, { siec, enm, symbolId: s.symbolId, testId: s.meta.testId, poleRef, aparatRef });
  }
  return [...wgRodzaju.values()];
});

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.setState({ activeCaseId: 'case-aparat', activeCaseResultStatus: 'NONE', activeMode: 'MODEL_EDIT' });
  act(() => useShellStore.getState().setActiveSpace('model'));
});
afterEach(() => {
  cleanup();
  useKontekstElementuKanwy.getState().wyczysc();
  useAppStateStore.setState({ activeCaseId: null, activeCaseResultStatus: 'NONE', activeMode: 'MODEL_EDIT' });
});

function montuj(enm: EnergyNetworkModel): HTMLElement {
  useSnapshotStore.setState({ snapshot: enm });
  const { container } = render(
    <>
      <SldCanvasV3Workspace width={1322} height={696} />
      <InspektorKanwyTestowy />
    </>,
  );
  return container;
}

function stanPoKliku(): { kontekst: unknown; selekcja: unknown; karta: string } {
  return {
    kontekst: useKontekstElementuKanwy.getState().kontekst,
    selekcja: useSelectionStore.getState().selectedElements,
    karta: screen.getByTestId('inspektor-karta').outerHTML,
  };
}

describe('karta pola — wiersz aparatu otwiera kartę aparatu jak klik w symbol', () => {
  it('pokrycie iloczynu: obie drogi aparatury i rodzaje łączników oraz przekładników', () => {
    for (const [siec] of SIECI) expect(PRZYPADKI.some((p) => p.siec === siec), siec).toBe(true);
    const rodzaje = new Set(PRZYPADKI.map((p) => p.symbolId));
    for (const r of ['breaker', 'disconnector', 'earthSwitch', 'currentTransformer']) expect([...rodzaje], r).toContain(r);
  });

  it('typ selekcji aparatu pochodzi z jednej funkcji kanwy', () => {
    const [p] = PRZYPADKI;
    const { zaznaczenie } = wskazanieAparatuPola(p.enm, buildCanvasModelIndex(p.enm), { rodzaj: 'aparat', poleRef: p.poleRef, aparatRef: p.aparatRef }, false);
    expect(zaznaczenie.type).toBe(elementTypeForKind('apparatus'));
  });

  describe.each(['MODEL_EDIT', 'RESULT_VIEW'] as const)('tryb %s', (tryb) => {
    it.each(PRZYPADKI)('$siec · $symbolId', ({ enm, testId, poleRef, aparatRef }) => {
      act(() => useAppStateStore.setState({ activeMode: tryb }));
      const kontener = montuj(enm);

      // Ścieżka 1: klik w symbol aparatu na kanwie.
      const uchwyt = kontener.querySelector(`[data-hit-for="${testId}"]`);
      expect(uchwyt, `uchwyt ${testId}`).not.toBeNull();
      fireEvent.click(uchwyt!, { detail: 1 });
      expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'aparat');
      const zKanwy = stanPoKliku();

      // Ścieżka 2: karta pola wskazanego spoza kanwy → klik w wiersz tego aparatu.
      act(() => {
        useKontekstElementuKanwy.getState().wyczysc();
        useSelectionStore.getState().selectElement({ id: poleRef, type: 'BaySN', name: poleRef });
      });
      expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'pole');
      const wiersz = screen
        .getAllByTestId('inspektor-karta-wiersz-aparaty')
        .find((tr) => tr.getAttribute('data-klucz') === aparatRef);
      expect(wiersz, `wiersz ${aparatRef}`).toBeDefined();
      const przycisk = wiersz!.querySelector('[data-testid="inspektor-karta-otworz-aparaty"]') as HTMLElement | null;
      expect(przycisk, 'przycisk wiersza').not.toBeNull();
      fireEvent.click(przycisk!);
      expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'aparat');
      expect(stanPoKliku()).toEqual(zKanwy);
    });
  });
});
