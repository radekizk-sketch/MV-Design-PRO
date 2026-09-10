/*
 * EkranAnalizAkademickich — okno „Analizy specjalistyczne" (ui2/wyniki/akademickie).
 *
 * KARTA B-02 / W3-E (dyrektywa właściciela 2026-09-10): okno odpowiada na pytanie
 * „CO i NA JAKIEJ PODSTAWIE policzę?". Dwa widoki:
 *
 *  1. KATALOG KART — analizy pogrupowane według znaczenia inżynierskiego; każda
 *     karta niesie NAZWĘ, PYTANIE INŻYNIERSKIE, BADANY ZAKRES, GŁÓWNE WIELKOŚCI,
 *     PODSTAWĘ OCENY (tylko gdy solver ją faktycznie stosuje) i STAN DANYCH.
 *     Treść kart i grupy pochodzą WYŁĄCZNIE z katalogu backendu
 *     (`GET /api/catalog/v126/analysis-catalog`) — okno nie trzyma własnej kopii.
 *  2. WIDOK ANALIZY (A–G): A. przedmiot analizy (projekt, przypadek, wariant pracy,
 *     rewizja modelu, zakres modelu, U_n, punkt przyłączenia) → B. pytanie
 *     inżynierskie → C. dane wejściowe z rozdziałem źródeł (z modelu / z przypadku /
 *     od użytkownika / domyślne solvera / brakujące) → D. gotowość: POTWIERDZONA z
 *     listą sprawdzonych warunków albo NIEPOTWIERDZONA z listą braków (ta sama
 *     funkcja backendu, która odmawia uruchomienia, `GET …/v126/gotowosc`) →
 *     E. kryteria oceny (wielkość, symbol, warunek, wartość graniczna, jednostka,
 *     podstawa) albo BRAK PODSTAW → F. zakres obliczeń → G. uruchomienie,
 *     dostępne wyłącznie przy gotowości POTWIERDZONEJ. Po biegu: wynik oceny,
 *     wielkości, obiekty, wiarygodność, wniosek, ślad, dowód, raport.
 *
 * Wspólny łańcuch (prompt właściciela §2): PRZEDMIOT → STAN MODELU → DANE →
 * KRYTERIUM → OBLICZENIE → WYNIK → OCENA WYMAGANIA → WNIOSEK PROJEKTOWY.
 *
 * Zero fizyki i zero ocen w UI: wszystkie wielkości, warunki gotowości, progi
 * i wyniki pochodzą z backendu; okno je porządkuje. Kolory wyłącznie tokenami `--mvd-*`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import './akademickie.css';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { useAppStateStore } from '../../../ui/app-state';
import { useShellStore } from '../../shell/useShellStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { opisSwiezosci } from '../../freshness';
import { PrzyciskAkcjiStanu, useAkcjaPrzejdzDoPrzypadkow } from '../wzorzec';
import type { AkcjaStanuZerowego } from '../wzorzec';
import {
  pobierzDowod,
  pobierzGotowosc,
  pobierzKatalog,
  pobierzKatalogAnaliz,
  pobierzRaport,
  pobierzSlad,
  pobierzWynik,
  utworzPrzebieg,
  type GotowoscAnalizy,
  type KartaKatalogu,
  type OdpowiedzWyniku,
  type OdpowiedzSladu,
  type PakietDowodu,
  type PrzebiegAkademicki,
  type PrzedmiotAnalizy,
  type RaportAnalizy,
  type RodzajAnalizy,
  type WarunekGotowosci,
} from './api';
import {
  krokiDowoduDoWidoku,
  krokiSladuDoWidoku,
  swiezoscWyniku,
  licznikMetrykRaportu,
  pogrupujWynik,
  sekcjeRaportuDoWidoku,
  splaszczWynik,
} from './model';
import {
  MAPA_WIARYGODNOSCI,
  NAZWY_BRAKUJACYCH_POL,
  NAZWY_PARAMETROW,
  NAZWY_WARTOSCI,
  PREZENTACJA,
  SCIEZKA_BRAKOW,
  SCIEZKA_WIARYGODNOSCI,
  odczytaj,
  type TabelaObiektow,
} from './prezentacja';
import { rodzajPrezentowany, type RodzajPrezentowany } from './nieprezentowane';
import { maParametry, zbudujParametry, type StanPol, type WierszListy } from './parametry';
import { FormularzParametrow } from './FormularzParametrow';
import { useNazwaObiektu } from './useNazwaObiektu';
import {
  AKADEMICKIE_STRINGS as S,
  etykietaGotowosci,
  etykietaProweniencjiWidma,
  etykietaRodzaju,
  etykietaStanuPrzebiegu,
  fmtPoziomyNapiec,
  fmtWartosc,
  type IstotnoscStanu,
} from './strings';

// ---------------------------------------------------------------------------
// Elementy wspólne
// ---------------------------------------------------------------------------

function StanPanel({
  komunikat,
  opis,
  wariant,
  testid,
  akcja,
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
  akcja?: AkcjaStanuZerowego;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-akad-stan mvd-akad-stan--blad' : 'mvd-akad-stan'}
      data-testid={testid}
    >
      <p className="mvd-akad-stan-title">{komunikat}</p>
      {opis && <p className="mvd-akad-stan-desc">{opis}</p>}
      <PrzyciskAkcjiStanu akcja={akcja} testid={testid} />
    </div>
  );
}

/** Chip stanu (istotność steruje wyłącznie kolorem tokenowym). */
function Chip({ tekst, istotnosc, testid }: { tekst: string; istotnosc: IstotnoscStanu; testid?: string }) {
  return (
    <span className={`mvd-akad-chip mvd-akad-chip--${istotnosc}`} data-testid={testid}>
      {tekst}
    </span>
  );
}

/**
 * Sekcja zwijana z UCZCIWYM STANEM ZEROWYM: sekcja bez zawartości NIE dostaje
 * przycisku „Pokaż…" — przycisk, który nie ma czego pokazać, to martwy klik.
 * Warunek pustki i warunek przycisku pochodzą z JEDNEGO pola (`pozycji`).
 */
function Zwijana({
  tytul,
  licznik,
  opis,
  testid,
  pokaz,
  ukryj,
  pozycji,
  pustyKomunikat,
  domyslnieOtwarte,
  children,
}: {
  tytul: string;
  licznik: string;
  opis?: string;
  testid: string;
  pokaz: string;
  ukryj: string;
  pozycji: number;
  pustyKomunikat: string;
  domyslnieOtwarte?: boolean;
  children: React.ReactNode;
}) {
  const [otwarte, setOtwarte] = useState(domyslnieOtwarte === true);
  const pusta = pozycji === 0;
  return (
    <section className="mvd-akad-sekcja" data-testid={testid}>
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{tytul}</h3>
        {!pusta && (
          <span className="mvd-akad-licznik mvd-num" data-testid={`${testid}-licznik`}>
            {licznik}
          </span>
        )}
        {!pusta && (
          <button
            type="button"
            className="mvd-akad-btn-wtorny"
            aria-expanded={otwarte}
            data-testid={`${testid}-przelacz`}
            onClick={() => setOtwarte((stan) => !stan)}
          >
            {otwarte ? ukryj : pokaz}
          </button>
        )}
      </div>
      {pusta ? (
        <p className="mvd-akad-opis" data-testid={`${testid}-pusty`}>
          {pustyKomunikat}
        </p>
      ) : (
        <>
          {opis && <p className="mvd-akad-opis">{opis}</p>}
          {otwarte && children}
        </>
      )}
    </section>
  );
}

/** Nazwy elementów modelu (przez most ref → nazwa); długie listy skracane jawnie. */
function nazwyElementow(
  refy: readonly string[],
  nazwaObiektu: (ref: string) => string,
  limit = 6,
): string {
  const nazwy = refy.slice(0, limit).map(nazwaObiektu);
  const reszta = refy.length - nazwy.length;
  return reszta > 0 ? `${nazwy.join(', ')} (+${reszta})` : nazwy.join(', ');
}

/** Tekst wartości granicznej: liczba po polsku albo cytowany opis. */
function fmtGranica(wartosc: number | string): string {
  return typeof wartosc === 'number' ? fmtWartosc(wartosc) : wartosc;
}

// ---------------------------------------------------------------------------
// Katalog kart
// ---------------------------------------------------------------------------

interface GrupaKart {
  readonly kod: string;
  readonly nazwa: string;
  readonly karty: readonly KartaKatalogu[];
}

/** Grupy w kolejności katalogu (pierwsze wystąpienie) — wyłącznie karty prezentowane. */
export function grupujKarty(karty: readonly KartaKatalogu[]): GrupaKart[] {
  const kolejnosc: string[] = [];
  const mapa = new Map<string, { nazwa: string; karty: KartaKatalogu[] }>();
  karty
    .filter((karta) => karta.prezentowany && rodzajPrezentowany(karta.kod))
    .forEach((karta) => {
      const istniejaca = mapa.get(karta.grupa.kod);
      if (istniejaca) {
        istniejaca.karty.push(karta);
        return;
      }
      kolejnosc.push(karta.grupa.kod);
      mapa.set(karta.grupa.kod, { nazwa: karta.grupa.nazwa_pl, karty: [karta] });
    });
  return kolejnosc.map((kod) => {
    const grupa = mapa.get(kod)!;
    return { kod, nazwa: grupa.nazwa, karty: grupa.karty };
  });
}

type StanKatalogu =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly karty: readonly KartaKatalogu[] };

type StanGotowosciKart =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | {
      readonly rodzaj: 'gotowe';
      readonly analizy: Readonly<Record<string, GotowoscAnalizy>>;
      readonly przedmiot: PrzedmiotAnalizy;
      readonly modelHash: string | null;
    };

function StanDanychKarty({ stan, gotowosc }: { stan: StanGotowosciKart; gotowosc?: GotowoscAnalizy }) {
  if (stan.rodzaj === 'ladowanie') {
    return <span className="mvd-akad-stan-danych">{S.stanDanychSprawdzanie}</span>;
  }
  if (stan.rodzaj === 'blad' || gotowosc === undefined) {
    return <span className="mvd-akad-stan-danych">{S.stanDanychNieustalony}</span>;
  }
  if (gotowosc.gotowosc === 'POTWIERDZONA') {
    return <span className="mvd-akad-stan-danych mvd-akad-stan-danych--ok">{S.stanDanychPotwierdzona}</span>;
  }
  if (gotowosc.gotowosc === 'WYCOFANA') {
    return <span className="mvd-akad-stan-danych">{S.stanDanychWycofana}</span>;
  }
  return (
    <span className="mvd-akad-stan-danych mvd-akad-stan-danych--brak">
      {S.stanDanychBrak(gotowosc.braki.length)}
    </span>
  );
}

function KartaAnalizy({
  karta,
  stanGotowosci,
  onOtworz,
}: {
  karta: KartaKatalogu;
  stanGotowosci: StanGotowosciKart;
  onOtworz: () => void;
}) {
  const gotowosc = stanGotowosci.rodzaj === 'gotowe' ? stanGotowosci.analizy[karta.kod] : undefined;
  return (
    <article className="mvd-akad-karta" data-testid={`mvd-akad-karta-${karta.kod}`}>
      <h4 className="mvd-akad-karta-tytul">{karta.nazwa_pl}</h4>
      <div className="mvd-akad-karta-pole">
        <span className="mvd-akad-karta-etyk">{S.kartaPytanie}</span>
        <p className="mvd-akad-karta-tresc">{karta.pytanie_pl}</p>
      </div>
      <div className="mvd-akad-karta-pole">
        <span className="mvd-akad-karta-etyk">{S.kartaZakres}</span>
        <p className="mvd-akad-karta-tresc">{karta.zakres_pl}</p>
      </div>
      {karta.wielkosci_glowne.length > 0 && (
        <div className="mvd-akad-karta-pole">
          <span className="mvd-akad-karta-etyk">{S.kartaWielkosci}</span>
          <ul className="mvd-akad-karta-lista">
            {karta.wielkosci_glowne.map((wielkosc) => (
              <li key={`${wielkosc.symbol}:${wielkosc.nazwa_pl}`}>
                <span className="mvd-num">{wielkosc.symbol}</span> — {wielkosc.nazwa_pl}
                {wielkosc.jednostka !== '-' && wielkosc.jednostka !== '' && ` [${wielkosc.jednostka}]`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mvd-akad-karta-pole">
        <span className="mvd-akad-karta-etyk">
          {karta.podstawa_oceny.length > 0 ? S.kartaPodstawa : S.kartaPodstawaBrak}
        </span>
        {karta.podstawa_oceny.length > 0 ? (
          <ul className="mvd-akad-karta-lista">
            {karta.podstawa_oceny.map((podstawa) => (
              <li key={`${podstawa.symbol}:${podstawa.zrodlo_pl}`}>
                {podstawa.wielkosc_pl} <span className="mvd-num">{podstawa.symbol}</span>{' '}
                {podstawa.warunek_pl}{' '}
                <span className="mvd-num">{fmtGranica(podstawa.wartosc_graniczna)}</span>
                {podstawa.jednostka !== '-' && podstawa.jednostka !== '' && ` ${podstawa.jednostka}`}
                {' — '}
                {podstawa.zrodlo_pl}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mvd-akad-karta-tresc">{karta.bez_podstawy_pl}</p>
        )}
      </div>
      <div className="mvd-akad-karta-stopka">
        <span>
          <span className="mvd-akad-karta-etyk">{S.kartaStanDanych}: </span>
          <StanDanychKarty stan={stanGotowosci} gotowosc={gotowosc} />
        </span>
        <button
          type="button"
          className="mvd-akad-btn"
          data-testid={`mvd-akad-karta-otworz-${karta.kod}`}
          onClick={onOtworz}
        >
          {S.kartaOtworz}
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Sekcje A–F widoku analizy
// ---------------------------------------------------------------------------

function Podsekcja({ tytul, opis, testid, children }: { tytul: string; opis?: string; testid: string; children: React.ReactNode }) {
  return (
    <div className="mvd-akad-podsekcja" data-testid={testid}>
      <h4 className="mvd-akad-podsekcja-tytul">{tytul}</h4>
      {opis && <p className="mvd-akad-opis">{opis}</p>}
      {children}
    </div>
  );
}

function SekcjaPrzedmiot({
  przedmiot,
  modelHash,
  nazwaObiektu,
}: {
  przedmiot: PrzedmiotAnalizy | null;
  modelHash: string | null;
  nazwaObiektu: (ref: string) => string;
}) {
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const punkt = przedmiot?.punkt_przylaczenia ?? null;
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-przedmiot">
      <div className="mvd-akad-sekcja-naglowek">
        <span className="mvd-akad-krok">A</span>
        <h3 className="mvd-akad-sekcja-tytul">{S.przedmiotTytul}</h3>
      </div>
      <div className="mvd-akad-wiersze">
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.przedmiotProjekt}</span>
          <span className="mvd-akad-wiersz-wartosc">{activeProjectName ?? S.kreska}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.przedmiotPrzypadek}</span>
          <span className="mvd-akad-wiersz-wartosc">{activeCaseName ?? S.kreska}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.przedmiotWariant}</span>
          <span className="mvd-akad-wiersz-wartosc">{S.przedmiotWariantOpis}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.przedmiotModel}</span>
          <span className="mvd-akad-wiersz-wartosc">
            {przedmiot ? (
              <>
                {przedmiot.nazwa_modelu !== '' ? przedmiot.nazwa_modelu : S.przedmiotBrakNazwy}
                {' · '}
                {S.przedmiotRewizja} <span className="mvd-num">{przedmiot.rewizja}</span>
                {modelHash && (
                  <>
                    {' · '}
                    {S.przedmiotOdcisk} <span className="mvd-num">{modelHash.slice(0, 12)}</span>
                  </>
                )}
              </>
            ) : (
              S.kreska
            )}
          </span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.przedmiotZakres}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">
            {przedmiot
              ? S.przedmiotZakresOpis({
                  szyny: przedmiot.liczba_szyn,
                  galezie: przedmiot.liczba_galezi,
                  transformatory: przedmiot.liczba_transformatorow,
                  wytworcy: przedmiot.liczba_generatorow,
                  przeksztaltnikowe: przedmiot.liczba_zrodel_przeksztaltnikowych,
                })
              : S.kreska}
          </span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.przedmiotNapiecia}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">
            {przedmiot ? fmtPoziomyNapiec(przedmiot.poziomy_napiec_kv) : S.kreska}
          </span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.przedmiotCzestotliwosc}</span>
          <span className="mvd-akad-wiersz-wartosc">
            {przedmiot?.czestotliwosc_hz != null ? (
              <span className="mvd-num">{fmtWartosc(przedmiot.czestotliwosc_hz)} Hz</span>
            ) : (
              S.przedmiotCzestotliwoscBrak
            )}
          </span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.przedmiotPunkt}</span>
          <span className="mvd-akad-wiersz-wartosc">
            {punkt
              ? `${nazwaObiektu(punkt.ref)} (${S.przedmiotPunktZrodlo}: ${nazwaObiektu(punkt.zrodlo)})`
              : S.przedmiotPunktBrak}
          </span>
        </div>
      </div>
    </section>
  );
}

function SekcjaPytanie({ karta }: { karta: KartaKatalogu }) {
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-pytanie">
      <div className="mvd-akad-sekcja-naglowek">
        <span className="mvd-akad-krok">B</span>
        <h3 className="mvd-akad-sekcja-tytul">{S.pytanieTytul}</h3>
      </div>
      <p className="mvd-akad-cel-tresc">{karta.pytanie_pl}</p>
      <p className="mvd-akad-opis">
        <b>{S.zakresBadanyTytul}: </b>
        {karta.zakres_pl}
      </p>
    </section>
  );
}

function ListaWarunkow({
  warunki,
  wariant,
  nazwaObiektu,
  testid,
}: {
  warunki: readonly WarunekGotowosci[];
  wariant: 'sprawdzone' | 'braki' | 'uwagi';
  nazwaObiektu: (ref: string) => string;
  testid: string;
}) {
  return (
    <ul className="mvd-akad-warunki" data-testid={testid}>
      {warunki.map((warunek) => {
        const klasa = warunek.spelniony
          ? 'mvd-akad-warunek mvd-akad-warunek--spelniony'
          : wariant === 'uwagi'
            ? 'mvd-akad-warunek mvd-akad-warunek--uwaga'
            : 'mvd-akad-warunek mvd-akad-warunek--niespelniony';
        return (
          <li className={klasa} key={warunek.kod} title={warunek.kod}>
            <span className="mvd-akad-warunek-stan">
              {warunek.spelniony ? S.warunekSpelniony : S.warunekNiespelniony}
            </span>
            <span>
              {warunek.opis_pl}
              {warunek.elementy.length > 0 && (
                <span className="mvd-akad-warunek-elementy">
                  {S.gotowoscElementy}: {nazwyElementow(warunek.elementy, nazwaObiektu)}
                </span>
              )}
              {!warunek.spelniony && warunek.klucz_parametru !== null && wariant === 'braki' && (
                <span className="mvd-akad-warunek-elementy">{S.gotowoscUzupelnijPole}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type StanGotowosciAnalizy =
  | { readonly rodzaj: 'ladowanie'; readonly dane?: GotowoscAnalizy }
  | { readonly rodzaj: 'blad'; readonly komunikat: string; readonly dane?: GotowoscAnalizy }
  | { readonly rodzaj: 'gotowe'; readonly dane: GotowoscAnalizy };

function SekcjaDane({
  karta,
  gotowosc,
  modelHash,
  przedmiot,
  nazwaObiektu,
  formularz,
}: {
  karta: KartaKatalogu;
  gotowosc: StanGotowosciAnalizy;
  modelHash: string | null;
  przedmiot: PrzedmiotAnalizy | null;
  nazwaObiektu: (ref: string) => string;
  formularz: React.ReactNode;
}) {
  const dane = gotowosc.dane;
  const proponowane = dane ? Object.entries(dane.proponowane) : [];
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-dane">
      <div className="mvd-akad-sekcja-naglowek">
        <span className="mvd-akad-krok">C</span>
        <h3 className="mvd-akad-sekcja-tytul">{S.daneTytul}</h3>
      </div>
      <p className="mvd-akad-opis">{S.daneOpis}</p>

      <Podsekcja tytul={S.daneZModelu} opis={S.daneZModeluOpis} testid="mvd-akad-dane-z-modelu">
        {dane && dane.dane_z_modelu.length > 0 ? (
          <ul className="mvd-akad-dane-lista">
            {dane.dane_z_modelu.map((pozycja) => (
              <li className="mvd-akad-dane-pozycja" key={pozycja.nazwa_pl}>
                <span className="mvd-akad-dane-nazwa">{pozycja.nazwa_pl}</span>
                <span className="mvd-akad-dane-wartosc mvd-num">{pozycja.wartosc_pl}</span>
                {pozycja.elementy.length > 0 && (
                  <span className="mvd-akad-dane-uwaga">
                    {nazwyElementow(pozycja.elementy, nazwaObiektu)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : karta.dane.z_modelu.length > 0 ? (
          <ul className="mvd-akad-dane-lista">
            {karta.dane.z_modelu.map((pozycja) => (
              <li className="mvd-akad-dane-pozycja" key={pozycja.nazwa_pl}>
                <span className="mvd-akad-dane-nazwa">{pozycja.nazwa_pl}</span>
                <span className="mvd-akad-dane-uwaga">{pozycja.elementy_pl}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mvd-akad-opis">{S.daneZModeluBrak}</p>
        )}
      </Podsekcja>

      <Podsekcja tytul={S.daneZPrzypadku} testid="mvd-akad-dane-z-przypadku">
        <p className="mvd-akad-opis">
          {S.daneZPrzypadkuOpis}
          {przedmiot && (
            <>
              {' '}
              {S.przedmiotRewizja} <span className="mvd-num">{przedmiot.rewizja}</span>
            </>
          )}
          {modelHash && (
            <>
              {' · '}
              {S.przedmiotOdcisk} <span className="mvd-num">{modelHash.slice(0, 12)}</span>
            </>
          )}
        </p>
      </Podsekcja>

      <Podsekcja tytul={S.daneOdUzytkownika} opis={S.daneOdUzytkownikaOpis} testid="mvd-akad-dane-od-uzytkownika">
        {karta.dane.od_uzytkownika.length === 0 ? (
          <p className="mvd-akad-opis">{S.daneOdUzytkownikaBrak}</p>
        ) : (
          <ul className="mvd-akad-dane-lista">
            {karta.dane.od_uzytkownika.map((parametr) => (
              <li className="mvd-akad-dane-pozycja" key={parametr.klucz}>
                <span className="mvd-akad-dane-nazwa">
                  {parametr.nazwa_pl}
                  {parametr.jednostka !== '-' && parametr.jednostka !== '' && ` [${parametr.jednostka}]`}
                  <span
                    className={
                      parametr.wymagane
                        ? 'mvd-akad-znacznik mvd-akad-znacznik--wymagane'
                        : 'mvd-akad-znacznik'
                    }
                  >
                    {parametr.wymagane ? S.daneWymagane : S.daneOpcjonalne}
                  </span>
                </span>
                {parametr.opis_pl !== '' && <span className="mvd-akad-dane-uwaga">{parametr.opis_pl}</span>}
              </li>
            ))}
          </ul>
        )}
        {proponowane.length > 0 && (
          <div className="mvd-akad-podsekcja" data-testid="mvd-akad-dane-propozycje">
            <h4 className="mvd-akad-podsekcja-tytul">{S.propozycjaTytul}</h4>
            <p className="mvd-akad-opis">{S.propozycjaOpis}</p>
            <ul className="mvd-akad-dane-lista">
              {proponowane.map(([klucz, propozycja]) => (
                <li className="mvd-akad-dane-pozycja" key={klucz}>
                  <span className="mvd-akad-dane-nazwa">
                    {karta.dane.od_uzytkownika.find((p) => p.klucz === klucz)?.nazwa_pl ?? klucz}
                  </span>
                  <span className="mvd-akad-dane-wartosc mvd-num">
                    {typeof propozycja.wartosc === 'string' && NAZWY_WARTOSCI[propozycja.wartosc] !== undefined
                      ? NAZWY_WARTOSCI[propozycja.wartosc]
                      : fmtWartosc(propozycja.wartosc)}
                  </span>
                  <span className="mvd-akad-dane-uwaga">
                    {S.propozycjaZrodlo}: {propozycja.zrodlo_pl}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {formularz}
      </Podsekcja>

      <Podsekcja tytul={S.daneDomyslne} opis={S.daneDomyslneOpis} testid="mvd-akad-dane-domyslne">
        {karta.dane.domyslne_solvera.length === 0 ? (
          <p className="mvd-akad-opis">{S.daneDomyslneBrak}</p>
        ) : (
          <ul className="mvd-akad-dane-lista">
            {karta.dane.domyslne_solvera.map((domyslna) => (
              <li className="mvd-akad-dane-pozycja" key={domyslna.klucz}>
                <span className="mvd-akad-dane-nazwa">{domyslna.nazwa_pl}</span>
                <span className="mvd-akad-dane-wartosc mvd-num">
                  {fmtGranica(domyslna.wartosc)}
                  {domyslna.jednostka !== '-' && domyslna.jednostka !== '' && ` ${domyslna.jednostka}`}
                </span>
                <span className="mvd-akad-dane-uwaga">{domyslna.uzasadnienie_pl}</span>
              </li>
            ))}
          </ul>
        )}
      </Podsekcja>

      <Podsekcja tytul={S.daneBrakujace} testid="mvd-akad-dane-brakujace">
        {dane === undefined ? (
          <p className="mvd-akad-opis">
            {gotowosc.rodzaj === 'blad' ? gotowosc.komunikat : S.gotowoscLadowanie}
          </p>
        ) : dane.braki.length === 0 ? (
          <p className="mvd-akad-opis" data-testid="mvd-akad-dane-brakujace-brak">
            {S.daneBrakujaceBrak}
          </p>
        ) : (
          <ListaWarunkow
            warunki={dane.braki}
            wariant="braki"
            nazwaObiektu={nazwaObiektu}
            testid="mvd-akad-dane-brakujace-lista"
          />
        )}
      </Podsekcja>
    </section>
  );
}

function SekcjaGotowosc({
  gotowosc,
  nazwaObiektu,
  onPonow,
}: {
  gotowosc: StanGotowosciAnalizy;
  nazwaObiektu: (ref: string) => string;
  onPonow: () => void;
}) {
  const dane = gotowosc.dane;
  const stanChipu = dane ? etykietaGotowosci(dane.gotowosc) : null;
  return (
    <section
      className="mvd-akad-sekcja"
      data-testid="mvd-akad-gotowosc"
      data-gotowosc={dane?.gotowosc ?? (gotowosc.rodzaj === 'blad' ? 'BLAD' : 'SPRAWDZANIE')}
    >
      <div className="mvd-akad-sekcja-naglowek">
        <span className="mvd-akad-krok">D</span>
        <h3 className="mvd-akad-sekcja-tytul">{S.gotowoscTytul}</h3>
        {stanChipu && (
          <Chip tekst={stanChipu.tekst} istotnosc={stanChipu.istotnosc} testid="mvd-akad-gotowosc-chip" />
        )}
        {gotowosc.rodzaj === 'ladowanie' && (
          <span className="mvd-akad-licznik">{S.gotowoscLadowanie}</span>
        )}
      </div>
      <p className="mvd-akad-opis">{S.gotowoscOpis}</p>
      {gotowosc.rodzaj === 'blad' && (
        <StanPanel
          komunikat={S.gotowoscBlad}
          opis={gotowosc.komunikat}
          wariant="blad"
          testid="mvd-akad-gotowosc-blad"
          akcja={{ etykieta: S.gotowoscPonow, onKlik: onPonow }}
        />
      )}
      {dane && dane.gotowosc === 'WYCOFANA' && dane.powod_wycofania_pl && (
        <p className="mvd-akad-opis" data-testid="mvd-akad-gotowosc-wycofana">
          {dane.powod_wycofania_pl}
        </p>
      )}
      {dane && dane.gotowosc !== 'WYCOFANA' && (
        <>
          {dane.braki.length > 0 && (
            <Podsekcja tytul={S.gotowoscBraki} testid="mvd-akad-gotowosc-braki">
              <ListaWarunkow
                warunki={dane.braki}
                wariant="braki"
                nazwaObiektu={nazwaObiektu}
                testid="mvd-akad-gotowosc-braki-lista"
              />
            </Podsekcja>
          )}
          <Podsekcja tytul={S.gotowoscSprawdzone} testid="mvd-akad-gotowosc-warunki">
            <ListaWarunkow
              warunki={dane.warunki.filter((w) => w.blokujacy)}
              wariant="sprawdzone"
              nazwaObiektu={nazwaObiektu}
              testid="mvd-akad-gotowosc-warunki-lista"
            />
          </Podsekcja>
          {dane.uwagi.length > 0 && (
            <Podsekcja tytul={S.gotowoscUwagi} testid="mvd-akad-gotowosc-uwagi">
              <ListaWarunkow
                warunki={dane.uwagi}
                wariant="uwagi"
                nazwaObiektu={nazwaObiektu}
                testid="mvd-akad-gotowosc-uwagi-lista"
              />
            </Podsekcja>
          )}
        </>
      )}
    </section>
  );
}

function SekcjaKryteria({ karta }: { karta: KartaKatalogu }) {
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-kryteria">
      <div className="mvd-akad-sekcja-naglowek">
        <span className="mvd-akad-krok">E</span>
        <h3 className="mvd-akad-sekcja-tytul">{S.kryteriaTytul}</h3>
      </div>
      <p className="mvd-akad-opis">{S.kryteriaOpis}</p>
      {karta.podstawa_oceny.length === 0 ? (
        <p className="mvd-akad-kryteria-brak" data-testid="mvd-akad-kryteria-brak">
          <span className="mvd-akad-kryteria-brak-tytul">{S.kryteriaBrakTytul}</span>
          {karta.bez_podstawy_pl}
        </p>
      ) : (
        <div className="mvd-akad-tabela-otoczka">
          <table className="mvd-akad-tabela" data-testid="mvd-akad-kryteria-tabela">
            <thead>
              <tr>
                <th>{S.kolWielkosc}</th>
                <th>{S.kolSymbol}</th>
                <th>{S.kolWarunek}</th>
                <th>{S.kolGranica}</th>
                <th>{S.kolJednostka}</th>
                <th>{S.kolZrodlo}</th>
              </tr>
            </thead>
            <tbody>
              {karta.podstawa_oceny.map((podstawa, indeks) => (
                <tr key={`${podstawa.symbol}:${indeks}`}>
                  <td>{podstawa.wielkosc_pl}</td>
                  <td className="mvd-num">{podstawa.symbol}</td>
                  <td>{podstawa.warunek_pl}</td>
                  <td className="mvd-num">{fmtGranica(podstawa.wartosc_graniczna)}</td>
                  <td className="mvd-num">{podstawa.jednostka}</td>
                  <td>{podstawa.zrodlo_pl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SekcjaZakres({ karta }: { karta: KartaKatalogu }) {
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-zakres">
      <div className="mvd-akad-sekcja-naglowek">
        <span className="mvd-akad-krok">F</span>
        <h3 className="mvd-akad-sekcja-tytul">{S.zakresTytul}</h3>
      </div>
      <p className="mvd-akad-cel-tresc">{karta.zakres_pl}</p>
      {karta.uwagi_metody_pl.length > 0 && (
        <Podsekcja tytul={S.zakresUwagi} testid="mvd-akad-zakres-uwagi">
          <ul className="mvd-akad-karta-lista">
            {karta.uwagi_metody_pl.map((uwaga) => (
              <li key={uwaga}>{uwaga}</li>
            ))}
          </ul>
        </Podsekcja>
      )}
      {karta.katalog_odniesienia !== null && <PanelOdniesien namespace={karta.katalog_odniesienia} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ekran wyniku — ocena · wielkości · obiekty · wiarygodność (jak przed kartą B-02)
// ---------------------------------------------------------------------------

/**
 * Wynik oceny analizy — CYTAT pola statusu z odpowiedzi solvera. Zero ocen w UI:
 * dla oceny zbiorczej okno zlicza wystąpienia wartości statusu (jak licznik
 * wierszy tabeli), a nie porównuje liczb z progiem. Podstawa oceny pochodzi
 * z karty katalogu (jedno źródło prawdy o kryterium).
 */
function PanelWerdyktu({ rodzaj, payload, karta }: { rodzaj: string; payload: unknown; karta: KartaKatalogu }) {
  const projekt = PREZENTACJA[rodzaj as RodzajPrezentowany];
  if (!projekt) return null;
  const w = projekt.werdykt;

  let tresc: React.ReactNode;
  if (w.rodzaj === 'pojedynczy') {
    const surowa = w.sciezki
      .map((sciezka) => odczytaj(payload, sciezka))
      .find((wartosc) => typeof wartosc === 'string');
    const wpis = typeof surowa === 'string' ? w.mapa[surowa] : undefined;
    tresc = wpis ? (
      <Chip tekst={wpis.tekst} istotnosc={wpis.istotnosc} testid="mvd-akad-werdykt-chip" />
    ) : (
      <Chip tekst={S.werdyktBrak} istotnosc="neutral" testid="mvd-akad-werdykt-chip" />
    );
  } else if (w.rodzaj === 'zbiorczy') {
    const tablica = odczytaj(payload, w.sciezkaTablicy);
    const elementy = Array.isArray(tablica) ? tablica : [];
    const spelnione = elementy.filter(
      (element) => String(odczytaj(element, w.kluczStatusu)) === w.wartoscSpelniona,
    ).length;
    const wszystkieSpelnione = elementy.length > 0 && spelnione === elementy.length;
    tresc =
      elementy.length === 0 ? (
        <Chip tekst={S.werdyktBrak} istotnosc="neutral" testid="mvd-akad-werdykt-chip" />
      ) : (
        <Chip
          tekst={S.werdyktZbiorczy(spelnione, elementy.length, w.obiektyDopelniacz)}
          istotnosc={wszystkieSpelnione ? 'ok' : 'err'}
          testid="mvd-akad-werdykt-chip"
        />
      );
  } else {
    const wartosc = odczytaj(payload, w.sciezka);
    tresc =
      wartosc === undefined || wartosc === null ? (
        <Chip tekst={S.werdyktBrak} istotnosc="neutral" testid="mvd-akad-werdykt-chip" />
      ) : (
        <Chip
          tekst={`${fmtWartosc(wartosc)} ${w.jednostka} — ${S.werdyktWartosc}`}
          istotnosc="neutral"
          testid="mvd-akad-werdykt-chip"
        />
      );
  }

  return (
    <section className="mvd-akad-sekcja mvd-akad-werdykt" data-testid="mvd-akad-werdykt">
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{S.werdyktTytul}</h3>
        {tresc}
      </div>
      <div className="mvd-akad-wiersze">
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.podstawaEtykieta}</span>
          <span className="mvd-akad-wiersz-wartosc">
            {karta.podstawa_oceny.length > 0
              ? karta.podstawa_oceny
                  .map(
                    (p) =>
                      `${p.wielkosc_pl} ${p.symbol} ${p.warunek_pl} ${fmtGranica(p.wartosc_graniczna)}`
                      + `${p.jednostka !== '-' && p.jednostka !== '' ? ` ${p.jednostka}` : ''} (${p.zrodlo_pl})`,
                  )
                  .join('; ')
              : `${S.kryteriaBrakTytul}: ${karta.bez_podstawy_pl}`}
          </span>
        </div>
      </div>
    </section>
  );
}

/** Wielkości główne — liczba + jednostka + (gdy solver ją zwraca) odniesienie. */
function PanelWielkosci({ rodzaj, payload }: { rodzaj: string; payload: unknown }) {
  const projekt = PREZENTACJA[rodzaj as RodzajPrezentowany];
  if (!projekt) return null;
  const obecne = projekt.wielkosciGlowne.filter((pole) => {
    const wartosc = odczytaj(payload, pole.sciezka);
    return wartosc !== undefined && wartosc !== null;
  });
  const pominieteObecne = (projekt.wielkosciPominiete ?? []).filter((pozycja) =>
    pozycja.sciezki.some((sciezka) => {
      const wartosc = odczytaj(payload, sciezka);
      return wartosc !== undefined && wartosc !== null;
    }),
  );
  if (obecne.length === 0 && pominieteObecne.length === 0) return null;

  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-wielkosci">
      <h3 className="mvd-akad-sekcja-tytul">{S.wielkosciTytul}</h3>
      <p className="mvd-akad-opis">{S.wielkosciOpis}</p>
      <div className="mvd-akad-wiersze">
        {obecne.map((pole) => {
          const wartosc = odczytaj(payload, pole.sciezka);
          const odniesienie =
            pole.odniesienieSciezka === undefined
              ? undefined
              : odczytaj(payload, pole.odniesienieSciezka);
          return (
            <div className="mvd-akad-wiersz" key={pole.sciezka}>
              <span className="mvd-akad-wiersz-etyk">{pole.etykieta}</span>
              <span className="mvd-akad-wiersz-wartosc mvd-num">
                {fmtPole(wartosc)}
                {pole.jednostka !== undefined && ` ${pole.jednostka}`}
                {odniesienie !== undefined && odniesienie !== null && (
                  <span className="mvd-akad-odniesienie">
                    {` (${pole.odniesienieEtykieta ?? S.odniesienieDomyslne}: ${fmtWartosc(odniesienie)}`}
                    {pole.jednostka !== undefined && ` ${pole.jednostka}`}
                    {')'}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {pominieteObecne.map((pozycja) => (
        <p
          className="mvd-akad-opis mvd-akad-wielkosc-pominieta"
          key={pozycja.sciezki.join('|')}
          data-testid="mvd-akad-wielkosci-pominiete"
        >
          {pozycja.powod}
        </p>
      ))}
    </section>
  );
}

/** Wartości słownikowe solvera przez słownik polski; reszta — wspólny formater liczb. */
function fmtPole(wartosc: unknown): string {
  if (typeof wartosc === 'string' && NAZWY_WARTOSCI[wartosc] !== undefined) {
    return NAZWY_WARTOSCI[wartosc];
  }
  return fmtWartosc(wartosc);
}

/** Tabela obiektów analizy — obiekty nazwane tak, jak nazywa je schemat. */
function PanelObiektow({
  tabela,
  payload,
  nazwaObiektu,
}: {
  tabela: TabelaObiektow;
  payload: unknown;
  nazwaObiektu: (ref: string) => string;
}) {
  const etykietaWiersza = (surowa: string): string => {
    if (!tabela.refZParametrem) return nazwaObiektu(surowa);
    const granica = surowa.lastIndexOf('.');
    if (granica < 0) return nazwaObiektu(surowa);
    const ref = surowa.slice(0, granica);
    const parametr = surowa.slice(granica + 1);
    return `${nazwaObiektu(ref)} · ${NAZWY_PARAMETROW[parametr] ?? parametr}`;
  };
  const surowa = odczytaj(payload, tabela.sciezka);
  const wiersze = Array.isArray(surowa) ? surowa : [];
  return (
    <section className="mvd-akad-sekcja" data-testid={`mvd-akad-obiekty-${tabela.sciezka}`}>
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{tabela.tytul}</h3>
        <span className="mvd-akad-licznik mvd-num">{S.wynikPozycji(wiersze.length)}</span>
      </div>
      {wiersze.length === 0 ? (
        <p className="mvd-akad-opis">{S.obiektyBrak}</p>
      ) : (
        <div className="mvd-akad-tabela-otoczka">
          <table className="mvd-akad-tabela">
            <thead>
              <tr>
                <th>{tabela.etykietaRef}</th>
                {tabela.kolumny.map((kolumna) => (
                  <th key={kolumna.klucz}>
                    {kolumna.etykieta}
                    {kolumna.jednostka !== undefined && ` [${kolumna.jednostka}]`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wiersze.map((wiersz, indeks) => {
                const ref = String(odczytaj(wiersz, tabela.kluczRef) ?? '');
                return (
                  <tr key={`${ref}:${indeks}`}>
                    <td>{etykietaWiersza(ref)}</td>
                    {tabela.kolumny.map((kolumna) => {
                      const wartosc = odczytaj(wiersz, kolumna.klucz);
                      if (kolumna.mapaStatusu !== undefined) {
                        const wpis = kolumna.mapaStatusu[String(wartosc)];
                        return (
                          <td key={kolumna.klucz}>
                            {wpis ? (
                              <Chip tekst={wpis.tekst} istotnosc={wpis.istotnosc} />
                            ) : (
                              S.kreska
                            )}
                          </td>
                        );
                      }
                      const czyRef = kolumna.klucz.endsWith('_ref');
                      return (
                        <td key={kolumna.klucz} className={czyRef ? undefined : 'mvd-num'}>
                          {czyRef ? nazwaObiektu(String(wartosc ?? '')) : fmtPole(wartosc)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Uczciwy stan niekompletny — solver melduje brak danych zamiast fabrykować ocenę. */
function PanelBrakow({ payload }: { payload: unknown }) {
  const komunikat = odczytaj(payload, SCIEZKA_BRAKOW.komunikat);
  const braki = odczytaj(payload, SCIEZKA_BRAKOW.brakujacePola);
  const listaBrakow = Array.isArray(braki) ? braki.map(String) : [];
  if (typeof komunikat !== 'string' && listaBrakow.length === 0) return null;
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-braki">
      <h3 className="mvd-akad-sekcja-tytul">{S.brakiTytul}</h3>
      {typeof komunikat === 'string' && <p className="mvd-akad-opis">{komunikat}</p>}
      {listaBrakow.length > 0 && (
        <>
          <p className="mvd-akad-opis">{S.brakiLista}</p>
          <ul className="mvd-akad-naruszenia" data-testid="mvd-akad-braki-lista">
            {listaBrakow.map((pole) => (
              <li key={pole}>{NAZWY_BRAKUJACYCH_POL[pole] ?? pole}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Wiarygodność wyniku — blok kontroli granic fizycznych solvera. */
function PanelWiarygodnosci({ payload }: { payload: unknown }) {
  const status = odczytaj(payload, SCIEZKA_WIARYGODNOSCI.status);
  if (typeof status !== 'string') return null;
  const wpis = MAPA_WIARYGODNOSCI[status];
  const lacznie = odczytaj(payload, SCIEZKA_WIARYGODNOSCI.sprawdzenLacznie);
  const zdane = odczytaj(payload, SCIEZKA_WIARYGODNOSCI.sprawdzenZdanych);
  const naruszeniaSurowe = odczytaj(payload, SCIEZKA_WIARYGODNOSCI.naruszenia);
  const naruszenia = Array.isArray(naruszeniaSurowe) ? naruszeniaSurowe : [];
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-wiarygodnosc">
      <div className="mvd-akad-sekcja-naglowek">
        <h3 className="mvd-akad-sekcja-tytul">{S.wiarygodnoscTytul}</h3>
        <Chip
          tekst={wpis?.tekst ?? status}
          istotnosc={wpis?.istotnosc ?? 'neutral'}
          testid="mvd-akad-wiarygodnosc-chip"
        />
        {typeof lacznie === 'number' && typeof zdane === 'number' && (
          <span className="mvd-akad-licznik mvd-num">{S.wiarygodnoscSprawdzen(zdane, lacznie)}</span>
        )}
      </div>
      <p className="mvd-akad-opis">{S.wiarygodnoscOpis}</p>
      {naruszenia.length > 0 && (
        <ul className="mvd-akad-naruszenia" data-testid="mvd-akad-wiarygodnosc-naruszenia">
          {naruszenia.map((naruszenie, indeks) => (
            <li key={indeks}>{String(odczytaj(naruszenie, 'detail_pl') ?? S.kreska)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Ranking N-1 nieprezentowany (karta W3-E) — stan z powodem i przejściem do kanonu. */
function PanelRankinguNieprezentowanego({
  payload,
  onPrzejdzDoKontyngencji,
}: {
  payload: unknown;
  onPrzejdzDoKontyngencji: () => void;
}) {
  const powod = odczytaj(payload, 'ranking_n1.powod_pl');
  if (typeof powod !== 'string') return null;
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-ranking-n1">
      <h3 className="mvd-akad-sekcja-tytul">{S.rankingN1Tytul}</h3>
      <p className="mvd-akad-opis" data-testid="mvd-akad-ranking-n1-powod">
        {S.rankingN1Nieprezentowany} — {powod}
      </p>
      <button
        type="button"
        className="mvd-akad-btn-wtorny"
        data-testid="mvd-akad-ranking-n1-przejdz"
        onClick={onPrzejdzDoKontyngencji}
      >
        {S.rankingN1Przejdz}
      </button>
    </section>
  );
}

/** Źródła przekształtnikowe wejścia (karta W2-C): proweniencja widma i źródła pominięte. */
function PanelZrodelHarmonicznych({ wynik }: { wynik: OdpowiedzWyniku }) {
  const nazwaObiektu = useNazwaObiektu();
  const zrodlaWidma = wynik.zrodla_widma ?? [];
  const pominieteZrodla = wynik.pominiete_zrodla ?? [];
  if (zrodlaWidma.length === 0 && pominieteZrodla.length === 0) return null;
  return (
    <section className="mvd-akad-sekcja" data-testid="mvd-akad-zrodla-harmoniczne">
      {zrodlaWidma.length > 0 && (
        <div data-testid="mvd-akad-zrodla-widma">
          <h3 className="mvd-akad-sekcja-tytul">{S.zrodlaWidmaTytul}</h3>
          <div className="mvd-akad-wiersze">
            {zrodlaWidma.map((zrodlo) => (
              <div className="mvd-akad-wiersz" key={zrodlo.ref}>
                <span className="mvd-akad-wiersz-etyk">{nazwaObiektu(zrodlo.ref)}</span>
                <span className="mvd-akad-wiersz-wartosc">
                  {S.zrodlaWidmaProweniencjaEtykieta}: {etykietaProweniencjiWidma(zrodlo.proweniencja)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {pominieteZrodla.length > 0 && (
        <div data-testid="mvd-akad-zrodla-pominiete">
          <h3 className="mvd-akad-sekcja-tytul">{S.zrodlaPominieteTytul}</h3>
          <p className="mvd-akad-opis">{S.zrodlaPominieteOpis}</p>
          <ul className="mvd-akad-naruszenia" data-testid="mvd-akad-zrodla-pominiete-lista">
            {pominieteZrodla.map((zrodlo) => (
              <li key={zrodlo.ref} title={zrodlo.kod}>
                {nazwaObiektu(zrodlo.ref)} — {S.zrodlaPominietePowod}: {zrodlo.powod}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Zapis techniczny odpowiedzi solvera — ZWINIĘTY materiał audytowy. */
function PanelZapisuTechnicznego({ wynik }: { wynik: OdpowiedzWyniku }) {
  const wiersze = useMemo(() => splaszczWynik(wynik.result.result), [wynik]);
  const grupy = useMemo(() => pogrupujWynik(wiersze), [wiersze]);

  return (
    <Zwijana
      tytul={S.surowyTytul}
      opis={S.surowyOpis}
      licznik={S.wynikLiczbaPol(wiersze.length)}
      testid="mvd-akad-wynik"
      pokaz={S.surowyPokaz}
      ukryj={S.surowyUkryj}
      pozycji={wiersze.length}
      pustyKomunikat={S.wynikPusty}
    >
      <div data-mvd-zapis-techniczny="1">
        {grupy.map((grupa) => (
          <div className="mvd-akad-grupa" key={grupa.klucz} data-testid={`mvd-akad-grupa-${grupa.klucz}`}>
            <h4 className="mvd-akad-grupa-tytul">{grupa.klucz}</h4>
            <div className="mvd-akad-wiersze">
              {grupa.wiersze.map((wiersz) => (
                <div className="mvd-akad-wiersz" key={wiersz.sciezka}>
                  <span className="mvd-akad-wiersz-etyk">{wiersz.sciezka}</span>
                  <span className="mvd-akad-wiersz-wartosc mvd-num">{fmtWartosc(wiersz.wartosc)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Zwijana>
  );
}

function PanelSladu({ slad }: { slad: OdpowiedzSladu }) {
  const kroki = krokiSladuDoWidoku(slad.steps);
  return (
    <Zwijana
      tytul={S.sladTytul}
      opis={S.sladOpis}
      licznik={S.sladKrokow(kroki.length)}
      testid="mvd-akad-slad"
      pokaz={S.sladPokaz}
      ukryj={S.sladUkryj}
      pozycji={kroki.length}
      pustyKomunikat={S.sladPusty}
    >
      <div className="mvd-akad-tabela-otoczka">
        <table className="mvd-akad-tabela">
          <thead>
            <tr>
              <th>{S.sladKolKrok}</th>
              <th>{S.sladKolWzor}</th>
              <th>{S.sladKolPodstawienie}</th>
              <th>{S.sladKolWynik}</th>
              <th>{S.sladKolJednostka}</th>
            </tr>
          </thead>
          <tbody>
            {kroki.map((krok) => (
              <tr key={krok.proof_ref} data-testid={`mvd-akad-slad-krok-${krok.step}`}>
                <td className="mvd-num">{krok.step}</td>
                <td className="mvd-num">{krok.formula}</td>
                <td>{krok.substitution}</td>
                <td className="mvd-num">{krok.result_pl ?? S.kreska}</td>
                <td>{krok.unit_check}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Zwijana>
  );
}

function PanelDowodu({ dowod }: { dowod: PakietDowodu }) {
  const kroki = krokiDowoduDoWidoku(dowod.steps);
  return (
    <Zwijana
      tytul={S.dowodTytul}
      opis={S.dowodOpis}
      licznik={S.sladKrokow(kroki.length)}
      testid="mvd-akad-dowod"
      pokaz={S.dowodPokaz}
      ukryj={S.dowodUkryj}
      pozycji={kroki.length}
      pustyKomunikat={S.dowodPusty}
    >
      <div className="mvd-akad-wiersze">
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.dowodId}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{dowod.proof_id}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.dowodOdcisk}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{dowod.proof_hash}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.dowodKrokow}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{dowod.trace_step_count}</span>
        </div>
      </div>
      <div className="mvd-akad-tabela-otoczka">
        <table className="mvd-akad-tabela">
          <thead>
            <tr>
              <th>{S.sladKolKrok}</th>
              <th>{S.sladKolWzor}</th>
              <th>{S.sladKolPodstawienie}</th>
              <th>{S.sladKolWynik}</th>
              <th>{S.sladKolJednostka}</th>
            </tr>
          </thead>
          <tbody>
            {kroki.map((krok) => (
              <tr key={krok.proof_ref} data-testid={`mvd-akad-dowod-krok-${krok.ordinal}`}>
                <td className="mvd-num">{krok.ordinal}</td>
                <td className="mvd-num">{krok.formula ?? S.kreska}</td>
                <td>{krok.substitution ?? S.kreska}</td>
                <td className="mvd-num">{krok.result_pl ?? S.kreska}</td>
                <td>{krok.unit_check ?? S.kreska}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Zwijana>
  );
}

function PanelRaportu({ raport }: { raport: RaportAnalizy }) {
  const sekcje = sekcjeRaportuDoWidoku(raport);
  return (
    <Zwijana
      tytul={S.raportTytul}
      opis={S.raportOpis}
      licznik={`${S.raportSekcji(sekcje.length)} · ${S.raportMetryk(licznikMetrykRaportu(raport))}`}
      testid="mvd-akad-raport"
      pokaz={S.raportPokaz}
      ukryj={S.raportUkryj}
      pozycji={sekcje.length}
      pustyKomunikat={S.raportPusty}
    >
      <div className="mvd-akad-wiersze">
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.raportId}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{raport.report_id}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.raportOdcisk}</span>
          <span className="mvd-akad-wiersz-wartosc mvd-num">{raport.report_hash}</span>
        </div>
        <div className="mvd-akad-wiersz">
          <span className="mvd-akad-wiersz-etyk">{S.raportPolityka}</span>
          <span className="mvd-akad-wiersz-wartosc">{fmtPole(raport.export_policy)}</span>
        </div>
      </div>
      {sekcje.map((sekcja) => (
        <div className="mvd-akad-grupa" key={sekcja.section_id} data-testid={`mvd-akad-raport-sekcja-${sekcja.section_id}`}>
          <h4 className="mvd-akad-grupa-tytul">{sekcja.title}</h4>
          <div className="mvd-akad-wiersze">
            {sekcja.metrics.map((metryka) => (
              <div className="mvd-akad-wiersz" key={`${sekcja.section_id}:${metryka.label}`}>
                <span className="mvd-akad-wiersz-etyk">{metryka.label}</span>
                <span className="mvd-akad-wiersz-wartosc mvd-num">{fmtWartosc(metryka.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Zwijana>
  );
}

type StanOdniesien =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly pozycje: readonly { sciezka: string; wartosc: unknown }[] };

/** Dane odniesienia (katalog wartości odniesienia rodzaju) — wczytywane na żądanie. */
function PanelOdniesien({ namespace }: { namespace: string }) {
  const [stan, setStan] = useState<StanOdniesien>({ rodzaj: 'idle' });
  const [otwarte, setOtwarte] = useState(false);

  const wczytaj = useCallback(() => {
    setStan({ rodzaj: 'ladowanie' });
    pobierzKatalog(namespace)
      .then((odpowiedz) => {
        const pozycje = splaszczWynik(odpowiedz.items).map((wiersz) => ({
          sciezka: wiersz.sciezka,
          wartosc: wiersz.wartosc,
        }));
        setStan({ rodzaj: 'gotowe', pozycje });
      })
      .catch((err: unknown) => {
        setStan({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : S.odniesieniaBlad });
      });
  }, [namespace]);

  return (
    <div className="mvd-akad-podsekcja" data-testid="mvd-akad-katalog">
      <div className="mvd-akad-sekcja-naglowek">
        <h4 className="mvd-akad-podsekcja-tytul">{S.odniesieniaTytul}</h4>
        <button
          type="button"
          className="mvd-akad-btn-wtorny"
          aria-expanded={otwarte}
          data-testid="mvd-akad-katalog-przelacz"
          onClick={() => {
            const nastepny = !otwarte;
            setOtwarte(nastepny);
            if (nastepny && stan.rodzaj === 'idle') wczytaj();
          }}
        >
          {otwarte ? S.odniesieniaUkryj : S.odniesieniaPokaz}
        </button>
      </div>
      {otwarte && (
        <>
          <p className="mvd-akad-opis">{S.odniesieniaOpis}</p>
          {stan.rodzaj === 'ladowanie' && <p className="mvd-akad-opis">{S.odniesieniaLadowanie}</p>}
          {stan.rodzaj === 'blad' && (
            <StanPanel komunikat={S.odniesieniaBlad} opis={stan.komunikat} wariant="blad" testid="mvd-akad-katalog-blad" />
          )}
          {stan.rodzaj === 'gotowe' && (
            <div className="mvd-akad-wiersze" data-mvd-zapis-techniczny="1">
              {stan.pozycje.map((pozycja) => (
                <div className="mvd-akad-wiersz" key={pozycja.sciezka}>
                  <span className="mvd-akad-wiersz-etyk">{pozycja.sciezka}</span>
                  <span className="mvd-akad-wiersz-wartosc mvd-num">{fmtWartosc(pozycja.wartosc)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stany biegu
// ---------------------------------------------------------------------------

interface KompletArtefaktow {
  readonly rewizjaPrzyBiegu: number;
  readonly przebieg: PrzebiegAkademicki;
  readonly wynik: OdpowiedzWyniku;
  readonly slad: OdpowiedzSladu;
  readonly dowod: PakietDowodu;
  readonly raport: RaportAnalizy;
}

type StanBiegu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: KompletArtefaktow };

/** Opóźnienie sprawdzania gotowości po zmianie danych od użytkownika [ms]. */
const OPOZNIENIE_GOTOWOSCI_MS = 250;

// ---------------------------------------------------------------------------
// Okno
// ---------------------------------------------------------------------------

export interface EkranAnalizAkademickichProps {
  readonly trybZaawansowania: AdvancementMode;
  /**
   * Analiza otwarta z góry (wejście z ekranu trasowego E-40…E-50) — okno startuje
   * w widoku tej analizy; przycisk „Katalog analiz" wraca do kart. Typ zawężony do
   * rodzajów PREZENTOWANYCH (V126-WYGASZENIE): rodzaj wycofany nie ma karty.
   */
  readonly rodzajPoczatkowy?: RodzajPrezentowany;
}

export function EkranAnalizAkademickich({
  trybZaawansowania,
  rodzajPoczatkowy,
}: EkranAnalizAkademickichProps) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const akcjaPrzypadki = useAkcjaPrzejdzDoPrzypadkow();
  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');
  const rewizjaModelu = useSnapshotStore((s) => s.rewizjaBiezacegoModelu ?? 0);
  const nazwaObiektu = useNazwaObiektu();

  const [katalog, setKatalog] = useState<StanKatalogu>({ rodzaj: 'ladowanie' });
  const [gotowoscKart, setGotowoscKart] = useState<StanGotowosciKart>({ rodzaj: 'ladowanie' });
  const [wybrany, setWybrany] = useState<string>(rodzajPoczatkowy ?? '');
  const [stan, setStan] = useState<StanBiegu>({ rodzaj: 'idle' });
  const [gotowoscWybranej, setGotowoscWybranej] = useState<StanGotowosciAnalizy>({ rodzaj: 'ladowanie' });
  const [licznikSprawdzen, setLicznikSprawdzen] = useState(0);

  const [pola, setPola] = useState<StanPol>({});
  const [uziom, setUziom] = useState<StanPol>({});
  const [metody, setMetody] = useState<readonly string[]>([]);
  const [wiersze, setWiersze] = useState<readonly WierszListy[]>([]);

  // Katalog kart i gotowość wszystkich analiz (dla „stanu danych" kart) — dwa
  // niezależne wołania, każde z własnym uczciwym stanem błędu.
  const wczytajKatalog = useCallback(() => {
    setKatalog({ rodzaj: 'ladowanie' });
    pobierzKatalogAnaliz()
      .then((karty) => setKatalog({ rodzaj: 'gotowe', karty }))
      .catch((err: unknown) => {
        setKatalog({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : S.katalogBlad });
      });
  }, []);

  const wczytajGotowoscKart = useCallback((caseId: string) => {
    setGotowoscKart({ rodzaj: 'ladowanie' });
    pobierzGotowosc(caseId)
      .then((odpowiedz) => {
        const analizy: Record<string, GotowoscAnalizy> = {};
        odpowiedz.analizy.forEach((analiza) => {
          analizy[analiza.kod] = analiza;
        });
        setGotowoscKart({
          rodzaj: 'gotowe',
          analizy,
          przedmiot: odpowiedz.przedmiot,
          modelHash: odpowiedz.model_hash,
        });
      })
      .catch((err: unknown) => {
        setGotowoscKart({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : S.gotowoscBlad });
      });
  }, []);

  // Bez aktywnego przypadku i poza bramą trybu okno NIE pyta backendu.
  useEffect(() => {
    if (activeCaseId === null || !trybEkspercki) return;
    wczytajKatalog();
    wczytajGotowoscKart(activeCaseId);
  }, [activeCaseId, trybEkspercki, wczytajKatalog, wczytajGotowoscKart]);

  // Parametry biegu = to, co pójdzie do POST; gotowość sprawdzana DOKŁADNIE dla nich.
  const parametry = useMemo(
    () => zbudujParametry({ rodzaj: wybrany, pola, uziom, metody, wiersze }),
    [wybrany, pola, uziom, metody, wiersze],
  );
  const parametryJson = JSON.stringify(parametry);

  useEffect(() => {
    if (activeCaseId === null || !trybEkspercki || wybrany === '') return;
    let aktualne = true;
    setGotowoscWybranej((poprzedni) => ({ rodzaj: 'ladowanie', dane: poprzedni.dane }));
    const uchwyt = window.setTimeout(() => {
      pobierzGotowosc(activeCaseId, wybrany as RodzajAnalizy, JSON.parse(parametryJson) as Record<string, unknown>)
        .then((odpowiedz) => {
          if (!aktualne) return;
          const analiza = odpowiedz.analizy.find((a) => a.kod === wybrany) ?? odpowiedz.analizy[0];
          if (analiza === undefined) {
            setGotowoscWybranej({ rodzaj: 'blad', komunikat: S.gotowoscBlad });
            return;
          }
          setGotowoscWybranej({ rodzaj: 'gotowe', dane: analiza });
          // Przedmiot i odcisk modelu — z tej samej odpowiedzi (gdy karty jeszcze nie mają).
          setGotowoscKart((poprzedni) =>
            poprzedni.rodzaj === 'gotowe'
              ? { ...poprzedni, analizy: { ...poprzedni.analizy, [analiza.kod]: analiza } }
              : { rodzaj: 'gotowe', analizy: { [analiza.kod]: analiza }, przedmiot: odpowiedz.przedmiot, modelHash: odpowiedz.model_hash },
          );
        })
        .catch((err: unknown) => {
          if (!aktualne) return;
          setGotowoscWybranej((poprzedni) => ({
            rodzaj: 'blad',
            komunikat: err instanceof Error ? err.message : S.gotowoscBlad,
            dane: poprzedni.dane,
          }));
        });
    }, OPOZNIENIE_GOTOWOSCI_MS);
    return () => {
      aktualne = false;
      window.clearTimeout(uchwyt);
    };
  }, [activeCaseId, trybEkspercki, wybrany, parametryJson, licznikSprawdzen]);

  // Zmiana analizy zeruje wynik i formularz — parametry jednej analizy nie mogą
  // wyciec do żądania innej (klucze są rozłączne wg kontraktu solvera).
  const otworzAnalize = (kod: string) => {
    setWybrany(kod);
    setStan({ rodzaj: 'idle' });
    setGotowoscWybranej({ rodzaj: 'ladowanie' });
    setPola({});
    setUziom({});
    setMetody([]);
    setWiersze([]);
  };

  const uruchom = () => {
    if (activeCaseId === null || wybrany === '') return;
    if (gotowoscWybranej.dane?.gotowosc !== 'POTWIERDZONA') return;
    const rodzajBiegu = wybrany as RodzajAnalizy;
    setStan({ rodzaj: 'ladowanie' });
    utworzPrzebieg(activeCaseId, rodzajBiegu, parametry)
      .then(async (przebieg) => {
        const [wynik, slad, dowod, raport] = await Promise.all([
          pobierzWynik(przebieg.run_id, rodzajBiegu),
          pobierzSlad(przebieg.run_id, rodzajBiegu),
          pobierzDowod(przebieg.run_id, rodzajBiegu),
          pobierzRaport(przebieg.run_id, rodzajBiegu),
        ]);
        setStan({
          rodzaj: 'gotowe',
          dane: { rewizjaPrzyBiegu: rewizjaModelu, przebieg, wynik, slad, dowod, raport },
        });
      })
      .catch((err: unknown) => {
        setStan({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : S.blad });
      });
  };

  // Brama opracowania (V126-JEZYK): poza trybem eksperckim okno NIE renderuje
  // treści i NIE pyta backendu — wejść do zdolności są dwa (zakładka i trasa).
  if (!trybEkspercki) {
    return (
      <div className="mvd-akad" data-testid="mvd-akad-ekran">
        <header className="mvd-akad-naglowek">
          <h2 className="mvd-akad-tytul">{S.tytul}</h2>
        </header>
        <StanPanel
          komunikat={S.bramaTytul}
          opis={`${S.bramaOpis} ${S.bramaJakWejsc}`}
          wariant="info"
          testid="mvd-akad-brama-opracowania"
        />
      </div>
    );
  }

  if (activeCaseId === null) {
    return (
      <div className="mvd-akad" data-testid="mvd-akad-ekran">
        <header className="mvd-akad-naglowek">
          <h2 className="mvd-akad-tytul">{S.tytul}</h2>
          <p className="mvd-akad-opis">{S.opisWstep}</p>
        </header>
        <StanPanel
          komunikat={S.brakPrzypadku}
          opis={S.brakPrzypadkuOpis}
          wariant="info"
          testid="mvd-akad-brak-przypadku"
          akcja={akcjaPrzypadki}
        />
      </div>
    );
  }

  const karty = katalog.rodzaj === 'gotowe' ? katalog.karty : [];
  const karta = wybrany === '' ? undefined : karty.find((k) => k.kod === wybrany);
  const przedmiot = gotowoscKart.rodzaj === 'gotowe' ? gotowoscKart.przedmiot : null;
  const modelHash = gotowoscKart.rodzaj === 'gotowe' ? gotowoscKart.modelHash : null;
  const gotowoscAnalizy = gotowoscWybranej.dane?.gotowosc;
  const uruchomienieDostepne =
    gotowoscWybranej.rodzaj === 'gotowe' && gotowoscAnalizy === 'POTWIERDZONA' && stan.rodzaj !== 'ladowanie';

  const naglowek = (
    <header className="mvd-akad-naglowek">
      <div className="mvd-akad-pasek">
        {wybrany !== '' && (
          <button
            type="button"
            className="mvd-akad-btn-wtorny"
            data-testid="mvd-akad-powrot"
            title={S.powrotDoKataloguOpis}
            onClick={() => otworzAnalize('')}
          >
            ← {S.powrotDoKatalogu}
          </button>
        )}
        <h2 className="mvd-akad-tytul">
          {karta ? karta.nazwa_pl : wybrany !== '' ? etykietaRodzaju(wybrany) : S.tytul}
        </h2>
        {karta && <span className="mvd-akad-licznik">{karta.grupa.nazwa_pl}</span>}
      </div>
      {wybrany === '' && <p className="mvd-akad-opis">{S.opisWstep}</p>}
      <p className="mvd-akad-swiezosc" data-testid="mvd-akad-swiezosc">
        {S.swiezoscEtykieta}:{' '}
        <span className="mvd-num">
          {opisSwiezosci(
            swiezoscWyniku(stan.rodzaj === 'gotowe' ? stan.dane.rewizjaPrzyBiegu : null, rewizjaModelu),
          )}
        </span>
      </p>
    </header>
  );

  // ---- WIDOK 1: katalog kart -------------------------------------------------
  if (wybrany === '') {
    return (
      <div className="mvd-akad" data-testid="mvd-akad-ekran">
        {naglowek}
        <section className="mvd-akad-sekcja" data-testid="mvd-akad-katalog-kart">
          <h3 className="mvd-akad-sekcja-tytul">{S.katalogTytul}</h3>
          <p className="mvd-akad-opis">{S.katalogOpis}</p>
          {katalog.rodzaj === 'ladowanie' && <p className="mvd-akad-opis">{S.katalogLadowanie}</p>}
          {katalog.rodzaj === 'blad' && (
            <StanPanel
              komunikat={S.katalogBlad}
              opis={katalog.komunikat}
              wariant="blad"
              testid="mvd-akad-katalog-blad"
              akcja={{ etykieta: S.katalogPonow, onKlik: wczytajKatalog }}
            />
          )}
          {katalog.rodzaj === 'gotowe' && grupujKarty(katalog.karty).length === 0 && (
            <StanPanel
              komunikat={S.katalogBrak}
              opis={S.katalogBrakOpis}
              wariant="info"
              testid="mvd-akad-katalog-pusty"
              akcja={{ etykieta: S.katalogPonow, onKlik: wczytajKatalog }}
            />
          )}
          {katalog.rodzaj === 'gotowe' &&
            grupujKarty(katalog.karty).map((grupa) => (
              <div className="mvd-akad-katalog-grupa" key={grupa.kod} data-testid={`mvd-akad-katalog-grupa-${grupa.kod}`}>
                <h4 className="mvd-akad-katalog-grupa-tytul">{grupa.nazwa}</h4>
                <div className="mvd-akad-karty">
                  {grupa.karty.map((pozycja) => (
                    <KartaAnalizy
                      key={pozycja.kod}
                      karta={pozycja}
                      stanGotowosci={gotowoscKart}
                      onOtworz={() => otworzAnalize(pozycja.kod)}
                    />
                  ))}
                </div>
              </div>
            ))}
        </section>
      </div>
    );
  }

  // ---- WIDOK 2: analiza A–G --------------------------------------------------
  return (
    <div className="mvd-akad" data-testid="mvd-akad-ekran">
      {naglowek}
      {katalog.rodzaj === 'ladowanie' && <p className="mvd-akad-opis">{S.katalogLadowanie}</p>}
      {katalog.rodzaj === 'blad' && (
        <StanPanel
          komunikat={S.katalogBlad}
          opis={katalog.komunikat}
          wariant="blad"
          testid="mvd-akad-katalog-blad"
          akcja={{ etykieta: S.katalogPonow, onKlik: wczytajKatalog }}
        />
      )}
      {katalog.rodzaj === 'gotowe' && karta === undefined && (
        <StanPanel
          komunikat={S.katalogBrak}
          opis={S.katalogBrakOpis}
          wariant="info"
          testid="mvd-akad-katalog-pusty"
          akcja={{ etykieta: S.powrotDoKatalogu, onKlik: () => otworzAnalize('') }}
        />
      )}
      {karta && (
        <>
          <SekcjaPrzedmiot przedmiot={przedmiot} modelHash={modelHash} nazwaObiektu={nazwaObiektu} />
          <SekcjaPytanie karta={karta} />
          {wybrany === 'ssci_impedance' && (
            <div className="mvd-akad-odeslanie" data-testid="mvd-akad-odeslanie-ssci">
              <p className="mvd-akad-opis">{S.odeslanieSsci}</p>
              <button
                type="button"
                className="mvd-akad-btn-wtorny"
                data-testid="mvd-akad-przejdz-ssci"
                onClick={() => setWynikiTab('ssci')}
              >
                {etykietaRodzaju('ssci_impedance')}
              </button>
            </div>
          )}
          <SekcjaDane
            karta={karta}
            gotowosc={gotowoscWybranej}
            modelHash={modelHash}
            przedmiot={przedmiot}
            nazwaObiektu={nazwaObiektu}
            formularz={
              maParametry(wybrany) ? (
                <FormularzParametrow
                  rodzaj={wybrany}
                  pola={pola}
                  uziom={uziom}
                  metody={metody}
                  wiersze={wiersze}
                  onPole={(klucz, wartosc) => setPola((stanPol) => ({ ...stanPol, [klucz]: wartosc }))}
                  onUziom={(klucz, wartosc) => setUziom((stanPol) => ({ ...stanPol, [klucz]: wartosc }))}
                  onMetoda={(metoda, wlaczona) =>
                    setMetody((lista) =>
                      wlaczona ? [...lista, metoda] : lista.filter((pozycja) => pozycja !== metoda),
                    )
                  }
                  onWiersz={(indeks, klucz, wartosc) =>
                    setWiersze((lista) =>
                      lista.map((wiersz, i) => (i === indeks ? { ...wiersz, [klucz]: wartosc } : wiersz)),
                    )
                  }
                  onDodajWiersz={() => setWiersze((lista) => [...lista, {}])}
                  onUsunWiersz={(indeks) => setWiersze((lista) => lista.filter((_, i) => i !== indeks))}
                />
              ) : null
            }
          />
          <SekcjaGotowosc
            gotowosc={gotowoscWybranej}
            nazwaObiektu={nazwaObiektu}
            onPonow={() => setLicznikSprawdzen((n) => n + 1)}
          />
          <SekcjaKryteria karta={karta} />
          <SekcjaZakres karta={karta} />

          <section className="mvd-akad-sekcja" data-testid="mvd-akad-uruchomienie">
            <div className="mvd-akad-sekcja-naglowek">
              <span className="mvd-akad-krok">G</span>
              <h3 className="mvd-akad-sekcja-tytul">{S.uruchomienieTytul}</h3>
            </div>
            <p className="mvd-akad-opis">{S.uruchomienieOpis}</p>
            <button
              type="button"
              className="mvd-akad-btn"
              onClick={uruchom}
              disabled={!uruchomienieDostepne}
              data-testid="mvd-akad-uruchom"
            >
              {stan.rodzaj === 'gotowe' || stan.rodzaj === 'blad' ? S.uruchomPonownie : S.uruchom}
            </button>
            {gotowoscWybranej.rodzaj === 'gotowe' && gotowoscAnalizy === 'NIEPOTWIERDZONA' && (
              <p className="mvd-akad-blokada" data-testid="mvd-akad-uruchom-blokada">
                {S.uruchomZablokowane}
              </p>
            )}
            {gotowoscWybranej.rodzaj === 'gotowe' && gotowoscAnalizy === 'WYCOFANA' && (
              <p className="mvd-akad-blokada" data-testid="mvd-akad-uruchom-blokada">
                {S.uruchomWycofane}
              </p>
            )}
            {gotowoscWybranej.rodzaj !== 'gotowe' && (
              <p className="mvd-akad-opis" data-testid="mvd-akad-uruchom-sprawdzanie">
                {S.uruchomSprawdzanie}
              </p>
            )}
          </section>

          {stan.rodzaj === 'ladowanie' && (
            <StanPanel komunikat={S.ladowanie} wariant="info" testid="mvd-akad-ladowanie" />
          )}
          {stan.rodzaj === 'blad' && (
            <StanPanel komunikat={S.blad} opis={stan.komunikat} wariant="blad" testid="mvd-akad-blad" />
          )}

          {stan.rodzaj === 'gotowe' && (
            <div data-testid="mvd-akad-wyniki">
              <section className="mvd-akad-sekcja" data-testid="mvd-akad-przebieg">
                <div className="mvd-akad-wiersze">
                  <div className="mvd-akad-wiersz">
                    <span className="mvd-akad-wiersz-etyk">{S.statusPrzebiegu}</span>
                    <span className="mvd-akad-wiersz-wartosc">
                      {etykietaStanuPrzebiegu(stan.dane.przebieg.status)}
                    </span>
                  </div>
                  <div className="mvd-akad-wiersz">
                    <span className="mvd-akad-wiersz-etyk">{S.odcisk}</span>
                    <span className="mvd-akad-wiersz-wartosc mvd-num">{stan.dane.przebieg.deterministic_hash}</span>
                  </div>
                  <div className="mvd-akad-wiersz">
                    <span className="mvd-akad-wiersz-etyk">{S.runId}</span>
                    <span className="mvd-akad-wiersz-wartosc mvd-num">{stan.dane.przebieg.run_id}</span>
                  </div>
                  <div className="mvd-akad-wiersz">
                    <span className="mvd-akad-wiersz-etyk">{S.wersjaSolwera}</span>
                    <span className="mvd-akad-wiersz-wartosc mvd-num">{stan.dane.wynik.result.solver_version}</span>
                  </div>
                  <div className="mvd-akad-wiersz">
                    <span className="mvd-akad-wiersz-etyk">{S.odciskWejscia}</span>
                    <span className="mvd-akad-wiersz-wartosc mvd-num">{stan.dane.wynik.result.input_hash}</span>
                  </div>
                  <div className="mvd-akad-wiersz">
                    <span className="mvd-akad-wiersz-etyk">{S.utworzono}</span>
                    <span className="mvd-akad-wiersz-wartosc mvd-num">{stan.dane.wynik.created_at}</span>
                  </div>
                </div>
              </section>

              <PanelWerdyktu rodzaj={wybrany} payload={stan.dane.wynik.result.result} karta={karta} />
              {(wybrany === 'power_quality_harmonics' || wybrany === 'ssci_impedance') && (
                <PanelZrodelHarmonicznych wynik={stan.dane.wynik} />
              )}
              <PanelWielkosci rodzaj={wybrany} payload={stan.dane.wynik.result.result} />
              {(PREZENTACJA[wybrany as RodzajPrezentowany]?.tabele ?? []).map((tabela) => (
                <PanelObiektow
                  key={tabela.sciezka}
                  tabela={tabela}
                  payload={stan.dane.wynik.result.result}
                  nazwaObiektu={nazwaObiektu}
                />
              ))}
              <PanelBrakow payload={stan.dane.wynik.result.result} />
              <PanelWiarygodnosci payload={stan.dane.wynik.result.result} />
              <PanelRankinguNieprezentowanego
                payload={stan.dane.wynik.result.result}
                onPrzejdzDoKontyngencji={() => setWynikiTab('kontyngencje')}
              />
              {PREZENTACJA[wybrany as RodzajPrezentowany] !== undefined && (
                <section className="mvd-akad-sekcja" data-testid="mvd-akad-nastepny-krok">
                  <h3 className="mvd-akad-sekcja-tytul">{S.nastepnyKrokTytul}</h3>
                  <p className="mvd-akad-opis">{PREZENTACJA[wybrany as RodzajPrezentowany].nastepnyKrok}</p>
                </section>
              )}
              <PanelSladu slad={stan.dane.slad} />
              <PanelDowodu dowod={stan.dane.dowod} />
              <PanelRaportu raport={stan.dane.raport} />
              <PanelZapisuTechnicznego wynik={stan.dane.wynik} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
