/**
 * Readouty kryteriów na KARCIE TECHNICZNEJ pozycji katalogu (karta KD-3, poz. 6).
 *
 * DLACZEGO TUTAJ (uzasadnienie miejsca wg FLOW projektanta). Starzenie izolacji i
 * straty transformatora to własności TYPU, nie konkretnego elementu w sieci:
 * pytanie „jak szybko zestarzeje się ten kabel przy 100 °C” i „ile ten
 * transformator traci przy β = 0,6” zadaje się PRZY WYBORZE typu, w etapie doboru
 * (E3), a nie po zbudowaniu modelu. Karta techniczna jest jedynym miejscem, gdzie
 * projektant widzi komplet danych znamionowych tego typu — dopisanie tam obu
 * kryteriów zamyka pytanie w tym samym miejscu, w którym powstaje.
 * (Bilans CT/VT jest przeciwieństwem: zależy od OBWODU konkretnego pola, więc
 * mieszka w kroku CT/VT kreatora stacji.)
 *
 * ZERO FIZYKI: obie sekcje wyłącznie wysyłają `catalog_ref` + jedną daną wejściową
 * i wyświetlają zwróconą wartość.
 */

import { useEffect, useState } from 'react';

import {
  pobierzStarzenieKabla,
  pobierzStratyTransformatora,
  type StarzenieKablaOdpowiedz,
  type StratyTransformatoraOdpowiedz,
} from './wyposazenieApi';
import {
  komunikatyKodow,
  pobierzRejestrGotowosci,
  type WpisRejestruGotowosci,
} from './rejestrGotowosci';
import { KRYTERIA_STRINGS as T, etykietaWerdyktu, fmtLiczba } from './strings';

function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }): JSX.Element {
  return (
    <div className="mvd-kryteria__wiersz">
      <span className="mvd-kryteria__etykieta">{etykieta}</span>
      <span className="mvd-kryteria__wartosc">{wartosc}</span>
    </div>
  );
}

function useRejestr(
  klientRejestru: typeof pobierzRejestrGotowosci,
): ReadonlyMap<string, WpisRejestruGotowosci> | null {
  const [rejestr, setRejestr] = useState<ReadonlyMap<string, WpisRejestruGotowosci> | null>(null);
  useEffect(() => {
    let aktywne = true;
    klientRejestru()
      .then((mapa) => {
        if (aktywne) setRejestr(mapa);
      })
      .catch(() => {
        if (aktywne) setRejestr(null);
      });
    return () => {
      aktywne = false;
    };
  }, [klientRejestru]);
  return rejestr;
}

// ---------------------------------------------------------------------------
// Starzenie termiczne izolacji kabla
// ---------------------------------------------------------------------------

export interface SekcjaStarzeniaKablaProps {
  typId: string;
  /** Temperatura pracy [°C] — projektant podaje ją w karcie. */
  temperaturaPracyC: number | null;
  onZmianaTemperatury: (wartosc: number | null) => void;
  klient?: typeof pobierzStarzenieKabla;
  klientRejestru?: typeof pobierzRejestrGotowosci;
}

export function SekcjaStarzeniaKabla({
  typId,
  temperaturaPracyC,
  onZmianaTemperatury,
  klient = pobierzStarzenieKabla,
  klientRejestru = pobierzRejestrGotowosci,
}: SekcjaStarzeniaKablaProps): JSX.Element {
  const [wynik, setWynik] = useState<StarzenieKablaOdpowiedz | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const rejestr = useRejestr(klientRejestru);

  useEffect(() => {
    let aktywne = true;
    klient({ cable_catalog_ref: typId, temperatura_pracy_c: temperaturaPracyC })
      .then((odp) => {
        if (!aktywne) return;
        setWynik(odp);
        setBlad(null);
      })
      .catch(() => {
        if (!aktywne) return;
        setWynik(null);
        setBlad(T.bladLiczenia);
      });
    return () => {
      aktywne = false;
    };
  }, [typId, temperaturaPracyC, klient]);

  const braki = komunikatyKodow(wynik?.readiness_codes ?? [], rejestr);

  return (
    <section className="mvd-kryteria" aria-label={T.kabelTytul} data-testid="mvd-kryteria-starzenie">
      <h4 className="mvd-kryteria__tytul">{T.kabelTytul}</h4>
      <p className="mvd-kryteria__opis">{T.kabelOpis}</p>
      <label className="mvd-kryteria__pole">
        <span className="mvd-kryteria__etykieta">{T.kabelTemperaturaPracy}</span>
        <input
          type="number"
          className="mvd-kryteria__input"
          value={temperaturaPracyC === null ? '' : temperaturaPracyC}
          step={1}
          data-testid="mvd-kryteria-starzenie-temperatura"
          onChange={(e) => {
            if (e.target.value === '') {
              onZmianaTemperatury(null);
              return;
            }
            const n = Number(e.target.value);
            onZmianaTemperatury(Number.isNaN(n) ? null : n);
          }}
        />
      </label>
      {blad ? <p className="mvd-kryteria__uwaga">{blad}</p> : null}
      {wynik ? (
        <>
          <Wiersz etykieta={T.kabelIzolacja} wartosc={wynik.typ_izolacji ?? T.kreska} />
          <Wiersz
            etykieta={T.kabelTemperaturaZnamionowa}
            wartosc={fmtLiczba(wynik.temperatura_znamionowa_c, '°C', 1)}
          />
          <Wiersz etykieta={T.kabelRoznica} wartosc={fmtLiczba(wynik.roznica_temperatur_c, '°C', 1)} />
          <Wiersz
            etykieta={T.kabelWspolczynnik}
            wartosc={fmtLiczba(wynik.wspolczynnik_starzenia, '')}
          />
          <Wiersz etykieta={T.kabelZywotnosc} wartosc={fmtLiczba(wynik.wzgledna_zywotnosc, '')} />
          <Wiersz etykieta={T.kabelWerdykt} wartosc={etykietaWerdyktu(wynik.status)} />
          {braki.length > 0 ? (
            <ul className="mvd-kryteria__braki" data-testid="mvd-kryteria-starzenie-braki">
              {braki.map((tekst) => (
                <li key={tekst}>{tekst}</li>
              ))}
            </ul>
          ) : null}
          <p className="mvd-kryteria__wzor">
            {T.wzorTytul}: {wynik.formula_ref}
          </p>
        </>
      ) : (
        <p className="mvd-kryteria__opis">{T.ladowanie}</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Straty transformatora
// ---------------------------------------------------------------------------

export interface SekcjaStratTransformatoraProps {
  typId: string;
  /** Współczynnik obciążenia β; `null` = nie podany (uczciwy stan zerowy). */
  beta: number | null;
  onZmianaBety: (wartosc: number | null) => void;
  klient?: typeof pobierzStratyTransformatora;
  klientRejestru?: typeof pobierzRejestrGotowosci;
}

export function SekcjaStratTransformatora({
  typId,
  beta,
  onZmianaBety,
  klient = pobierzStratyTransformatora,
  klientRejestru = pobierzRejestrGotowosci,
}: SekcjaStratTransformatoraProps): JSX.Element {
  const [wynik, setWynik] = useState<StratyTransformatoraOdpowiedz | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const rejestr = useRejestr(klientRejestru);

  useEffect(() => {
    let aktywne = true;
    klient({ transformer_catalog_ref: typId, beta })
      .then((odp) => {
        if (!aktywne) return;
        setWynik(odp);
        setBlad(null);
      })
      .catch(() => {
        if (!aktywne) return;
        setWynik(null);
        setBlad(T.bladLiczenia);
      });
    return () => {
      aktywne = false;
    };
  }, [typId, beta, klient]);

  const braki = komunikatyKodow(wynik?.readiness_codes ?? [], rejestr);

  return (
    <section className="mvd-kryteria" aria-label={T.trafoTytul} data-testid="mvd-kryteria-straty">
      <h4 className="mvd-kryteria__tytul">{T.trafoTytul}</h4>
      <p className="mvd-kryteria__opis">{T.trafoOpis}</p>
      <label className="mvd-kryteria__pole">
        <span className="mvd-kryteria__etykieta">{T.trafoBeta}</span>
        <input
          type="number"
          className="mvd-kryteria__input"
          value={beta === null ? '' : beta}
          step={0.05}
          min={0}
          max={2}
          data-testid="mvd-kryteria-straty-beta"
          onChange={(e) => {
            if (e.target.value === '') {
              onZmianaBety(null);
              return;
            }
            const n = Number(e.target.value);
            onZmianaBety(Number.isNaN(n) ? null : n);
          }}
        />
      </label>
      {blad ? <p className="mvd-kryteria__uwaga">{blad}</p> : null}
      {wynik ? (
        <>
          <Wiersz etykieta={T.trafoStratyJalowe} wartosc={fmtLiczba(wynik.straty_jalowe_kw, 'kW')} />
          <Wiersz
            etykieta={T.trafoStratyObciazeniowe}
            wartosc={fmtLiczba(wynik.straty_obciazeniowe_kw, 'kW')}
          />
          <Wiersz
            etykieta={T.trafoStratyCalkowite}
            wartosc={fmtLiczba(wynik.straty_calkowite_kw, 'kW')}
          />
          <Wiersz etykieta={T.trafoBetaOpt} wartosc={fmtLiczba(wynik.beta_optymalny, '')} />
          <Wiersz
            etykieta={T.trafoStratyOpt}
            wartosc={fmtLiczba(wynik.straty_przy_beta_opt_kw, 'kW')}
          />
          <Wiersz
            etykieta={T.trafoUdzialJalowych}
            wartosc={fmtLiczba(wynik.udzial_strat_jalowych, '')}
          />
          <Wiersz etykieta={T.trafoWerdykt} wartosc={etykietaWerdyktu(wynik.status)} />
          {braki.length > 0 ? (
            <ul className="mvd-kryteria__braki" data-testid="mvd-kryteria-straty-braki">
              {braki.map((tekst) => (
                <li key={tekst}>{tekst}</li>
              ))}
            </ul>
          ) : null}
          <p className="mvd-kryteria__wzor">
            {T.wzorTytul}: {wynik.formula_ref}
          </p>
        </>
      ) : (
        <p className="mvd-kryteria__opis">{T.ladowanie}</p>
      )}
    </section>
  );
}
