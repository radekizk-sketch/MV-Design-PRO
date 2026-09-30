/**
 * Edytor nastaw zabezpieczenia — pisarz nastaw ścieżki projektanta (karta
 * BIEG-ZABEZPIECZEN-Z-MODELU, D-21).
 *
 * Wejście: PRAWDZIWY model sieci złotej G08 (migawka serwowana przez magazyn, dwa
 * zabezpieczenia przy wyłącznikach liniowych z nastawami zapisanymi operacjami domenowymi) i
 * PRAWDZIWY read model `protection-view` tego modelu z generatora fikstur — nie ręczny kształt.
 * Kliki i wpisy natywne (userEvent) na realnych kontrolkach; zapis mockowany na granicy magazynu
 * migawki (`executeDomainOperation` — ta sama operacja `update_protection_settings`).
 *
 * Iloczyn cech: {stopień aktywny, nieaktywny} × {charakterystyka zależna (TMS), DT (zwłoka),
 * nieustawiona} × {pole puste, wypełnione} × {nastawy innych funkcji przypisania} × {zapis
 * przyjęty, odmowa backendu, brak przypadku} × {braki z backendu, komplet}.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import type { NastawyUrzadzeniaWidok, SlownikNastaw } from '../../../../ui/protection/nastawyModelu';
import type { EnergyNetworkModel, ProtectionSetting } from '../../../../types/enm';
import {
  EdytorNastawZabezpieczenia,
  formularzZNastaw,
  nastawyZFormularza,
} from '../EdytorNastawZabezpieczenia';
import { NASTAWY_STRINGS as T } from '../stringsNastaw';
import migawkaSceny from '../../../../harness-fixtures/generated/koordynacja_scena_migawka.json';
import widokSceny from '../../../../harness-fixtures/generated/koordynacja_scena_widok_zabezpieczen.json';

const MIGAWKA = migawkaSceny as unknown as EnergyNetworkModel;
const WIDOK = widokSceny as unknown as {
  assignments: { device_id: string; nastawy: NastawyUrzadzeniaWidok }[];
  slownik_nastaw: SlownikNastaw;
};
const [PIERWSZE] = WIDOK.assignments;
const REF = PIERWSZE.device_id;
const NASTAWY = PIERWSZE.nastawy;
const USTAWIENIA_MODELU = MIGAWKA.protection_assignments!.find((p) => p.ref_id === REF)!
  .settings as ProtectionSetting[];

const zapis = vi.fn();

/**
 * Postać porównawcza nastaw: pola z wartością (bez `null` i bez `is_directional: false` —
 * wartości domyślnej schematu modelu), kolejność funkcji kanoniczna. Model przechowuje nastawy
 * w postaci kanonicznej (wszystkie pola), edytor wysyła tylko pola ustawione.
 */
function porownawczo(nastawy: readonly ProtectionSetting[]): Record<string, unknown>[] {
  return [...nastawy]
    .map((n) =>
      Object.fromEntries(
        Object.entries(n).filter(
          ([klucz, wartosc]) => wartosc !== null && !(klucz === 'is_directional' && wartosc === false),
        ),
      ),
    )
    .sort((a, b) => String(a.function_type).localeCompare(String(b.function_type)));
}

beforeEach(() => {
  zapis.mockReset();
  zapis.mockResolvedValue({ snapshot: MIGAWKA, error: null });
  useAppStateStore.getState().setActiveCase('case-1', 'Wariant bazowy');
  useSnapshotStore.setState({ snapshot: MIGAWKA, error: null, executeDomainOperation: zapis } as never);
});

afterEach(() => {
  cleanup();
  useAppStateStore.getState().reset();
});

function renderuj(nastawy: NastawyUrzadzeniaWidok = NASTAWY) {
  return render(
    <EdytorNastawZabezpieczenia
      urzadzenieRef={REF}
      nastawy={nastawy}
      slownik={WIDOK.slownik_nastaw}
      testid="edytor"
    />,
  );
}

describe('formularz ↔ nastawy modelu (czyste przekształcenia)', () => {
  it('nastawy sieci złotej przechodzą przez formularz bez zmian (oba urządzenia)', () => {
    for (const p of MIGAWKA.protection_assignments!) {
      const ustawienia = p.settings as ProtectionSetting[];
      expect(porownawczo(nastawyZFormularza(formularzZNastaw(ustawienia), ustawienia))).toEqual(
        porownawczo(ustawienia),
      );
    }
  });

  it('stopień nieaktywny nie trafia do zapisu; nastawy innych funkcji zostają', () => {
    const ziemnozwarciowa: ProtectionSetting = {
      function_type: 'earth_fault_51N',
      threshold_a: 0.2,
      threshold_unit: 'A_WTORNY',
    };
    const formularz = formularzZNastaw(USTAWIENIA_MODELU);
    const wynik = nastawyZFormularza(
      { ...formularz, overcurrent_50: { ...formularz.overcurrent_50, aktywny: false } },
      [...USTAWIENIA_MODELU, ziemnozwarciowa],
    );
    expect(wynik.map((n) => n.function_type)).toEqual(['earth_fault_51N', 'overcurrent_51']);
  });

  it.each([
    ['DT', { zwloka: 0.4, tms: 0.3 }, { time_delay_s: 0.4 }, ['time_multiplier']],
    ['IEC_SI', { zwloka: 0.4, tms: 0.3 }, { time_multiplier: 0.3 }, ['time_delay_s']],
    ['', { zwloka: 0.4, tms: 0.3 }, {}, ['time_multiplier', 'time_delay_s', 'curve_type']],
  ] as const)('charakterystyka „%s": wysyłana tylko właściwa rodzina czasu', (krzywa, czasy, jest, brak) => {
    const formularz = formularzZNastaw([]);
    const [wpis] = nastawyZFormularza(
      {
        ...formularz,
        overcurrent_51: { aktywny: true, prog: 1.5, jednostka: 'A_WTORNY', krzywa, ...czasy },
      },
      [],
    );
    expect(wpis).toMatchObject({ function_type: 'overcurrent_51', threshold_a: 1.5, ...jest });
    for (const pole of brak) expect(wpis).not.toHaveProperty(pole);
  });

  it('pole puste nie jest zastępowane zerem (brak, nie wartość)', () => {
    const [wpis] = nastawyZFormularza(
      {
        ...formularzZNastaw([]),
        overcurrent_51: { aktywny: true, prog: null, jednostka: '', krzywa: '', tms: null, zwloka: null },
      },
      [],
    );
    expect(wpis).toEqual({ function_type: 'overcurrent_51' });
  });
});

describe('edytor na danych sieci złotej', () => {
  it('kontekst toru pomiarowego i zakresów z backendu, stopnie z nastawami modelu', () => {
    renderuj();
    expect(screen.getByTestId('edytor-przekladnia')).toHaveTextContent('600/5 A · 5P20');
    expect(screen.getByTestId('edytor-podstawa')).toHaveTextContent(NASTAWY.zakresy!.model);
    for (const stopien of NASTAWY.stopnie) {
      const pole = screen.getByTestId(`edytor-${stopien.funkcja}`);
      expect(within(pole).getByTestId(`edytor-${stopien.funkcja}-aktywny`)).toBeChecked();
      expect(within(pole).getByTestId(`edytor-${stopien.funkcja}-krzywa`)).toHaveValue(stopien.krzywa);
      expect(within(pole).getByTestId(`edytor-${stopien.funkcja}-pierwotny`)).toHaveTextContent(
        stopien.prog_pierwotny_a.toLocaleString('pl-PL', { maximumFractionDigits: 3 }),
      );
    }
    expect(screen.getByTestId('edytor-gotowe')).toHaveTextContent(T.gotowe);
  });

  it('zmiana TMS i zapis — operacja update_protection_settings z nastawami całego przypisania', async () => {
    const user = userEvent.setup();
    renderuj();
    const tms = screen.getByTestId('edytor-overcurrent_51-tms');
    await user.clear(tms);
    await user.type(tms, '0.25');
    await user.click(screen.getByTestId('edytor-zapisz'));
    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    const [caseId, operacja, ladunek] = zapis.mock.calls[0];
    expect(caseId).toBe('case-1');
    expect(operacja).toBe('update_protection_settings');
    expect(ladunek.protection_ref).toBe(REF);
    const stopien51 = ladunek.settings.find((n: ProtectionSetting) => n.function_type === 'overcurrent_51');
    const stopien50 = ladunek.settings.find((n: ProtectionSetting) => n.function_type === 'overcurrent_50');
    expect(stopien51.time_multiplier).toBe(0.25);
    expect(porownawczo([stopien50])).toEqual(
      porownawczo(USTAWIENIA_MODELU.filter((n) => n.function_type === 'overcurrent_50')),
    );
    expect(screen.queryByTestId('edytor-blad')).not.toBeInTheDocument();
  });

  it('zmiana charakterystyki na DT zamienia TMS na zwłokę i zapisuje zwłokę', async () => {
    const user = userEvent.setup();
    renderuj();
    await user.selectOptions(screen.getByTestId('edytor-overcurrent_51-krzywa'), 'DT');
    expect(screen.queryByTestId('edytor-overcurrent_51-tms')).not.toBeInTheDocument();
    await user.type(screen.getByTestId('edytor-overcurrent_51-zwloka'), '0.7');
    await user.click(screen.getByTestId('edytor-zapisz'));
    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    const stopien51 = zapis.mock.calls[0][2].settings.find(
      (n: ProtectionSetting) => n.function_type === 'overcurrent_51',
    );
    expect(stopien51).toMatchObject({ curve_type: 'DT', time_delay_s: 0.7 });
    expect(stopien51).not.toHaveProperty('time_multiplier');
  });

  it('odmowa backendu — komunikat w treści, nie cisza', async () => {
    const user = userEvent.setup();
    zapis.mockResolvedValue({ snapshot: null, error: 'Nastawa I> poza zakresem przekaźnika.' });
    renderuj();
    await user.click(screen.getByTestId('edytor-zapisz'));
    expect(await screen.findByTestId('edytor-blad')).toHaveTextContent(
      'Nastawa I> poza zakresem przekaźnika.',
    );
  });

  it('brak aktywnego przypadku — zapis zablokowany', () => {
    useAppStateStore.getState().reset();
    renderuj();
    expect(screen.getByTestId('edytor-zapisz')).toBeDisabled();
  });

  it('braki z backendu wyświetlone z akcją naprawczą zamiast „gotowe"', () => {
    renderuj({
      ...NASTAWY,
      gotowe: false,
      braki: [
        {
          kod: 'zabezpieczenia.brak_przekladnika',
          komunikat_pl: 'Wyłącznik nie ma przekładnika prądowego.',
          akcja_naprawcza_pl: 'Dodaj przekładnik prądowy przy wyłączniku.',
          funkcja: null,
        },
      ],
    });
    expect(screen.getByTestId('edytor-braki')).toHaveTextContent(
      'Wyłącznik nie ma przekładnika prądowego. Dodaj przekładnik prądowy przy wyłączniku.',
    );
    expect(screen.queryByTestId('edytor-gotowe')).not.toBeInTheDocument();
  });
});
