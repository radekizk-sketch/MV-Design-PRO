/**
 * Obwód wtórny przekładnika w edytorze nastaw — jedyna droga zapisu obwodu ISTNIEJĄCEGO
 * przekładnika (operacja `set_measurement_secondary_circuit`; karta CT-JEDEN-WERDYKT).
 *
 * Wejście: PRAWDZIWY model sieci złotej G08 i PRAWDZIWY read model `protection-view` z generatora
 * fikstur (przekładniki bez zapisanego obwodu — stąd dzisiejsza wiarygodność „nieustalona").
 * Wpisy natywne (userEvent); zapis mockowany na granicy magazynu migawki.
 *
 * Iloczyn cech: {obwód w modelu zapisany, niezapisany} × {pole puste, wypełnione} ×
 * {aparat pełny, bez mocy, bez nazwy} × {zapis przyjęty, odmowa backendu, brak przypadku} ×
 * {formularz całkiem pusty → jawne skasowanie}.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import type { NastawyUrzadzeniaWidok, SlownikNastaw } from '../../../../ui/protection/nastawyModelu';
import type { EnergyNetworkModel, ObwodWtorny } from '../../../../types/enm';
import { EdytorNastawZabezpieczenia } from '../EdytorNastawZabezpieczenia';
import { formularzZObwodu, obwodZFormularza } from '../ObwodWtornyPrzekladnika';
import { NASTAWY_STRINGS as T } from '../stringsNastaw';
import migawkaSceny from '../../../../harness-fixtures/generated/koordynacja_scena_migawka.json';
import widokSceny from '../../../../harness-fixtures/generated/koordynacja_scena_widok_zabezpieczen.json';

const MIGAWKA = migawkaSceny as unknown as EnergyNetworkModel;
const WIDOK = widokSceny as unknown as {
  assignments: { device_id: string; nastawy: NastawyUrzadzeniaWidok }[];
  slownik_nastaw: SlownikNastaw;
};
const [PIERWSZE] = WIDOK.assignments;
const NASTAWY = PIERWSZE.nastawy;
const CT_REF = NASTAWY.ct_ref!;
const TID = 'mvd-edytor-nastaw-obwod';

const zapis = vi.fn();

function migawkaZObwodem(obwod: ObwodWtorny | null): EnergyNetworkModel {
  return {
    ...MIGAWKA,
    measurements: MIGAWKA.measurements.map((m) =>
      m.ref_id === CT_REF ? { ...m, obwod_wtorny: obwod } : m,
    ),
  };
}

function renderuj() {
  return render(
    <EdytorNastawZabezpieczenia
      urzadzenieRef={PIERWSZE.device_id}
      nastawy={NASTAWY}
      slownik={WIDOK.slownik_nastaw}
    />,
  );
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

describe('fikstura — warunek wstępny', () => {
  it('przekładnik pierwszego zabezpieczenia sieci złotej istnieje i nie ma zapisanego obwodu', () => {
    expect(CT_REF).toBeTruthy();
    const ct = MIGAWKA.measurements.find((m) => m.ref_id === CT_REF);
    expect(ct?.measurement_type).toBe('CT');
    expect(ct?.obwod_wtorny ?? null).toBeNull();
  });
});

describe('formularz ↔ model (czyste funkcje)', () => {
  it('obwód niezapisany → formularz pusty → null (jawne skasowanie, nie pusty obiekt)', () => {
    const f = formularzZObwodu(null);
    expect(f).toEqual({ dlugosc_m: null, przekroj_mm2: null, aparaty: [], moc_stykow_va: null });
    expect(obwodZFormularza(f)).toBeNull();
  });

  it('obwód zapisany → formularz → ten sam obwód (pola puste nie wchodzą do ładunku)', () => {
    const obwod: ObwodWtorny = {
      dlugosc_przewodu_m: 12,
      przekroj_przewodu_mm2: 4,
      obciazenia_aparatow: [{ nazwa: 'Przekaźnik', moc_va: 0.5 }],
    };
    expect(obwodZFormularza(formularzZObwodu(obwod))).toEqual(obwod);
  });

  it('aparat bez mocy albo bez nazwy nie jest wysyłany — brak danej, nie zero', () => {
    expect(
      obwodZFormularza({
        dlugosc_m: 5,
        przekroj_mm2: null,
        aparaty: [
          { nazwa: 'Przekaźnik', moc_va: null },
          { nazwa: '  ', moc_va: 1 },
          { nazwa: ' Licznik ', moc_va: 2 },
        ],
        moc_stykow_va: null,
      }),
    ).toEqual({ dlugosc_przewodu_m: 5, obciazenia_aparatow: [{ nazwa: 'Licznik', moc_va: 2 }] });
  });
});

describe('ścieżka projektanta w edytorze nastaw', () => {
  it('obwód niezapisany: wpis długości, przekroju i aparatu → operacja z tym obwodem', async () => {
    const user = userEvent.setup();
    renderuj();
    expect(screen.getByTestId(TID)).toHaveTextContent(T.obwodTytul);
    expect(screen.getByTestId(`${TID}-dlugosc`)).toHaveValue(null);

    await user.type(screen.getByTestId(`${TID}-dlugosc`), '5');
    await user.type(screen.getByTestId(`${TID}-przekroj`), '2.5');
    await user.click(screen.getByTestId(`${TID}-dodaj-aparat`));
    await user.type(screen.getByTestId(`${TID}-aparat-0-nazwa`), 'Przekaźnik');
    await user.type(screen.getByTestId(`${TID}-aparat-0-moc`), '18');
    await user.click(screen.getByTestId(`${TID}-zapisz`));

    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    expect(zapis).toHaveBeenCalledWith('case-1', 'set_measurement_secondary_circuit', {
      measurement_ref: CT_REF,
      obwod_wtorny: {
        dlugosc_przewodu_m: 5,
        przekroj_przewodu_mm2: 2.5,
        obciazenia_aparatow: [{ nazwa: 'Przekaźnik', moc_va: 18 }],
      },
    });
  });

  it('obwód zapisany: formularz pokazuje stan MODELU; usunięcie aparatu i skasowanie pól → null', async () => {
    useSnapshotStore.setState({
      snapshot: migawkaZObwodem({
        dlugosc_przewodu_m: 7,
        przekroj_przewodu_mm2: 4,
        obciazenia_aparatow: [{ nazwa: 'Przekaźnik', moc_va: 1 }],
        moc_stykow_va: 0.2,
      }),
    } as never);
    const user = userEvent.setup();
    renderuj();
    expect(screen.getByTestId(`${TID}-dlugosc`)).toHaveValue(7);
    expect(screen.getByTestId(`${TID}-przekroj`)).toHaveValue(4);
    expect(screen.getByTestId(`${TID}-moc-stykow`)).toHaveValue(0.2);
    expect(screen.getByTestId(`${TID}-aparat-0-nazwa`)).toHaveValue('Przekaźnik');

    await user.click(screen.getByTestId(`${TID}-aparat-0-usun`));
    await user.clear(screen.getByTestId(`${TID}-dlugosc`));
    await user.clear(screen.getByTestId(`${TID}-przekroj`));
    await user.clear(screen.getByTestId(`${TID}-moc-stykow`));
    await user.click(screen.getByTestId(`${TID}-zapisz`));

    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    expect(zapis).toHaveBeenCalledWith('case-1', 'set_measurement_secondary_circuit', {
      measurement_ref: CT_REF,
      obwod_wtorny: null,
    });
  });

  it('odmowa backendu: komunikat operacji widoczny, bez cichego sukcesu', async () => {
    zapis.mockResolvedValueOnce({ snapshot: MIGAWKA, error: 'Przekrój musi być dodatni.' });
    const user = userEvent.setup();
    renderuj();
    await user.type(screen.getByTestId(`${TID}-dlugosc`), '5');
    await user.click(screen.getByTestId(`${TID}-zapisz`));
    expect(await screen.findByTestId(`${TID}-blad`)).toHaveTextContent('Przekrój musi być dodatni.');
  });

  it('brak przypadku: zapis zablokowany, operacja nie wychodzi', () => {
    useAppStateStore.getState().reset();
    renderuj();
    expect(screen.getByTestId(`${TID}-zapisz`)).toBeDisabled();
    expect(zapis).not.toHaveBeenCalled();
  });

  it('zabezpieczenie bez przekładnika: sekcji obwodu nie ma (nie ma czego zapisać)', () => {
    render(
      <EdytorNastawZabezpieczenia
        urzadzenieRef={PIERWSZE.device_id}
        nastawy={{ ...NASTAWY, ct_ref: null }}
        slownik={WIDOK.slownik_nastaw}
      />,
    );
    expect(screen.queryByTestId(TID)).toBeNull();
  });
});
