/**
 * K6 (Z-12) — złożenie prawego inspektora dla obiektu schematu jako ILOCZYN CECH:
 *
 *   rodzaj obiektu {stacja · pole · transformator}
 *   × tryb {MODEL_EDIT — edycja operacją domenową · RESULT_VIEW — tylko odczyt}.
 *
 * Ścieżka natywna: klik w uchwyt trafienia kanwy (`data-hit-for`), jak w aplikacji.
 * Przypina trzy obietnice karty K6:
 *  - kolejność sekcji: nagłówek → karta techniczna → wyniki → działania (na końcu);
 *  - działania są ZWINIĘTE (`<details>` bez `open`) i rozwijają się jednym klikiem;
 *  - przycisk „Zmień" istnieje wyłącznie w trybie edycji modelu i otwiera operację domenową
 *    `update_element_parameters` z refem i polem obiektu (bez atrapy w trybie wyników).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useAppStateStore } from '../../../app-state';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useRawResultOverlayStore } from '../../../sld-overlay/rawResultOverlayStore';
import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { useNetworkBuildStore } from '../../networkBuildStore';
import { buildSceneV3, type SceneV3 } from '../../../sld/v3/scene/buildScene';
import { SldCanvasV3Workspace } from '../../../sld/v3/canvas/SldCanvasV3Workspace';
import { useKontekstElementuKanwy } from '../../../sld/shared/kontekstElementuKanwy';
import { InspektorKanwyTestowy } from './inspektorKanwyTestowy';
import {
  powiekszKolkiemDoSkali,
  punktCeluTrafienia,
  testIdZSelektoraUchwytu,
} from '../../../sld/v3/canvas/__tests__/kameraTestowa';

const here = dirname(fileURLToPath(import.meta.url));
const SIEC = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', '..', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;


/**
 * K3 × K6: klik adresujący POLE (nie pojedyncze urządzenie). Aparatura pola pochodzi wyłącznie
 * z rekordów modelu, więc symbol bez `deviceRef` istnieje już tylko jako sylwetka
 * `bayNoEquipment` („brak danych wyposażenia pola") pola, które ma rekord `Bay` w modelu.
 * Dawny predykat szukał łącznika pola stacji z konwencji (bez `deviceRef`) — po K3 takiego
 * symbolu nie ma: łącznik pola stacji niesie ref urządzenia i otwiera kartę aparatu.
 */
function jestPoleBezRekorduAparatu(s: SceneV3['symbols'][number]): boolean {
  return (
    s.symbolId === 'bayNoEquipment' &&
    s.meta?.elementKind === 'apparatus' &&
    !s.meta?.deviceRef &&
    (SIEC.bays ?? []).some((b) => b.ref_id === s.meta?.ownerRef)
  );
}
/** Uchwyt stacji jednej sceny (karta SLD-SKALA-I-NAWIGACJA R1): obrys trafienia napisu
 *  identyfikacji `<ref>#name-row-0` — dawniej zwinięty symbol stacji widoku ogólnego. */
function stacja(scena: SceneV3): string {
  // Pierwsza stacja obchodu, która MA napis identyfikacji w pasie nazw — GPZ (pierwszy w obchodzie)
  // ma nagłówek strefy GPZ, nie wiersz `#name-row-0`, więc wskazanie „pierwszy w obchodzie” celowało
  // w nieistniejący uchwyt.
  const ref = scena.meta.stationTraversalOrder.find((r) => scena.labels.some((l) => l.ownerRef === `${r}#name-row-0`));
  expect(ref, 'stacja w scenie').toBeDefined();
  return `[data-hit-klasa="etykieta"][data-hit-owner-ref="${ref}#name-row-0"]`;
}

function selektorSymbolu(scena: SceneV3, predykat: (s: SceneV3['symbols'][number]) => boolean): string {
  const i = scena.symbols.findIndex(predykat);
  expect(i, 'symbol w scenie').toBeGreaterThanOrEqual(0);
  return `[data-hit-for="${scena.symbols[i].meta?.testId ?? `sld-v3-symbol-${i}`}"]`;
}

interface Przypadek {
  readonly nazwa: string;
  readonly predykat: (s: SceneV3['symbols'][number]) => boolean;
  /** Selektor uchwytu spoza symboli (stacja: napis identyfikacji); brak — symbol z `predykat`. */
  readonly selektor?: (scena: SceneV3) => string;
  readonly rodzajKarty: string;
}

const PRZYPADKI: readonly Przypadek[] = [
  { nazwa: 'stacja', predykat: () => false, selektor: stacja, rodzajKarty: 'stacja' },
  {
    nazwa: 'pole',
    predykat: (s) => jestPoleBezRekorduAparatu(s),
    rodzajKarty: 'pole',
  },
  { nazwa: 'transformator', predykat: (s) => s.meta?.elementKind === 'transformer', rodzajKarty: 'transformator' },
];

const otworzOperacje = vi.fn();
const pierwotne = useNetworkBuildStore.getState().openOperationForm;

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.setState({ activeCaseId: 'case-karta', activeCaseResultStatus: 'NONE', activeMode: 'MODEL_EDIT' });
  useNetworkBuildStore.setState({ openOperationForm: otworzOperacje });
  otworzOperacje.mockClear();
  act(() => useShellStore.getState().setActiveSpace('model'));
});
afterEach(() => {
  cleanup();
  useKontekstElementuKanwy.getState().wyczysc();
  useNetworkBuildStore.setState({ openOperationForm: pierwotne });
  useAppStateStore.setState({ activeCaseId: null, activeCaseResultStatus: 'NONE', activeMode: 'MODEL_EDIT' });
});

function kliknij(przypadek: Przypadek, siec: EnergyNetworkModel = SIEC): HTMLElement {
  useSnapshotStore.setState({ snapshot: siec });
  const { container } = render(
    <>
      <SldCanvasV3Workspace width={1322} height={696} />
      <InspektorKanwyTestowy />
    </>,
  );
  const scena = buildSceneV3(siec);
  const selektor = przypadek.selektor ? przypadek.selektor(scena) : selektorSymbolu(scena, przypadek.predykat);
  // Karta SLD-SKALA-I-NAWIGACJA, R6: obiekt rysunku (aparat, pole, transformator, źródło) jest
  // własnym celem kliku na kadrze roboczym — z kadru całej sieci klik w jego obręb trafia pole albo
  // stację. Projektant dojeżdża tam natywnym kółkiem; napis stacji jest uchwytem w każdej skali.
  // R8: uchwyty stoją tylko w oknie renderu — kółko z kursorem NAD obiektem trzyma go w kadrze.
  const celUchwytu = testIdZSelektoraUchwytu(selektor);
  if (celUchwytu) powiekszKolkiemDoSkali(container, 1, punktCeluTrafienia(siec, celUchwytu));
  const uchwyt = container.querySelector(selektor);
  expect(uchwyt, `uchwyt trafienia ${selektor}`).not.toBeNull();
  fireEvent.click(uchwyt!, { detail: 1 });
  return screen.getByTestId('inspektor-element-kanwy');
}

describe.each(PRZYPADKI)('inspektor — karta techniczna: $nazwa', (przypadek) => {
  it('kolejność: nagłówek → karta → wyniki → działania (zwinięte, na końcu)', () => {
    const panel = kliknij(przypadek);
    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', przypadek.rodzajKarty);
    const kolejnosc = [
      'inspektor-element-kontekst',
      'inspektor-karta',
      'inspektor-wyniki',
      'inspektor-dzialania-zwiniete',
    ].map((id) => screen.getByTestId(id));
    for (let k = 1; k < kolejnosc.length; k += 1) {
      // DOCUMENT_POSITION_FOLLOWING: następna sekcja leży po poprzedniej.
      expect(kolejnosc[k - 1].compareDocumentPosition(kolejnosc[k]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const dzieci = Array.from(panel.children);
    expect(dzieci[dzieci.length - 1]).toBe(screen.getByTestId('inspektor-dzialania-zwiniete'));
  });

  it('działania zwinięte do chwili rozwinięcia jednym klikiem', () => {
    kliknij(przypadek);
    const zwiniete = screen.getByTestId('inspektor-dzialania-zwiniete') as HTMLDetailsElement;
    expect(zwiniete.open).toBe(false);
    expect(screen.getByTestId('inspektor-dzialania-rozwin').textContent).toMatch(/^Działania \(\d+\)$/);
    fireEvent.click(screen.getByTestId('inspektor-dzialania-rozwin'));
    expect(zwiniete.open).toBe(true);
  });

  it('MODEL_EDIT: „Zmień" przy nazwie otwiera operację domenową update_element_parameters', () => {
    kliknij(przypadek);
    const zmien = screen.getByTestId('inspektor-karta-zmien-nazwa');
    fireEvent.click(zmien);
    expect(otworzOperacje).toHaveBeenCalledTimes(1);
    const [operacja, kontekst] = otworzOperacje.mock.calls[0] as [string, Record<string, unknown>];
    expect(operacja).toBe('update_element_parameters');
    expect(kontekst.field).toBe('name');
    expect(typeof kontekst.element_ref).toBe('string');
    expect(kontekst.source).toBe('inspektor_karta');
  });

  it('RESULT_VIEW: karta bez przycisków „Zmień" (tylko odczyt, bez atrapy)', () => {
    act(() => useAppStateStore.setState({ activeMode: 'RESULT_VIEW' }));
    kliknij(przypadek);
    expect(screen.getByTestId('inspektor-karta')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^inspektor-karta-zmien-/)).toHaveLength(0);
  });
});

// K3 × K6: pole bez rekordu aparatury (sylwetka `bayNoEquipment`) — karta pola mówi to wprost
// („Pole nie ma aparatów w modelu."), zamiast pokazywać łącznik wymyślony z konwencji.
describe('inspektor — karta pola bez rekordu aparatury', () => {
  it('klik w sylwetkę „brak danych wyposażenia pola" otwiera kartę pola z jawnym brakiem aparatów', () => {
    const pole = PRZYPADKI.find((p) => p.nazwa === 'pole')!;
    kliknij(pole);
    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'pole');
    expect(screen.getByTestId('inspektor-karta-tabela-aparaty-pusta')).toHaveTextContent('Pole nie ma aparatów w modelu.');
  });
});

// Decyzja architekta pkt 3: jedno źródło zabezpieczenia pola — sterownik pola z `bay_ref`
// (ADR-022). Pole bez sterownika — jedno zdanie braku z akcją „dodaj zabezpieczenie”, która
// otwiera kreator `add_relay` przypięty do pola (`bay_ref`). Funkcji „wymaganych przez wzorzec”
// w rekordzie pola już nie ma (zestaw szablonu jedzie przy budowie pola do sterownika), więc
// zdanie nie wymienia funkcji. Ścieżka natywna: klik w symbol na kanwie.
describe('inspektor — karta pola: zabezpieczenie z jednego źródła', () => {
  it('pole bez sterownika: zdanie braku i „dodaj zabezpieczenie” → add_relay z bay_ref', () => {
    const pole = PRZYPADKI.find((p) => p.nazwa === 'pole')!;
    // Klikane pole traci sterownik w modelu (dane modelu, nie stan sklepu).
    const symbol = buildSceneV3(SIEC).symbols.find(pole.predykat)!;
    const siec: EnergyNetworkModel = {
      ...SIEC,
      protection_assignments: (SIEC.protection_assignments ?? []).filter((pa) => pa.bay_ref !== symbol.meta?.ownerRef),
    };
    kliknij(pole, siec);
    const wiersz = screen.getByTestId('inspektor-karta-pole-zabezpieczenie');
    expect(wiersz).toHaveAttribute('data-brak', 'true');
    expect(screen.getByTestId('inspektor-karta-wartosc-zabezpieczenie')).toHaveTextContent(
      'Brak sterownika zabezpieczeniowego w polu',
    );
    expect(screen.queryByTestId('inspektor-karta-pole-funkcje_zabezpieczen')).toBeNull();
    expect(screen.getByTestId('inspektor-karta').textContent ?? '').not.toMatch(/brak danych/u);
    fireEvent.click(screen.getByTestId('inspektor-karta-akcja-zabezpieczenie'));
    expect(otworzOperacje).toHaveBeenCalledTimes(1);
    const [operacja, kontekst] = otworzOperacje.mock.calls[0];
    expect(operacja).toBe('add_relay');
    expect(kontekst).toEqual({ bay_ref: symbol.meta?.ownerRef });
  });
});
