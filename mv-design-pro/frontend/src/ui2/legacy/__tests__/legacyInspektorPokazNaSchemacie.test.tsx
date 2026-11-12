/**
 * „Pokaż na schemacie" w prawym inspektorze (`LegacyInspektor`) — JEDEN predykat dla każdej
 * gałęzi inspektora, która pokazuje ZAZNACZONY obiekt (karta SLD-SKALA-I-NAWIGACJA, część W
 * pkt 3; karta INSPEKTOR-I-NAWIGACJA).
 *
 * Defekt (pomiar e2e 2026-11-12, `wejscia-na-schemat.spec.ts:202`): przejście przestrzeni
 * z zaznaczeniem zapisuje adres z tożsamością selekcji, `popstate` tej zmiany otwiera okno
 * techniczne obiektu przez synchronizację selekcji, a klik stacji w drzewie „Model sieci"
 * przestawia to okno na stację — inspektor pokazywał sekcje stacji NAD oknem bez akcji
 * „Pokaż na schemacie” (akcja stała tylko w gałęzi karty technicznej).
 *
 * ILOCZYN CECH: gałąź inspektora {karta techniczna zaznaczenia · sekcje obiektu nad oknem
 * z selekcji · okno otwarte jawnie przez użytkownika · brak zaznaczenia} × kanwa schematu
 * {zamontowana · niezamontowana}. Akcja stoi ⇔ gałąź pokazuje zaznaczenie ∧ kanwa
 * niezamontowana. Okno z selekcji otwiera REALNA ścieżka: przejście przestrzeni
 * (`przejdzDoPrzestrzeni`) z `popstate` w kolejności Chromium (przed efektami Reacta —
 * jsdom sam go nie wysyła), potem wybór innej stacji (jak klik w drzewie: selekcja
 * kanoniczna → `dopasujOknoDoSelekcji`).
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useUrlSelectionSync } from '../../../ui/navigation/useUrlSelectionSync';
import { useSelectionStore } from '../../../ui/selection/store';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { ustawMigawkeZElementami, zamontujKanweSchematu } from '../../../test/schematTestowy';
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
import { useShellStore } from '../../shell/useShellStore';
import { LegacyInspektor } from '../LegacyInspektor';

vi.mock('../../../ui/workspace', () => ({
  // Okno techniczne (E-13) ma własne testy; tu liczy się tylko, KTÓRA gałąź inspektora stoi.
  WorkspaceSurfaceRouter: () => <div data-testid="okno-panelu" />,
}));
vi.mock('../../../ui/network-build/InspectorEngineeringView', () => ({
  InspectorEngineeringView: () => <div data-testid="karta-zaznaczenia" />,
}));
vi.mock('../../../ui/network-build/inspektor-elementu/PanelElementuKanwy', () => ({
  PanelElementuKanwy: () => <div data-testid="sekcje-obiektu" />,
}));

const S1 = { id: 'st-1', type: 'Station' as const, name: 'Stacja Końcowa' };
const S2 = { id: 'st-2', type: 'Station' as const, name: 'Stacja Sekcyjna' };

function Inspektor() {
  useUrlSelectionSync();
  return <LegacyInspektor fallback={<p data-testid="inspektor-pusty" />} />;
}

async function poEfektach(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

type Galaz = 'karta' | 'nad-oknem' | 'okno-jawne' | 'brak';

/** Doprowadza inspektor do gałęzi REALNĄ ścieżką; zwraca testid treści tej gałęzi. */
async function doprowadz(galaz: Galaz): Promise<string> {
  if (galaz === 'brak') return 'inspektor-pusty';
  act(() => useSelectionStore.getState().selectElement(S1));
  await poEfektach();
  if (galaz === 'karta') return 'karta-zaznaczenia';
  if (galaz === 'nad-oknem') {
    // Przejście przestrzeni z zaznaczeniem S1 → `popstate` (Chromium) → okno S1 z selekcji.
    act(() => {
      przejdzDoPrzestrzeni('model');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await poEfektach();
    expect(useNetworkBuildStore.getState().activeSurface?.routeState.payload?.source).toBe('url_selection');
    // Klik stacji S2 w drzewie: selekcja kanoniczna, okno idzie za selekcją.
    act(() => useSelectionStore.getState().selectElement(S2));
    await poEfektach();
    expect(useNetworkBuildStore.getState().activeSurface?.entityRef).toBe(S2.id);
    return 'sekcje-obiektu';
  }
  // Okno otwarte jawnie przez użytkownika (formularz operacji) — nie pokazuje zaznaczenia.
  act(() =>
    useNetworkBuildStore.getState().openRouteSurface('E-13', {
      entityRef: S1.id,
      entityType: 'station',
      subjectKind: 'entity',
      subjectRef: S1.id,
      titlePl: S1.name,
      route: 'sld',
      openMode: 'replace_right_panel',
      payload: { delegate: 'operation_form' },
    }),
  );
  await poEfektach();
  return 'okno-panelu';
}

const GALEZIE: readonly (readonly [Galaz, boolean])[] = [
  ['karta', true],
  ['nad-oknem', true],
  ['okno-jawne', false],
  ['brak', false],
];

let odmontujKanwe: (() => void) | null = null;

beforeEach(() => {
  ustawMigawkeZElementami([
    { kolekcja: 'substations', id: S1.id, name: S1.name, pola: { station_type: 'mv_lv', bus_refs: [] } },
    { kolekcja: 'substations', id: S2.id, name: S2.name, pola: { station_type: 'mv_lv', bus_refs: [] } },
  ]);
  window.history.replaceState(null, '', '/#');
  useShellStore.setState({ activeSpace: 'gotowosc' });
  useSelectionStore.getState().clearSelection();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
});

afterEach(() => {
  cleanup();
  odmontujKanwe?.();
  odmontujKanwe = null;
  useSelectionStore.getState().clearSelection();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useSnapshotStore.getState().reset();
  window.history.replaceState(null, '', '/#');
});

describe('„Pokaż na schemacie": gałąź inspektora × kanwa schematu', () => {
  describe.each([
    ['kanwa niezamontowana', false],
    ['kanwa zamontowana', true],
  ] as const)('%s', (_nazwa, kanwa) => {
    it.each(GALEZIE)('gałąź %s', async (galaz, pokazujeZaznaczenie) => {
      if (kanwa) odmontujKanwe = zamontujKanweSchematu();
      render(<Inspektor />);
      const tresc = await doprowadz(galaz);
      await waitFor(() => expect(screen.getByTestId(tresc)).toBeInTheDocument());
      const akcja = screen.queryByTestId('mvd-inspektor-pokaz-na-schemacie');
      if (pokazujeZaznaczenie && !kanwa) {
        expect(akcja, 'akcja stoi nad treścią zaznaczenia').not.toBeNull();
        const przycisk = akcja!.querySelector('button')!;
        expect(przycisk.textContent).toBe('Pokaż na schemacie');
        // Akcja wskazuje BIEŻĄCE zaznaczenie (po kliku w drzewie — S2, nie obiekt okna sprzed).
        const zaznaczony = useSelectionStore.getState().selectedElements[0]!.id;
        expect(przycisk.getAttribute('data-element-ref')).toBe(zaznaczony);
        expect(akcja!.compareDocumentPosition(screen.getByTestId(tresc)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      } else {
        expect(akcja).toBeNull();
      }
    });
  });
});
