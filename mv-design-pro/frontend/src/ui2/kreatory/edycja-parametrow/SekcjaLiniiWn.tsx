/**
 * Sekcja „Linia napowietrzna 110 kV" kreatora edycji parametrów — przewód fazowy z katalogu
 * PRZEWOD_LINII_WN i geometria słupa (dana projektu), z podglądem R′, X′, B′ i Z′0.
 *
 * Komponent sterowany: stan formularza trzyma kreator (jeden zapis z pozostałymi polami).
 * Podgląd wywołuje backend (`POST /api/catalog/overhead-conductor-types/{id}/parametry-linii`)
 * — liczby, kompletność dowodu i pasma wiarygodności pochodzą z solvera i warstwy interpretacji;
 * sekcja ich nie przelicza (NOT-A-SOLVER).
 */

import { useCallback, useState } from 'react';
import { MathInline } from '../../../ui/proof/MathRenderer';

import { fetchPodgladParametrowLiniiWn, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type {
  OverheadConductorType,
  PodgladParametrowLiniiWn,
  PropozycjaDanejLiniiWn,
} from '../../../ui/catalog/types';
import {
  KreatorInfo,
  KreatorSekcja,
  KreatorSiatka,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
} from '../rama';
import {
  geometriaZFormularza,
  type FormularzLiniiWn,
  type PoleGeometrii,
  type PolozenieFormularza,
  type TrybOdgromowych,
} from './geometriaLiniiWn';
import { EDYCJA_PARAMETROW_STRINGS as T } from './strings';
import { StanDanychWyniku } from '../../wyniki/wzorzec/KartaWerdyktu';

export interface SekcjaLiniiWnProps {
  formularz: FormularzLiniiWn;
  onZmien: (formularz: FormularzLiniiWn) => void;
  przewodyFazowe: readonly OverheadConductorType[];
  przewodyOdgromowe: readonly OverheadConductorType[];
  propozycje: readonly PropozycjaDanejLiniiWn[];
  /** Pole z błędem kształtu (z `geometriaZFormularza`), `null` = brak błędu. */
  bladPola: PoleGeometrii | null;
  /** Częstotliwość studium modelu (nagłówek ENM) — ta sama, z którą liczy zapis. */
  czestotliwoscHz: number;
  /** Kursor w pierwszym polu geometrii (akcja naprawcza gotowości wskazuje `geometria_slupa`). */
  fokusGeometrii: boolean;
}

type StanPodgladu =
  | { readonly rodzaj: 'brak' }
  | { readonly rodzaj: 'laduje' }
  | { readonly rodzaj: 'wynik'; readonly podglad: PodgladParametrowLiniiWn }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

function podpowiedz(
  propozycje: readonly PropozycjaDanejLiniiWn[],
  parametr: PropozycjaDanejLiniiWn['parametr'],
): string | undefined {
  const propozycja = propozycje.find((p) => p.parametr === parametr);
  return propozycja ? `${T.liniaWnPustePole} ${propozycja.odniesienie}` : undefined;
}

function liczbaPodgladu(wartosc: number | null): string {
  return wartosc === null ? '—' : wartosc.toLocaleString('pl-PL', { maximumSignificantDigits: 5 });
}

export function SekcjaLiniiWn({
  formularz,
  onZmien,
  przewodyFazowe,
  przewodyOdgromowe,
  propozycje,
  bladPola,
  czestotliwoscHz,
  fokusGeometrii,
}: SekcjaLiniiWnProps) {
  const [podglad, setPodglad] = useState<StanPodgladu>({ rodzaj: 'brak' });

  const zmien = useCallback(
    (zmiana: Partial<FormularzLiniiWn>) => {
      onZmien({ ...formularz, ...zmiana });
      setPodglad({ rodzaj: 'brak' });
    },
    [formularz, onZmien],
  );
  const zmienPolozenie = useCallback(
    (klucz: 'fazy' | 'odgromowe', indeks: number, os: keyof PolozenieFormularza, wartosc: string) => {
      const wiersze = formularz[klucz].map((w, i) => (i === indeks ? { ...w, [os]: wartosc } : w));
      zmien({ [klucz]: wiersze });
    },
    [formularz, zmien],
  );

  const onPodglad = useCallback(async () => {
    const wynik = geometriaZFormularza(formularz);
    if (!formularz.przewodId || wynik.rodzaj === 'blad') return;
    setPodglad({ rodzaj: 'laduje' });
    try {
      const odpowiedz = await fetchPodgladParametrowLiniiWn(
        formularz.przewodId,
        { ...wynik.geometria },
        czestotliwoscHz,
      );
      setPodglad({ rodzaj: 'wynik', podglad: odpowiedz });
    } catch (e) {
      setPodglad({ rodzaj: 'blad', komunikat: getCatalogErrorMessage(e) });
    }
  }, [czestotliwoscHz, formularz]);

  const opcjePrzewodow = [
    { id: '', etykieta: T.liniaWnPrzewodWybierz },
    ...przewodyFazowe.map((p) => ({ id: p.id, etykieta: p.name })),
  ];
  const opcjeOdgromowych = [
    { id: '', etykieta: T.liniaWnOdgromowyRoboczy },
    ...przewodyOdgromowe.map((p) => ({ id: p.id, etykieta: p.name })),
  ];
  const opcjeTrybu = (Object.keys(T.liniaWnTrybyOdgromowych) as TrybOdgromowych[]).map((id) => ({
    id,
    etykieta: T.liniaWnTrybyOdgromowych[id],
  }));
  const podgladMozliwy = Boolean(formularz.przewodId) && bladPola === null;

  return (
    <KreatorSekcja tytul={T.liniaWnTytul} testid="mvd-kreator-edycja-linia-wn">
      <KreatorInfo>{T.liniaWnPomoc}</KreatorInfo>
      <PoleWyboru
        etykieta={T.liniaWnPrzewod}
        wartosc={formularz.przewodId}
        onZmiana={(v) => zmien({ przewodId: v })}
        opcje={opcjePrzewodow}
        pomoc={T.liniaWnPrzewodPomoc}
        testid="mvd-kreator-edycja-linia-wn-przewod"
      />

      <KreatorInfo>{T.liniaWnFazyPomoc}</KreatorInfo>
      {formularz.fazy.map((faza, i) => (
        <KreatorSiatka kolumny={2} key={`faza-${i}`}>
          <PoleTekstowe
            etykieta={`${T.liniaWnFaza} L${i + 1} — x [m]`}
            wartosc={faza.x}
            onZmiana={(v) => zmienPolozenie('fazy', i, 'x', v)}
            placeholder={T.liniaWnPlaceholder}
            pomoc={i === 0 ? podpowiedz(propozycje, 'fazy') : undefined}
            blad={bladPola === 'fazy' && i === 0 ? T.liniaWnBladFaz : undefined}
            fokus={fokusGeometrii && i === 0}
            testid={`mvd-kreator-edycja-linia-wn-faza-${i}-x`}
          />
          <PoleTekstowe
            etykieta={`${T.liniaWnFaza} L${i + 1} — y [m]`}
            wartosc={faza.y}
            onZmiana={(v) => zmienPolozenie('fazy', i, 'y', v)}
            placeholder={T.liniaWnPlaceholder}
            testid={`mvd-kreator-edycja-linia-wn-faza-${i}-y`}
          />
        </KreatorSiatka>
      ))}

      <KreatorSiatka kolumny={2}>
        <PoleTekstowe
          etykieta={T.liniaWnWiazka}
          wartosc={formularz.liczbaWWiazce}
          onZmiana={(v) => zmien({ liczbaWWiazce: v })}
          placeholder={T.liniaWnWiazkaPlaceholder}
          blad={bladPola === 'liczbaWWiazce' ? T.liniaWnBladWiazki : undefined}
          testid="mvd-kreator-edycja-linia-wn-wiazka"
        />
        <PoleTekstowe
          etykieta={T.liniaWnOdstep}
          wartosc={formularz.odstepWiazki}
          onZmiana={(v) => zmien({ odstepWiazki: v })}
          placeholder={T.liniaWnOdstepPlaceholder}
          blad={bladPola === 'odstepWiazki' ? T.liniaWnBladLiczby : undefined}
          testid="mvd-kreator-edycja-linia-wn-odstep"
        />
      </KreatorSiatka>

      <PoleWyboru
        etykieta={T.liniaWnTrybOdgromowych}
        wartosc={formularz.trybOdgromowych}
        onZmiana={(v) => zmien({ trybOdgromowych: v as TrybOdgromowych })}
        opcje={opcjeTrybu}
        pomoc={
          formularz.trybOdgromowych === 'robocze' ? podpowiedz(propozycje, 'odgromowe') : undefined
        }
        testid="mvd-kreator-edycja-linia-wn-tryb-odgromowych"
      />
      {formularz.trybOdgromowych === 'podane'
        ? formularz.odgromowe.map((p, i) => (
            <KreatorSiatka kolumny={2} key={`odgromowy-${i}`}>
              <PoleTekstowe
                etykieta={`${T.liniaWnOdgromowy} ${i + 1} — x [m]`}
                wartosc={p.x}
                onZmiana={(v) => zmienPolozenie('odgromowe', i, 'x', v)}
                placeholder={T.liniaWnPlaceholder}
                blad={bladPola === 'odgromowe' && i === 0 ? T.liniaWnBladOdgromowych : undefined}
                testid={`mvd-kreator-edycja-linia-wn-odgromowy-${i}-x`}
              />
              <PoleTekstowe
                etykieta={`${T.liniaWnOdgromowy} ${i + 1} — y [m]`}
                wartosc={p.y}
                onZmiana={(v) => zmienPolozenie('odgromowe', i, 'y', v)}
                placeholder={T.liniaWnPlaceholder}
                testid={`mvd-kreator-edycja-linia-wn-odgromowy-${i}-y`}
              />
            </KreatorSiatka>
          ))
        : null}
      {formularz.trybOdgromowych === 'brak' ? null : (
        <PoleWyboru
          etykieta={T.liniaWnTypOdgromowego}
          wartosc={formularz.przewodOdgromowyRef}
          onZmiana={(v) => zmien({ przewodOdgromowyRef: v })}
          opcje={opcjeOdgromowych}
          pomoc={
            formularz.przewodOdgromowyRef === ''
              ? podpowiedz(propozycje, 'przewod_odgromowy_ref')
              : undefined
          }
          testid="mvd-kreator-edycja-linia-wn-typ-odgromowego"
        />
      )}

      <PoleTekstowe
        etykieta={T.liniaWnRezystywnosc}
        wartosc={formularz.rezystywnosc}
        onZmiana={(v) => zmien({ rezystywnosc: v })}
        placeholder={T.liniaWnPlaceholder}
        pomoc={podpowiedz(propozycje, 'rezystywnosc_gruntu_ohm_m')}
        blad={bladPola === 'rezystywnosc' ? T.liniaWnBladLiczby : undefined}
        testid="mvd-kreator-edycja-linia-wn-rezystywnosc"
      />

      <button
        type="button"
        className="mvd-kreator-btn"
        data-testid="mvd-kreator-edycja-linia-wn-podglad"
        disabled={!podgladMozliwy || podglad.rodzaj === 'laduje'}
        onClick={() => void onPodglad()}
      >
        {T.liniaWnPodglad}
      </button>
      {podglad.rodzaj === 'blad' ? (
        <KreatorInfo>
          <span role="alert" data-testid="mvd-kreator-edycja-linia-wn-podglad-blad">
            {podglad.komunikat}
          </span>
        </KreatorInfo>
      ) : null}
      {podglad.rodzaj === 'wynik' ? (
        <div data-testid="mvd-kreator-edycja-linia-wn-podglad-wynik">
          <KreatorInfo>
            {podglad.podglad.parametry.kompletnosc_dowodu === 'NIEPELNY'
              ? T.liniaWnKompletnoscNiepelna
              : T.liniaWnKompletnoscPelna}
          </KreatorInfo>
          <StanDanychWyniku
            para={podglad.podglad.parametry}
            testId="mvd-kreator-edycja-linia-wn-podglad"
          />
          {podglad.podglad.pasma_wiarygodnosci.map((p) => (
            <div key={p.parametr} data-testid={`mvd-kreator-edycja-linia-wn-pasmo-${p.parametr}`}>
              <RzadWartosci
                etykieta={p.nazwa_pl}
                wartosc={`${liczbaPodgladu(p.wartosc)} ${p.jednostka}`}
                ton={p.w_pasmie ? 'ok' : 'warn'}
              />
              <KreatorInfo>
                {p.wyjasnienie_pl} {p.podstawa_pl}
              </KreatorInfo>
            </div>
          ))}
          <ul>
            {podglad.podglad.dane_linii.skladowe.map((s) => (
              <li key={s.parametr} data-testid={`mvd-kreator-edycja-linia-wn-skladowa-${s.parametr}`}>
                {s.nazwa_pl}: {s.wartosc_robocza ? T.liniaWnSkladowaRobocza : T.liniaWnSkladowaProjektu}{' '}
                — {s.opis_zrodla_pl}
                {s.wzor_latex !== undefined && (
                  <>
                    {' '}
                    <MathInline latex={s.wzor_latex} />
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </KreatorSekcja>
  );
}
