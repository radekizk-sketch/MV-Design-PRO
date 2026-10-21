/**
 * Karta TOLERANCJA-NN-WARTOSC-ROBOCZA (zasada nr 4, V12K-351): sieć nN bez deklaracji
 * tolerancji napięcia liczy się na wartości roboczej (+10 %), a ekran wyników zwarć pokazuje
 * założenie biegu `fault.c_tolerancja_nn_robocza` z treścią backendu, dyskretnym znacznikiem
 * „wartość robocza” i akcją „Zmień wartość”, która otwiera ISTNIEJĄCY kreator edycji
 * parametrów w polu deklaracji elementu zasilającego.
 *
 * Iloczyn cech: {element zasilający: transformator, źródło na szynie nN, brak elementu
 * zasilającego (szyna — bez pola deklaracji)} × {scenariusz MAX, MIN} × {obsługa zmiany:
 * podana, nieobecna} — model; ekran: natywny klik → selekcja + formularz w polu deklaracji;
 * inne założenia biegu NIE dostają znacznika ani akcji (predykat jednego kodu).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EkranZwarc } from '../EkranZwarc';
import { ZWARCIA_STRINGS, scenariuszZwarciaPL } from '../strings';
import { KOD_TOLERANCJA_NN_ROBOCZA, naZalozeniaZwarc } from '../zwarciaModel';
import { typSelekcjiZalozenia, type CelZmianyZalozenia } from '../zmianaTolerancjiNn';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import type { ZalozenieBieguSlad } from '../../../../ui/results-inspector/types';
import {
  selectActiveOperationForm,
  useNetworkBuildStore,
} from '../../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../../ui/selection';
import { konfiguracjaBieguFixture, shortCircuitResultsFixture, zalozenieBieguFixture } from './fixtures';
import { atrapaFetchPasma, renderEkranZwarc } from './renderEkranZwarc';

vi.mock('../../../../ui/workspace/analysisRunContract', () => ({
  useAnalysisRunContract: () => ({ data: null, isLoading: false, error: null }),
}));

const TRESC =
  'Sieć nN zasilana przez transformator „TR 15/0,4 kV” (bez deklaracji tolerancji napięcia) '
  + 'liczona na wartości roboczej tolerancji +10 % (c_max 1,10).';

const NAZWY: Record<string, string> = {
  'tr-nn-1': 'TR 15/0,4 kV',
  'src-nn-1': 'Sieć zasilająca nN',
  'bus-nn-wydz': 'Szyna nN wydzielona',
  s1: 'Sieć zasilająca SN',
};
const NAZWA = (ref: string) => NAZWY[ref] ?? ref;

function zalozenieTolerancji(over: Partial<ZalozenieBieguSlad>): ZalozenieBieguSlad {
  return {
    code: KOD_TOLERANCJA_NN_ROBOCZA,
    element_ref: 'tr-nn-1',
    message_pl: TRESC,
    scenariusz: 'MAX',
    parametr: 'lv_voltage_tolerance',
    element_type: 'Transformer',
    ...over,
  };
}

const ELEMENTY = [
  ['transformator', 'tr-nn-1', 'Transformer', 'TransformerBranch'],
  ['źródło na szynie nN', 'src-nn-1', 'Source', 'Source'],
] as const;

describe('naZalozeniaZwarc — założenie tolerancji sieci nN na wartości roboczej', () => {
  describe.each(ELEMENTY)('%s', (_, ref, rodzaj, typSelekcji) => {
    it.each(['MAX', 'MIN'] as const)(
      'scenariusz %s: treść backendu, znacznik „wartość robocza”, akcja „Zmień wartość” w polu deklaracji',
      (scenariusz) => {
        const zmien = vi.fn<[CelZmianyZalozenia], void>();
        const wiersze = naZalozeniaZwarc(
          konfiguracjaBieguFixture(),
          [zalozenieTolerancji({ element_ref: ref, element_type: rodzaj, scenariusz })],
          NAZWA,
          zmien,
        );
        const wiersz = wiersze[wiersze.length - 1];
        expect(wiersz.etykieta).toBe(ZWARCIA_STRINGS.zalozenieTolerancjiNn(NAZWY[ref]));
        expect(wiersz.wartosc).toBe(TRESC);
        expect(wiersz.znacznik).toBe(ZWARCIA_STRINGS.znacznikWartosciRoboczej);
        expect(wiersz.uwaga).toBe(ZWARCIA_STRINGS.zalozenieUwaga(scenariuszZwarciaPL(scenariusz)));
        expect(wiersz.akcja?.etykieta).toBe(ZWARCIA_STRINGS.zmienWartosc);
        expect(wiersz.akcja?.testid).toBe(`mvd-zwarcia-zalozenie-zmien-${ref}-${scenariusz}`);
        wiersz.akcja?.onWybierz();
        expect(zmien).toHaveBeenCalledWith({
          elementRef: ref,
          elementType: rodzaj,
          parametr: 'lv_voltage_tolerance',
          nazwa: NAZWY[ref],
        });
        expect(typSelekcjiZalozenia(rodzaj)).toBe(typSelekcji);
      },
    );

    it('bez obsługi zmiany (ekran tylko do odczytu) — znacznik zostaje, akcji brak', () => {
      const wiersze = naZalozeniaZwarc(
        konfiguracjaBieguFixture(),
        [zalozenieTolerancji({ element_ref: ref, element_type: rodzaj })],
        NAZWA,
      );
      const wiersz = wiersze[wiersze.length - 1];
      expect(wiersz.znacznik).toBe(ZWARCIA_STRINGS.znacznikWartosciRoboczej);
      expect(wiersz.akcja).toBeUndefined();
    });
  });

  it.each(['MAX', 'MIN'] as const)(
    'wyspa nN bez elementu zasilającego (%s): założenie na szynie, bez pola — znacznik bez akcji',
    (scenariusz) => {
      const wiersze = naZalozeniaZwarc(
        konfiguracjaBieguFixture(),
        [
          {
            code: KOD_TOLERANCJA_NN_ROBOCZA,
            element_ref: 'bus-nn-wydz',
            message_pl: 'Sieć nN „Szyna nN wydzielona” — brak elementu zasilającego.',
            scenariusz,
          },
        ],
        NAZWA,
        vi.fn(),
      );
      const wiersz = wiersze[wiersze.length - 1];
      expect(wiersz.etykieta).toBe(ZWARCIA_STRINGS.zalozenieTolerancjiNn('Szyna nN wydzielona'));
      expect(wiersz.znacznik).toBe(ZWARCIA_STRINGS.znacznikWartosciRoboczej);
      expect(wiersz.akcja).toBeUndefined();
    },
  );

  it('rodzaj elementu spoza mapowania selekcji — bez akcji (żadnego martwego klika)', () => {
    const wiersze = naZalozeniaZwarc(
      konfiguracjaBieguFixture(),
      [zalozenieTolerancji({ element_type: 'Bus' })],
      NAZWA,
      vi.fn(),
    );
    expect(wiersze[wiersze.length - 1].akcja).toBeUndefined();
    expect(typSelekcjiZalozenia('Bus')).toBeNull();
  });

  it('inne założenia biegu (np. brak S″kQmin źródła) — bez znacznika i bez akcji', () => {
    const wiersze = naZalozeniaZwarc(
      konfiguracjaBieguFixture(),
      [zalozenieBieguFixture()],
      NAZWA,
      vi.fn(),
    );
    const wiersz = wiersze[wiersze.length - 1];
    expect(wiersz.etykieta).toBe(ZWARCIA_STRINGS.zalozenieEtykieta('Sieć zasilająca SN'));
    expect(wiersz.znacznik).toBeUndefined();
    expect(wiersz.akcja).toBeUndefined();
  });
});

describe('EkranZwarc — „Zmień wartość” tolerancji sieci nN (natywny klik, realne store)', () => {
  beforeEach(() => {
    useResultsInspectorStore.getState().reset();
    useNetworkBuildStore.getState().reset();
    useSelectionStore.getState().selectElement(null);
    atrapaFetchPasma();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(ELEMENTY)(
    '%s: klik otwiera kreator edycji parametrów w polu lv_voltage_tolerance i zaznacza element',
    async (_, ref, rodzaj, typSelekcji) => {
      useResultsInspectorStore.setState({
        shortCircuitResults: shortCircuitResultsFixture({
          zalozenia: [
            zalozenieBieguFixture(),
            zalozenieTolerancji({ element_ref: ref, element_type: rodzaj, scenariusz: 'MAX' }),
          ],
        }),
        selectedRunId: 'sc-run-1',
      });
      await renderEkranZwarc(<EkranZwarc trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
      const sekcja = screen.getByTestId('mvd-wyn-zalozenia');
      // Znacznik tylko przy założeniu tolerancji — jeden, nie przy założeniu źródła SN.
      expect(within(sekcja).getAllByTestId('mvd-wyn-zalozenie-znacznik')).toHaveLength(1);
      expect(within(sekcja).getByText(TRESC)).toBeInTheDocument();

      await userEvent.click(within(sekcja).getByTestId(`mvd-zwarcia-zalozenie-zmien-${ref}-MAX`));

      expect(selectActiveOperationForm(useNetworkBuildStore.getState())).toMatchObject({
        op: 'update_element_parameters',
        context: { element_ref: ref, element_type: typSelekcji, field: 'lv_voltage_tolerance' },
      });
      expect(useSelectionStore.getState().selectedElement).toMatchObject({ id: ref, type: typSelekcji });
    },
  );
});
