/**
 * KARTA-POLA-KD6 — zwijanie jednakowych braków (jedna reguła `zwijanieBrakow`) w obu rendererach,
 * które pokazywały serie „nie podano” / „brak telemetrii”: `SectionBlock` (karta pola E-11,
 * inspektor inżynierski) i `SekcjaStanuAparatu` (karta aparatu w inspektorze obiektu kanwy).
 *
 * Iloczyn cech: sekcja {pełna, częściowa, pusta} × telemetria {jest, brak} × motyw {jasny,
 * ciemny}. Motyw nie może zmieniać układu (§9 kontraktu prezentacji): DOM w obu motywach
 * identyczny. Do tego reguła czysta: próg zwijania (1 brak — wiersz), kolejność, różne braki
 * w jednej sekcji, wiersze wyłączone (edycja nazwy, komunikaty kontroli), odmiana liczebnika.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BRAK_TELEMETRII } from '../../field/fieldLabels';
import { SectionBlock, type PropertySection } from '../../network-build/InspectorEngineeringView';
import { SekcjaStanuAparatu } from '../../network-build/inspektor-elementu/PanelElementuKanwy';
import { FORMY_SYGNALU, odmianaLiczby, opisGrupy, podzielNaBraki } from '../zwijanieBrakow';

const MOTYWY = ['light_technical', 'dark_scada'] as const;
const nic = async () => undefined;

function ustawMotyw(motyw: string): void {
  document.documentElement.setAttribute('data-theme', motyw);
}

const SEKCJE: Record<'pelna' | 'czesciowa' | 'pusta', PropertySection> = {
  pelna: {
    id: 'measurements',
    label: 'Tor pomiarowy',
    fields: [
      { key: 'ct_refs', label: 'Przekładniki prądowe', value: 'CT 300/5' },
      { key: 'vt_refs', label: 'Przekładniki napięciowe', value: 'VT 15/0,1' },
    ],
  },
  czesciowa: {
    id: 'protection',
    label: 'Zabezpieczenie pola',
    fields: [
      { key: 'unit_ref', label: 'Jednostka wtórna', value: null },
      { key: 'model', label: 'Model', value: null },
      { key: 'functions', label: 'Funkcje aktywne', value: '50, 51' },
      { key: 'spz', label: 'SPZ', value: null },
    ],
  },
  pusta: {
    id: 'proof',
    label: 'Wywód pola',
    fields: [
      { key: 'proof_ref', label: 'Identyfikator uzasadnienia', value: null },
      { key: 'input_refs', label: 'Powiązane dane wejściowe', value: null },
    ],
  },
};

function sekcjaTelemetrii(jest: boolean): PropertySection {
  const etykiety = [
    'Łączność urządzenia wtórnego', 'Ostatnia poprawna aktualizacja', 'Dostępność sterowania',
    'Dostępność pomiarów', 'Stan ostatniego polecenia', 'Bezpieczne do pracy',
    'Przyczyna braku bezpieczeństwa', 'Zasilanie od strony szyn', 'Zasilanie od strony odpływu',
    'Pole uziemione', 'Widoczna przerwa',
  ];
  return {
    id: 'runtime',
    label: 'Stan ruchowy pola',
    formyPozycji: FORMY_SYGNALU,
    fields: etykiety.map((label, i) => ({
      key: `s${i}`,
      label,
      value: jest ? (i % 2 === 0 ? 'Dostępne' : true) : BRAK_TELEMETRII,
    })),
  };
}

function renderSekcji(section: PropertySection) {
  return render(
    <SectionBlock section={section} elementId="bay-1" activeCaseId="case-1" executeDomainOperation={nic} />,
  );
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('podzielNaBraki — reguła czysta', () => {
  const brak = (p: { w: string | null }) => p.w;

  it('pojedynczy brak zostaje wierszem; dwa jednakowe — jedna grupa w miejscu pierwszego', () => {
    const jeden = podzielNaBraki([{ w: null }, { w: 'nie podano' }, { w: null }], brak);
    expect(jeden.elementy.map((e) => e.rodzaj)).toEqual(['wiersz', 'wiersz', 'wiersz']);
    expect(jeden.pusta).toBeNull();
    const dwa = podzielNaBraki([{ w: null }, { w: 'nie podano' }, { w: null }, { w: 'nie podano' }], brak);
    expect(dwa.elementy.map((e) => e.rodzaj)).toEqual(['wiersz', 'grupa', 'wiersz']);
  });

  it('różne braki w jednej sekcji — osobne grupy, sekcja nie jest „pusta”', () => {
    const p = podzielNaBraki(
      [{ w: 'nie podano' }, { w: BRAK_TELEMETRII }, { w: 'nie podano' }, { w: BRAK_TELEMETRII }],
      brak,
    );
    expect(p.elementy).toHaveLength(2);
    expect(p.pusta).toBeNull();
  });

  it('sekcja z samych jednakowych braków — „pusta” z liczbą pozycji', () => {
    const p = podzielNaBraki([{ w: 'nie podano' }, { w: 'nie podano' }, { w: 'nie podano' }], brak);
    expect(p.pusta?.pozycje).toHaveLength(3);
    expect(opisGrupy(p.pusta!)).toBe('nie podano (3 pozycje)');
  });

  it.each([
    [1, 'sygnał'], [2, 'sygnały'], [4, 'sygnały'], [5, 'sygnałów'], [11, 'sygnałów'],
    [12, 'sygnałów'], [14, 'sygnałów'], [22, 'sygnały'], [25, 'sygnałów'],
  ])('odmiana: %i %s', (n, forma) => {
    expect(odmianaLiczby(n, FORMY_SYGNALU)).toBe(forma);
  });
});

describe.each(MOTYWY)('SectionBlock — motyw %s', (motyw) => {
  it('sekcja pełna: każdy wiersz z wartością, bez grupy braków', () => {
    ustawMotyw(motyw);
    renderSekcji(SEKCJE.pelna);
    const sekcja = screen.getByTestId('engineering-section-tor_pomiarowy');
    expect(sekcja).not.toHaveAttribute('data-pusta');
    expect(screen.getByTestId('engineering-field-ct_refs')).toHaveTextContent('CT 300/5');
    expect(sekcja.querySelector('[data-testid^="engineering-braki-"]')).toBeNull();
  });

  it('sekcja częściowa: wartości jako wiersze, trzy jednakowe braki jednym wierszem z nazwami', () => {
    ustawMotyw(motyw);
    renderSekcji(SEKCJE.czesciowa);
    const sekcja = screen.getByTestId('engineering-section-zabezpieczenie_pola');
    expect(screen.getByTestId('engineering-field-functions')).toHaveTextContent('50, 51');
    const grupa = within(sekcja).getByTestId('engineering-braki-zabezpieczenie_pola-nie_podano');
    expect(grupa).toHaveAttribute('data-liczba', '3');
    expect(grupa).toHaveTextContent('Jednostka wtórna, Model, SPZ: nie podano');
    expect(within(sekcja).getAllByText('nie podano')).toHaveLength(1);
  });

  it('sekcja pusta: jedna linia — tytuł sekcji i brak, bez serii wierszy', () => {
    ustawMotyw(motyw);
    renderSekcji(SEKCJE.pusta);
    const sekcja = screen.getByTestId('engineering-section-wywod_pola');
    expect(sekcja).toHaveAttribute('data-pusta', 'true');
    expect(sekcja).toHaveTextContent('Wywód pola');
    expect(within(sekcja).getAllByText('nie podano')).toHaveLength(1);
  });

  it.each([true, false])('telemetria jest = %s: brak — jeden wiersz „brak telemetrii (11 sygnałów)” z rozwinięciem', (jest) => {
    ustawMotyw(motyw);
    renderSekcji(sekcjaTelemetrii(jest));
    const sekcja = screen.getByTestId('engineering-section-stan_ruchowy_pola');
    const grupa = within(sekcja).queryByTestId('engineering-braki-stan_ruchowy_pola-brak_telemetrii');
    if (jest) {
      expect(grupa).toBeNull();
      expect(within(sekcja).queryByText(/brak telemetrii/)).toBeNull();
      expect(within(sekcja).getAllByText('Dostępne').length).toBeGreaterThan(0);
      return;
    }
    expect(sekcja).toHaveAttribute('data-pusta', 'true');
    expect(grupa?.tagName).toBe('DETAILS');
    expect(grupa).toHaveTextContent('brak telemetrii (11 sygnałów)');
    // Rozwinięcie niesie nazwy wszystkich jedenastu sygnałów.
    expect(grupa?.querySelectorAll('li')).toHaveLength(11);
  });

  it('edycja nazwy i komunikaty kontroli nigdy nie są zwijane', () => {
    ustawMotyw(motyw);
    renderSekcji({
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'name', label: 'Nazwa', value: null },
        { key: 'readiness_0', label: 'Konfiguracja', value: 'nie podano' },
        { key: 'x', label: 'X', value: null },
      ],
    });
    expect(screen.getByTestId('engineering-field-name')).toBeInTheDocument();
    expect(screen.queryByTestId('engineering-braki-identyfikacja-nie_podano')).toBeNull();
  });
});

describe('SekcjaStanuAparatu — telemetria × motyw', () => {
  const zTelemetria = {
    actualState: 'closed', controlMode: 'zdalne', communicationOk: true, interlockBlocked: false,
    lastChangeAt: '2026-11-05T10:00:00Z',
  } as const;

  // Uzależnienie operacyjne pochodzi z reguły MODELU („nieustalone”), nie z telemetrii — zostaje
  // osobnym wierszem; zwinięte są trzy sygnały telemetrii.
  it.each(MOTYWY)('brak telemetrii (%s): jeden wiersz „Telemetria” z rozwinięciem trzech sygnałów', (motyw) => {
    ustawMotyw(motyw);
    render(<SekcjaStanuAparatu stan={{ actualState: 'closed' } as never} />);
    const grupa = screen.getByTestId('inspektor-aparat-telemetria');
    expect(grupa).toHaveTextContent('brak telemetrii (3 sygnały)');
    expect(grupa.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByTestId('inspektor-aparat-komunikacja')).toHaveTextContent(BRAK_TELEMETRII);
    expect(screen.getByTestId('inspektor-aparat-uzaleznienie')).toHaveTextContent('nieustalone');
    expect(screen.getAllByText(/brak telemetrii/)).toHaveLength(4);
    expect(screen.getByTestId('inspektor-aparat-stan')).toBeInTheDocument();
  });

  it.each(MOTYWY)('telemetria jest (%s): cztery wiersze, bez grupy braków', (motyw) => {
    ustawMotyw(motyw);
    render(<SekcjaStanuAparatu stan={zTelemetria as never} />);
    expect(screen.queryByTestId('inspektor-aparat-telemetria')).toBeNull();
    expect(screen.getByTestId('inspektor-aparat-zmiana')).toHaveTextContent('2026-11-05T10:00:00Z');
    expect(screen.queryByText(BRAK_TELEMETRII)).toBeNull();
  });

  it('motyw nie zmienia układu: DOM sekcji identyczny w obu motywach', () => {
    const doms = MOTYWY.map((motyw) => {
      ustawMotyw(motyw);
      const { container, unmount } = render(
        <>
          <SekcjaStanuAparatu stan={{ actualState: 'closed' } as never} />
          <SectionBlock section={sekcjaTelemetrii(false)} elementId="b" activeCaseId="c" executeDomainOperation={nic} />
        </>,
      );
      const html = container.innerHTML;
      unmount();
      return html;
    });
    expect(doms[0]).toBe(doms[1]);
  });
});
