/**
 * Testy readoutów kryteriów wyposażenia (karta KD-3, pozycja 6).
 *
 * PILNOWANA WŁASNOŚĆ NACZELNA: prezentacja NICZEGO NIE LICZY. Testy podają
 * klientom wartości, których nie da się otrzymać z danych wejściowych żadnym
 * sensownym wzorem — jeśli readout je pokaże, znaczy że pochodzą z backendu.
 * Ten sam wzorzec przypięcia kontraktu co L-13 w karcie KD-2.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SekcjaBilansuCtVt } from '../SekcjaBilansuCtVt';
import { SekcjaStarzeniaKabla, SekcjaStratTransformatora } from '../SekcjaKartyKatalogu';
import { komunikatyKodow } from '../rejestrGotowosci';
import type {
  BilansCtOdpowiedz,
  BilansVtOdpowiedz,
  StarzenieKablaOdpowiedz,
  StratyTransformatoraOdpowiedz,
} from '../wyposazenieApi';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const REJESTR = async () =>
  new Map([
    [
      'ct.winding_resistance_missing',
      {
        code: 'ct.winding_resistance_missing',
        message_pl: 'Brak rezystancji uzwojenia wtórnego przekładnika',
        level: 'WARNING',
        fix_action_id: 'fix_ct_winding_resistance',
      },
    ],
    [
      'vt.winding_category_missing',
      {
        code: 'vt.winding_category_missing',
        message_pl:
          'Nierozpoznana klasa uzwojenia przekładnika napięciowego — bez kategorii '
          + '(pomiarowe/zabezpieczeniowe) nie ma limitu zmiany napięcia',
        level: 'WARNING',
        fix_action_id: 'fix_vt_winding_category',
      },
    ],
  ]);

function bilansCt(over: Partial<BilansCtOdpowiedz> = {}): BilansCtOdpowiedz {
  return {
    status: 'PASS',
    status_obciazenia: 'PASS',
    status_nasycenia: 'PASS',
    rezystancja_przewodow_ohm: 0.2155125,
    moc_przewodow_va: 5.3878125,
    moc_aparatow_va: 3.5,
    moc_obliczeniowa_va: 8.8878125,
    moc_wewnetrzna_va: 5,
    wykorzystanie_mocy: 0.88878125,
    alf_efektywny: 21.601674,
    zapas_alf: 6.601674,
    wariant_alf: 'PELNY_IEC61869_2',
    readiness_codes: [],
    formula_ref: 'S2obl = S_aparatow + I2n²·Rp',
    assumptions: ['Obwod wtorny DWUPRZEWODOWY'],
    white_box_trace: [],
    pozycja_katalogowa: 'CT 400/5 A kl. 5P20 15 VA',
    klasa_dokladnosci: '5P20',
    moc_znamionowa_va: 10,
    prad_wtorny_znamionowy_a: 5,
    ...over,
  };
}

function bilansVt(over: Partial<BilansVtOdpowiedz> = {}): BilansVtOdpowiedz {
  return {
    status: 'PASS',
    status_obciazenia: 'PASS',
    status_spadku: 'PASS',
    rezystancja_przewodow_ohm: 0.551712,
    moc_aparatow_va: 12,
    moc_obliczeniowa_va: 12,
    wykorzystanie_mocy: 0.4,
    prad_obwodu_a: 0.12,
    delta_u_v: 0.06620544,
    delta_u_procent: 0.06620544,
    limit_delta_u_procent: 0.5,
    kategoria_uzwojenia: 'POMIAROWE',
    readiness_codes: [],
    formula_ref: 'I2 = S2obl/U2n',
    assumptions: [],
    white_box_trace: [],
    pozycja_katalogowa: 'VT 15 kV / 100 V kl. 0.5',
    klasa_dokladnosci: '0.5',
    moc_znamionowa_va: 30,
    napiecie_wtorne_v: 100,
    ...over,
  };
}

describe('SekcjaBilansuCtVt — readout bilansu obwodów wtórnych', () => {
  it('pokazuje wartości Z BACKENDU, nie przeliczone w UI', async () => {
    // Wartość celowo NIEZGODNA z jakimkolwiek wzorem na tych wejściach:
    // gdyby readout liczył sam, pokazałby 8,888 VA, a nie 12,345 VA.
    const klientCt = vi.fn(async () => bilansCt({ moc_obliczeniowa_va: 12.345 }));
    const klientVt = vi.fn(async () => bilansVt({ delta_u_procent: 0.999 }));

    render(
      <SekcjaBilansuCtVt
        ctRef="ct-1"
        vtRef="vt-1"
        obwodCt={{ dlugosc_m: 25, przekroj_mm2: 4, moc_aparatow_va: 3.5 }}
        obwodVt={{ dlugosc_m: 40, przekroj_mm2: 2.5, moc_aparatow_va: 12 }}
        uzwojenieVt="POMIAROWE"
        testidSufiks="1"
        klientCt={klientCt}
        klientVt={klientVt}
        klientRejestru={REJESTR}
      />,
    );

    await waitFor(() => expect(screen.getByText('12,345 VA')).toBeTruthy());
    expect(screen.getByText('0,999 %')).toBeTruthy();
    expect(klientCt).toHaveBeenCalledWith(
      expect.objectContaining({
        ct_catalog_ref: 'ct-1',
        dlugosc_przewodu_m: 25,
        przekroj_przewodu_mm2: 4,
      }),
    );
    expect(klientVt).toHaveBeenCalledWith(
      expect.objectContaining({ vt_catalog_ref: 'vt-1', uzwojenie: 'POMIAROWE' }),
    );
  });

  it('kod gotowości pokazuje ZDANIE z kanonu, nigdy identyfikatora kodu', async () => {
    const klientCt = vi.fn(async () =>
      bilansCt({
        wariant_alf: 'UPROSZCZONY_BEZ_RCT',
        readiness_codes: ['ct.winding_resistance_missing'],
      }),
    );
    render(
      <SekcjaBilansuCtVt
        ctRef="ct-1"
        vtRef={null}
        obwodCt={{ dlugosc_m: 25, przekroj_mm2: 4, moc_aparatow_va: 3.5 }}
        obwodVt={{ dlugosc_m: null, przekroj_mm2: null, moc_aparatow_va: null }}
        uzwojenieVt="POMIAROWE"
        testidSufiks="1"
        klientCt={klientCt}
        klientVt={vi.fn(async () => bilansVt())}
        klientRejestru={REJESTR}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Brak rezystancji uzwojenia wtórnego przekładnika')).toBeTruthy(),
    );
    // Identyfikator kodu NIE MOŻE pojawić się w tekście dla inżyniera.
    expect(screen.queryByText(/ct\.winding_resistance_missing/)).toBeNull();
    // Wariant uproszczony opisany po polsku, nie nazwą techniczną.
    expect(screen.queryByText(/UPROSZCZONY_BEZ_RCT/)).toBeNull();
    expect(
      screen.getByText('uproszczony (bez rezystancji uzwojenia — wynik optymistyczny)'),
    ).toBeTruthy();
  });

  it('kategoria uzwojenia stoi OBOK limitu (podmiana kategorii nie jest niewidoczna)', async () => {
    // Odpowiedź toru ZABEZPIECZENIOWEGO: limit 1,0 % ma przy sobie kategorię,
    // z której został wzięty. Bez tego wiersza ekran pokazywał sam limit i
    // przeczył etykiecie wybranego uzwojenia tuż nad readoutem.
    const klientVt = vi.fn(async () =>
      bilansVt({
        status_spadku: 'PASS',
        limit_delta_u_procent: 1.0,
        kategoria_uzwojenia: 'ZABEZPIECZENIOWE',
        klasa_dokladnosci: '3P',
      }),
    );

    render(
      <SekcjaBilansuCtVt
        ctRef={null}
        vtRef="vt-1"
        obwodCt={{ dlugosc_m: null, przekroj_mm2: null, moc_aparatow_va: null }}
        obwodVt={{ dlugosc_m: 100, przekroj_mm2: 1.5, moc_aparatow_va: 30 }}
        uzwojenieVt="ZABEZPIECZENIOWE"
        testidSufiks="1"
        klientCt={vi.fn(async () => bilansCt())}
        klientVt={klientVt}
        klientRejestru={REJESTR}
      />,
    );

    await waitFor(() => expect(screen.getByText('1,0 %')).toBeTruthy());
    expect(screen.getByText('zabezpieczeniowa (klasa 3P)')).toBeTruthy();
    // Kategoria opisana po polsku — wartość kontraktu nie jest tekstem dla inżyniera.
    expect(screen.queryByText(/ZABEZPIECZENIOWE/)).toBeNull();
  });

  it('brak klasy pytanego uzwojenia: uczciwy stan zerowy zamiast werdyktu', async () => {
    // Przekładnik czysto zabezpieczeniowy pytany o uzwojenie POMIAROWE: backend
    // nie zgaduje kategorii, więc readout nie ma czego pokazać poza brakiem.
    const klientVt = vi.fn(async () =>
      bilansVt({
        status: 'UNAVAILABLE',
        status_spadku: 'UNAVAILABLE',
        limit_delta_u_procent: null,
        kategoria_uzwojenia: null,
        klasa_dokladnosci: null,
        readiness_codes: ['vt.winding_category_missing'],
      }),
    );

    render(
      <SekcjaBilansuCtVt
        ctRef={null}
        vtRef="vt-1"
        obwodCt={{ dlugosc_m: null, przekroj_mm2: null, moc_aparatow_va: null }}
        obwodVt={{ dlugosc_m: 100, przekroj_mm2: 1.5, moc_aparatow_va: 30 }}
        uzwojenieVt="POMIAROWE"
        testidSufiks="1"
        klientCt={vi.fn(async () => bilansCt())}
        klientVt={klientVt}
        klientRejestru={REJESTR}
      />,
    );

    // Zdanie kanonu gotowości mówi, CZEGO brakuje.
    await waitFor(() =>
      expect(
        screen.getByText(
          'Nierozpoznana klasa uzwojenia przekładnika napięciowego — bez kategorii '
          + '(pomiarowe/zabezpieczeniowe) nie ma limitu zmiany napięcia',
        ),
      ).toBeTruthy(),
    );
    // Werdykt zmiany napięcia NIE udaje spełnienia kryterium.
    expect(screen.getByText('brak podstawy do oceny')).toBeTruthy();
    expect(
      screen.getByText('nieustalona — brak klasy tego uzwojenia w danych katalogowych'),
    ).toBeTruthy();
    // Żaden limit nie został przyjęty — w szczególności zabezpieczeniowy 1,0 %.
    expect(screen.queryByText('1,0 %')).toBeNull();
    expect(screen.queryByText('0,5 %')).toBeNull();
    // Identyfikator kodu nie trafia do tekstu dla inżyniera.
    expect(screen.queryByText(/vt\.winding_category_missing/)).toBeNull();
  });

  // `async` + `waitFor`: pobranie rejestru gotowości kończy się PO renderze i
  // aktualizuje stan komponentu. Bez odczekania React zgłaszał ostrzeżenie
  // „update … not wrapped in act", które zagłusza ostrzeżenia realnych defektów.
  it('bez wskazanego przekładnika sekcja się nie renderuje (uczciwy stan zerowy)', async () => {
    const { container } = render(
      <SekcjaBilansuCtVt
        ctRef={null}
        vtRef={null}
        obwodCt={{ dlugosc_m: null, przekroj_mm2: null, moc_aparatow_va: null }}
        obwodVt={{ dlugosc_m: null, przekroj_mm2: null, moc_aparatow_va: null }}
        uzwojenieVt="POMIAROWE"
        testidSufiks="1"
        klientCt={vi.fn(async () => bilansCt())}
        klientVt={vi.fn(async () => bilansVt())}
        klientRejestru={REJESTR}
      />,
    );
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});

describe('Karta katalogu — starzenie kabla i straty transformatora', () => {
  it('starzenie: współczynnik pochodzi z backendu (kontrakt przypięty wartością)', async () => {
    const klient = vi.fn(
      async (): Promise<StarzenieKablaOdpowiedz> => ({
        status: 'FAIL',
        roznica_temperatur_c: 10,
        // 2^(10/10) = 2,0 — celowo zwracamy 7,777, żeby zobaczyć, że readout
        // NIE liczy potęgi sam.
        wspolczynnik_starzenia: 7.777,
        wzgledna_zywotnosc: 0.128,
        temperatura_znamionowa_c: 90,
        typ_izolacji: 'XLPE',
        readiness_codes: [],
        formula_ref: 'V = 2^((θ_pracy − θ_zn)/10)',
        assumptions: [],
        white_box_trace: [],
        pozycja_katalogowa: 'Kabel XLPE Cu 1×120 mm²',
      }),
    );
    render(
      <SekcjaStarzeniaKabla
        typId="kabel-1"
        temperaturaPracyC={100}
        onZmianaTemperatury={vi.fn()}
        klient={klient}
        klientRejestru={REJESTR}
      />,
    );
    await waitFor(() => expect(screen.getByText('7,777')).toBeTruthy());
    expect(klient).toHaveBeenCalledWith({
      cable_catalog_ref: 'kabel-1',
      temperatura_pracy_c: 100,
    });
  });

  it('straty: wartości i β_opt pochodzą z backendu', async () => {
    const klient = vi.fn(
      async (): Promise<StratyTransformatoraOdpowiedz> => ({
        status: 'PASS',
        straty_jalowe_kw: 1.1,
        straty_obciazeniowe_kw: 3.78,
        // Suma celowo NIEZGODNA z 1,1 + 3,78 = 4,88 — readout nie sumuje sam.
        straty_calkowite_kw: 9.99,
        beta: 0.6,
        beta_optymalny: 0.323669,
        straty_przy_beta_opt_kw: 2.2,
        moc_obciazenia_mva: 0.378,
        udzial_strat_jalowych: 0.22541,
        readiness_codes: [],
        formula_ref: 'ΔP(β) = P0 + β²·Pk',
        assumptions: [],
        white_box_trace: [],
        pozycja_katalogowa: 'TR 630 kVA 15/0,4 kV Dyn11',
        moc_znamionowa_mva: 0.63,
      }),
    );
    render(
      <SekcjaStratTransformatora
        typId="trafo-1"
        beta={0.6}
        onZmianaBety={vi.fn()}
        klient={klient}
        klientRejestru={REJESTR}
      />,
    );
    await waitFor(() => expect(screen.getByText('9,990 kW')).toBeTruthy());
    expect(screen.getByText('0,324')).toBeTruthy();
  });
});

describe('komunikatyKodow', () => {
  it('pomija kody bez odpowiednika w kanonie (zero fabrykacji zdania)', () => {
    const rejestr = new Map([
      [
        'a.b',
        { code: 'a.b', message_pl: 'Zdanie kanonu', level: 'WARNING', fix_action_id: null },
      ],
    ]);
    expect(komunikatyKodow(['a.b', 'nie.ma.takiego'], rejestr)).toEqual(['Zdanie kanonu']);
  });

  it('bez rejestru nie pokazuje niczego (identyfikator nie jest tekstem)', () => {
    expect(komunikatyKodow(['a.b'], null)).toEqual([]);
  });
});
