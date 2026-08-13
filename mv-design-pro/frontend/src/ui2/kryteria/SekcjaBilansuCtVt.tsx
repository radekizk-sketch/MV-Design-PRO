/**
 * Readout bilansu obwodów wtórnych CT/VT w kroku „Pomiar i zabezpieczenia"
 * kreatora stacji (karta KD-3, pozycja 6).
 *
 * OGNIWO ŁAŃCUCHA, NIE WYSPA. Werdykt pojawia się DOKŁADNIE tam, gdzie projektant
 * wybiera przekładnik — zanim stacja trafi do modelu. Bez tego kryterium wracałoby
 * dopiero w analizie zabezpieczeń, czyli po zbudowaniu sieci.
 *
 * ZERO FIZYKI: komponent wysyła dane obwodu do końcówki solvera i wyświetla to,
 * co wróciło. Nie ma tu ani jednego działania na wielkościach elektrycznych.
 * Uczciwy stan zerowy: brak danej = komunikat z kanonu gotowości + wskazanie, co
 * uzupełnić — nigdy kreska udająca zero.
 */

import { useEffect, useState } from 'react';

import {
  pobierzBilansCt,
  pobierzBilansVt,
  type BilansCtOdpowiedz,
  type BilansVtOdpowiedz,
} from './wyposazenieApi';
import {
  komunikatyKodow,
  pobierzRejestrGotowosci,
  type WpisRejestruGotowosci,
} from './rejestrGotowosci';
import {
  KRYTERIA_STRINGS as T,
  etykietaKategoriiUzwojenia,
  etykietaWariantuAlf,
  etykietaWerdyktu,
  fmtLiczba,
} from './strings';

export interface ObwodWtorny {
  readonly dlugosc_m: number | null;
  readonly przekroj_mm2: number | null;
  readonly moc_aparatow_va: number | null;
}

export interface SekcjaBilansuCtVtProps {
  /** Pozycja katalogowa CT; `null` = przekładnik nie wybrany. */
  ctRef: string | null;
  /** Pozycja katalogowa VT; `null` = przekładnik nie wybrany. */
  vtRef: string | null;
  obwodCt: ObwodWtorny;
  obwodVt: ObwodWtorny;
  uzwojenieVt: 'POMIAROWE' | 'ZABEZPIECZENIOWE';
  /** Sufiks identyfikatorów testowych (numer pola). */
  testidSufiks: string;
  /** Wstrzykiwalne klienty — testy podają deterministyczne stuby. */
  klientCt?: typeof pobierzBilansCt;
  klientVt?: typeof pobierzBilansVt;
  klientRejestru?: typeof pobierzRejestrGotowosci;
}

function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }): JSX.Element {
  return (
    <div className="mvd-kryteria__wiersz">
      <span className="mvd-kryteria__etykieta">{etykieta}</span>
      <span className="mvd-kryteria__wartosc">{wartosc}</span>
    </div>
  );
}

export function SekcjaBilansuCtVt({
  ctRef,
  vtRef,
  obwodCt,
  obwodVt,
  uzwojenieVt,
  testidSufiks,
  klientCt = pobierzBilansCt,
  klientVt = pobierzBilansVt,
  klientRejestru = pobierzRejestrGotowosci,
}: SekcjaBilansuCtVtProps): JSX.Element | null {
  const [ct, setCt] = useState<BilansCtOdpowiedz | null>(null);
  const [vt, setVt] = useState<BilansVtOdpowiedz | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [rejestr, setRejestr] = useState<ReadonlyMap<string, WpisRejestruGotowosci> | null>(null);

  useEffect(() => {
    let aktywne = true;
    klientRejestru()
      .then((mapa) => {
        if (aktywne) setRejestr(mapa);
      })
      .catch(() => {
        // Brak rejestru = brak zdań dla kodów; readout wartości działa dalej.
        if (aktywne) setRejestr(null);
      });
    return () => {
      aktywne = false;
    };
  }, [klientRejestru]);

  useEffect(() => {
    if (!ctRef) {
      setCt(null);
      return undefined;
    }
    let aktywne = true;
    klientCt({
      ct_catalog_ref: ctRef,
      dlugosc_przewodu_m: obwodCt.dlugosc_m,
      przekroj_przewodu_mm2: obwodCt.przekroj_mm2,
      obciazenia_aparatow:
        obwodCt.moc_aparatow_va === null
          ? []
          : [{ nazwa: T.ctMocAparatow, moc_va: obwodCt.moc_aparatow_va }],
    })
      .then((wynik) => {
        if (!aktywne) return;
        setCt(wynik);
        setBlad(null);
      })
      .catch(() => {
        if (!aktywne) return;
        setCt(null);
        setBlad(T.bladLiczenia);
      });
    return () => {
      aktywne = false;
    };
  }, [ctRef, obwodCt.dlugosc_m, obwodCt.przekroj_mm2, obwodCt.moc_aparatow_va, klientCt]);

  useEffect(() => {
    if (!vtRef) {
      setVt(null);
      return undefined;
    }
    let aktywne = true;
    klientVt({
      vt_catalog_ref: vtRef,
      uzwojenie: uzwojenieVt,
      dlugosc_przewodu_m: obwodVt.dlugosc_m,
      przekroj_przewodu_mm2: obwodVt.przekroj_mm2,
      obciazenia_aparatow:
        obwodVt.moc_aparatow_va === null
          ? []
          : [{ nazwa: T.vtMocAparatow, moc_va: obwodVt.moc_aparatow_va }],
    })
      .then((wynik) => {
        if (!aktywne) return;
        setVt(wynik);
        setBlad(null);
      })
      .catch(() => {
        if (!aktywne) return;
        setVt(null);
        setBlad(T.bladLiczenia);
      });
    return () => {
      aktywne = false;
    };
  }, [
    vtRef,
    uzwojenieVt,
    obwodVt.dlugosc_m,
    obwodVt.przekroj_mm2,
    obwodVt.moc_aparatow_va,
    klientVt,
  ]);

  if (!ctRef && !vtRef) return null;

  const brakiCt = komunikatyKodow(ct?.readiness_codes ?? [], rejestr);
  const brakiVt = komunikatyKodow(vt?.readiness_codes ?? [], rejestr);

  return (
    <section className="mvd-kryteria" data-testid={`mvd-kryteria-bilans-${testidSufiks}`}>
      {blad ? (
        <p className="mvd-kryteria__uwaga" data-testid={`mvd-kryteria-blad-${testidSufiks}`}>
          {blad}
        </p>
      ) : null}

      {ctRef ? (
        <div data-testid={`mvd-kryteria-ct-${testidSufiks}`}>
          <h4 className="mvd-kryteria__tytul">{T.ctTytul}</h4>
          <p className="mvd-kryteria__opis">{T.ctOpis}</p>
          {ct ? (
            <>
              <Wiersz etykieta={T.ctPozycja} wartosc={ct.pozycja_katalogowa} />
              <Wiersz
                etykieta={T.ctMocObliczeniowa}
                wartosc={fmtLiczba(ct.moc_obliczeniowa_va, 'VA')}
              />
              <Wiersz
                etykieta={T.ctMocPrzewodow}
                wartosc={fmtLiczba(ct.moc_przewodow_va, 'VA')}
              />
              <Wiersz
                etykieta={T.ctMocZnamionowa}
                wartosc={fmtLiczba(ct.moc_znamionowa_va, 'VA')}
              />
              <Wiersz
                etykieta={T.ctWykorzystanie}
                wartosc={fmtLiczba(ct.wykorzystanie_mocy, '')}
              />
              <Wiersz etykieta={T.ctRezystancja} wartosc={fmtLiczba(ct.rezystancja_przewodow_ohm, 'Ω')} />
              <Wiersz etykieta={T.ctAlfEfektywny} wartosc={fmtLiczba(ct.alf_efektywny, '', 2)} />
              <Wiersz etykieta={T.ctWariant} wartosc={etykietaWariantuAlf(ct.wariant_alf)} />
              <Wiersz
                etykieta={T.ctWerdyktObciazenia}
                wartosc={etykietaWerdyktu(ct.status_obciazenia)}
              />
              <Wiersz
                etykieta={T.ctWerdyktNasycenia}
                wartosc={etykietaWerdyktu(ct.status_nasycenia)}
              />
              {brakiCt.length > 0 ? (
                <ul className="mvd-kryteria__braki" data-testid={`mvd-kryteria-ct-braki-${testidSufiks}`}>
                  {brakiCt.map((tekst) => (
                    <li key={tekst}>{tekst}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mvd-kryteria__wzor">
                {T.wzorTytul}: {ct.formula_ref}
              </p>
            </>
          ) : (
            <p className="mvd-kryteria__opis">{T.ladowanie}</p>
          )}
        </div>
      ) : null}

      {vtRef ? (
        <div data-testid={`mvd-kryteria-vt-${testidSufiks}`}>
          <h4 className="mvd-kryteria__tytul">{T.vtTytul}</h4>
          <p className="mvd-kryteria__opis">{T.vtOpis}</p>
          {vt ? (
            <>
              <Wiersz etykieta={T.vtPozycja} wartosc={vt.pozycja_katalogowa} />
              <Wiersz
                etykieta={T.vtMocObliczeniowa}
                wartosc={fmtLiczba(vt.moc_obliczeniowa_va, 'VA')}
              />
              <Wiersz
                etykieta={T.vtMocZnamionowa}
                wartosc={fmtLiczba(vt.moc_znamionowa_va, 'VA')}
              />
              <Wiersz etykieta={T.vtPrad} wartosc={fmtLiczba(vt.prad_obwodu_a, 'A')} />
              <Wiersz etykieta={T.vtDeltaU} wartosc={fmtLiczba(vt.delta_u_procent, '%')} />
              <Wiersz etykieta={T.vtLimit} wartosc={fmtLiczba(vt.limit_delta_u_procent, '%', 1)} />
              {/* Kategoria STOI OBOK LIMITU — inaczej podmiana kategorii jest niewidoczna. */}
              <Wiersz
                etykieta={T.vtKategoria}
                wartosc={etykietaKategoriiUzwojenia(vt.kategoria_uzwojenia, vt.klasa_dokladnosci)}
              />
              <Wiersz
                etykieta={T.vtWerdyktObciazenia}
                wartosc={etykietaWerdyktu(vt.status_obciazenia)}
              />
              <Wiersz etykieta={T.vtWerdyktSpadku} wartosc={etykietaWerdyktu(vt.status_spadku)} />
              {brakiVt.length > 0 ? (
                <ul className="mvd-kryteria__braki" data-testid={`mvd-kryteria-vt-braki-${testidSufiks}`}>
                  {brakiVt.map((tekst) => (
                    <li key={tekst}>{tekst}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mvd-kryteria__wzor">
                {T.wzorTytul}: {vt.formula_ref}
              </p>
            </>
          ) : (
            <p className="mvd-kryteria__opis">{T.ladowanie}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
