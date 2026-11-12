/*
 * Tożsamość selekcji w adresie przy przejściu z aplikacji (karta INSPEKTOR-I-NAWIGACJA,
 * defekt P0 (a)): wejście z gotowości kadrowało stację S11, a inspektor pokazywał szynę nN
 * Stacji Sekcyjnej — adres przejścia niósł `sel=` POPRZEDNIEJ selekcji, a `popstate` z tej
 * zmiany hasha przywracał ją ze store'u adresu.
 *
 * KOLEJNOŚĆ JAK W CHROMIUM: `popstate` przychodzi PRZED efektem `useUrlSelectionSync`,
 * który dopisuje nową selekcję do adresu. jsdom bywa odwrotny (efekt wygrywa i defekt się
 * chowa), więc test wywołuje `popstate` jawnie i synchronicznie zaraz po przejściu.
 *
 * ILOCZYN CECH: każdy zapis adresu przez aplikację (przejście na schemat jedną drogą,
 * przejście do przestrzeni bez trasy, trasa wyników, „Wróć do", trasa nakładki SLD z menu)
 * × `popstate` przed efektem. Osobno: prawdziwe wstecz przeglądarki NADAL przywraca
 * selekcję z wpisu historii.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useUrlSelectionSync } from '../../../ui/navigation/useUrlSelectionSync';
import { navigateToAnalysis, updateUrlWithSelection } from '../../../ui/navigation';
import { useSelectionStore } from '../../../ui/selection/store';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { ustawMigawkeZElementami } from '../../../test/schematTestowy';
import { useShellStore } from '../useShellStore';
import { pokazElementNaSchemacie } from '../zaznaczElementModelu';
import { przejdzDoPrzestrzeni } from '../przejsciaPrzestrzeni';
import { usePowrotZeSchematu, wrocDoEkranu, zapiszPowrot } from '../powrotZeSchematu';

const A = { id: 'bus-stara', type: 'Bus' as const, name: 'Szyna nN Stacji Sekcyjnej' };
const B = { id: 'bus-nowa', type: 'Bus' as const, name: 'Szyna SN stacji S11' };

const stanSelekcji = useSelectionStore.getState();
const stanMigawki = useSnapshotStore.getState();

/** `popstate` w chwili, gdy przeglądarka by go wysłała — przed efektami Reacta. */
function popstateJakChromium(): void {
  window.dispatchEvent(new PopStateEvent('popstate'));
}

async function poEfektach(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

beforeEach(async () => {
  ustawMigawkeZElementami([
    { kolekcja: 'buses', id: A.id, name: A.name, pola: { voltage_kv: 0.4 } },
    { kolekcja: 'buses', id: B.id, name: B.name, pola: { voltage_kv: 15 } },
  ]);
  window.history.replaceState(null, '', '/#');
  useShellStore.setState({ activeSpace: 'gotowosc' });
  usePowrotZeSchematu.setState({ wpis: null, doOdebrania: null });
  renderHook(() => useUrlSelectionSync());
  // Stan wyjściowy: poprzednia selekcja A — w store'ze i w adresie (tak zostawia ją
  // poprzednie wejście i powrót).
  act(() => useSelectionStore.getState().selectElement(A));
  updateUrlWithSelection(A);
  await poEfektach();
  expect(window.location.hash).toContain(`sel=${A.id}`);
});

afterEach(() => {
  useSelectionStore.setState(stanSelekcji, true);
  useSnapshotStore.setState(stanMigawki, true);
  usePowrotZeSchematu.setState({ wpis: null, doOdebrania: null });
  window.history.replaceState(null, '', '/#');
});

const PRZEJSCIA: ReadonlyArray<readonly [string, () => void]> = [
  ['wejście na schemat jedną drogą (gotowość → schemat)', () => pokazElementNaSchemacie(B.id, 'test')],
  [
    'przejście do przestrzeni bez trasy (schemat → gotowość)',
    () => {
      useShellStore.setState({ activeSpace: 'schemat' });
      window.history.replaceState(null, '', `/#sld?sel=${A.id}&type=Bus&name=x`);
      useSelectionStore.getState().selectElement(B);
      przejdzDoPrzestrzeni('gotowosc');
    },
  ],
  [
    'trasa wyników',
    () => {
      useSelectionStore.getState().selectElement(B);
      navigateToAnalysis({ runId: 'bieg-1' });
    },
  ],
  [
    '„Wróć do" ekranu źródłowego',
    () => {
      zapiszPowrot(null);
      useShellStore.setState({ activeSpace: 'schemat' });
      window.history.replaceState(null, '', `/#sld?sel=${A.id}&type=Bus&name=x`);
      useSelectionStore.getState().selectElement(B);
      wrocDoEkranu();
    },
  ],
];

describe('adres przejścia z aplikacji niesie tożsamość bieżącej selekcji', () => {
  it.each(PRZEJSCIA)('%s × popstate przed efektem: selekcja zostaje na nowym celu', async (_opis, przejscie) => {
    act(() => {
      przejscie();
      popstateJakChromium();
    });
    await poEfektach();
    const selekcja = useSelectionStore.getState();
    expect(selekcja.selectedElement?.id).toBe(B.id);
    expect(window.location.hash).toContain(`sel=${B.id}`);
    expect(window.location.hash).not.toContain(`sel=${A.id}`);
  });

  it('wejście jedną drogą: zaznaczenie i wskazanie kamery to ten sam obiekt', async () => {
    act(() => {
      pokazElementNaSchemacie(B.id, 'test');
      popstateJakChromium();
    });
    await poEfektach();
    const { selectedElement, sldWskazanie } = useSelectionStore.getState();
    expect(selectedElement?.id).toBe(B.id);
    expect(sldWskazanie?.ref).toBe(selectedElement?.id);
  });

  it('prawdziwe wstecz przeglądarki nadal przywraca selekcję z wpisu historii', async () => {
    // Wpis historii z selekcją A (adres stanu wyjściowego), potem przejście na B.
    act(() => {
      pokazElementNaSchemacie(B.id, 'test');
    });
    await poEfektach();
    expect(useSelectionStore.getState().selectedElement?.id).toBe(B.id);
    const powrocil = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
    window.history.back();
    await powrocil;
    await poEfektach();
    expect(window.location.hash).toContain(`sel=${A.id}`);
    expect(useSelectionStore.getState().selectedElement?.id).toBe(A.id);
  });
});
