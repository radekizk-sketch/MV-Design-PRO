/*
 * Wspólne komponenty prezentacji zgodności NC RfG na kontrakcie V2 (karta AB-1a Pakiet D2):
 * nagłówek modułu wyniku biegu, dowód certyfikatu urządzenia, lista rekordów wymagań,
 * sekcja modułu dokumentu formalnego i ekran braków (422). Macierz, sekcja zgodności
 * przypadku, certyfikat, wniosek i pulpit renderują TE SAME komponenty — jeden sposób
 * pokazania tego samego rekordu.
 *
 * Granice: zero fizyki, zero oceny, zero agregatów i map status → tekst. Etykieta i kolor
 * rekordu pochodzą z rekordu (`EtykietaWerdyktu`, `KartaWerdyktu`); klasyfikacja, dowód
 * certyfikatu i wersja procedury — z pól backendu (obiekty, nie łańcuchy).
 */

import { useId, useState, type ReactNode } from 'react';

import {
  EtykietaWerdyktu,
  KartaWerdyktu,
  NAZWA_METODY_PL,
  wielkoscPl,
} from '../../wyniki/wzorzec/KartaWerdyktu';
import { InformacjeAudytowe } from '../../wyniki/wzorzec/InformacjeAudytowe';
import { useShellStore } from '../../shell/useShellStore';
import type {
  OcenaKryterium,
  PodstawaWymagania,
  Relacja,
  StanZrodla,
  WynikWymagania,
} from '../../wyniki/wzorzec/werdykt';
import {
  NCRFG_STRINGS as T,
  liczbaPl,
  liczbaWymagan,
  nazwaTechnologii,
  opisZrodlaDanych,
} from './strings';
import type {
  BrakWymaganiaModulu,
  CertyfikatOdrzucony,
  DokumentWarstwy,
  DowodCertyfikatu,
  KlasyfikacjaModulu,
  PozycjaBloku,
  SekcjaModuluNcRfg,
  WynikModuluNcRfg,
  ZdanieBrakuModulu,
  ZrodloDanych,
} from './typy';
import { POZYCJE_AUDYTOWE_BLOKU } from './typy';

import './ncrfg.css';

// =============================================================================
// Drobne opisy pól backendu
// =============================================================================

/** Stan źródła podstawy — opis słowny (oś dowodu, nie status werdyktu). */
function nazwaStanuZrodla(stan: StanZrodla): string {
  switch (stan) {
    case 'ZWERYFIKOWANE':
      return 'zweryfikowane';
    case 'WSKAZANE':
      return 'wskazane (treść dokumentu poza repozytorium)';
    case 'NIEUSTALONE':
      return 'nieustalone';
  }
}

/** Cytat podstawy: dokument, wydanie, jednostka redakcyjna i stan źródła (pola rekordu). */
export function OpisPodstawy({ podstawa }: { readonly podstawa: PodstawaWymagania }): JSX.Element {
  return (
    <span className="mvd-ncrfg-podstawa">
      {podstawa.dokument}
      {`, ${podstawa.wydanie ? `${T.wydanie} ${podstawa.wydanie}` : T.wydanieNieustalone}`}
      {podstawa.jednostka_redakcyjna ? `, ${podstawa.jednostka_redakcyjna}` : ''}
      {` · ${T.stanZrodla}: ${nazwaStanuZrodla(podstawa.status)}`}
      {podstawa.uwagi_pl ? <span className="mvd-ncrfg-uwagi"> ({podstawa.uwagi_pl})</span> : null}
    </span>
  );
}

/** Dokument warstwy (wersja procedury) — pola obiektu, nigdy `String(obiekt)`. */
export function OpisDokumentuWarstwy({
  dokument,
  testid,
}: {
  readonly dokument: DokumentWarstwy;
  readonly testid?: string;
}): JSX.Element {
  return (
    <span className="mvd-ncrfg-dokument" data-testid={testid}>
      <span className="mvd-ncrfg-dokument-tytul">{dokument.tytul}</span>
      {`, ${dokument.wydanie ? `${T.wydanie} ${dokument.wydanie}` : T.wydanieNieustalone}`}
      {dokument.obowiazuje_od ? `, ${T.obowiazujeOd} ${dokument.obowiazuje_od}` : ''}
      {` · ${T.stanZrodla}: ${nazwaStanuZrodla(dokument.status)}`}
      {dokument.uwagi_pl ? <span className="mvd-ncrfg-uwagi"> ({dokument.uwagi_pl})</span> : null}
    </span>
  );
}

/** Klasyfikacja modułu (art. 5): typ albo stan „poniżej progu", powód, progi i podstawa. */
export function OpisKlasyfikacji({
  klasyfikacja,
  testid,
}: {
  readonly klasyfikacja: KlasyfikacjaModulu;
  readonly testid?: string;
}): JSX.Element {
  const progi = klasyfikacja.progi_kw;
  return (
    <div className="mvd-ncrfg-klasyfikacja" data-testid={testid} data-modul={klasyfikacja.modul ?? ''}>
      <div className="mvd-ncrfg-klasa">
        {klasyfikacja.modul !== null ? `${T.klasaModulu} ${klasyfikacja.modul}` : T.klasaPonizejProgu}
      </div>
      <div className="mvd-ncrfg-opis">{klasyfikacja.powod_pl}</div>
      <div className="mvd-ncrfg-opis mvd-ncrfg-num">
        {`${T.progi}: ${T.progMinimalny} ${liczbaPl(klasyfikacja.prog_min_kw)} kW · B ${liczbaPl(progi.B)} kW · C ${liczbaPl(progi.C)} kW · D ${liczbaPl(progi.D)} kW · ${T.napiecieD} ${liczbaPl(klasyfikacja.napiecie_d_kv)} kV`}
      </div>
      <div className="mvd-ncrfg-opis">
        {`${T.podstawaKlasyfikacji}: `}
        <OpisPodstawy podstawa={klasyfikacja.podstawa} />
      </div>
    </div>
  );
}

/**
 * Dowód certyfikatu urządzenia jako JAWNY rekord: rekord wykazu wyprowadzony przez serwer,
 * powód odrzucenia tabliczki albo nazwany brak (inny dla modelu i dla biegu z formularza).
 */
export function DowodCertyfikatuOpis({
  dowod,
  odrzucony = null,
  zrodloDanych,
  testid,
}: {
  readonly dowod: DowodCertyfikatu | null;
  readonly odrzucony?: CertyfikatOdrzucony | null;
  readonly zrodloDanych: ZrodloDanych;
  readonly testid: string;
}): JSX.Element {
  const szczegolyAudytowe = useShellStore((stan) => stan.szczegolyAudytowe);
  if (dowod !== null) {
    return (
      <div className="mvd-ncrfg-dowod" data-testid={testid} data-stan="dowod">
        <div className="mvd-ncrfg-opis">
          {/* Karta #145: rekord nazywają pola wykazu (producent, model, numer dokumentu);
              klucz rekordu rejestru jest metadaną — „Informacje audytowe" niżej. */}
          {`${T.dowodRekord} — ${T.dowodProducent}: ${dowod.producent}; ${T.dowodModel}: ${dowod.model}; `}
          <span data-testid={`${testid}-numer`}>{`${T.dowodNumer}: ${dowod.numer_dokumentu}`}</span>
          {`; ${T.dowodData}: ${dowod.data_akceptacji ?? T.dowodNiePodano}; `}
          <span data-testid={`${testid}-wipwc`}>{`${T.dowodWipwc} ${dowod.wersja_wipwc}`}</span>
          {`; ${T.dowodWos}: ${dowod.wersja_wos ?? T.dowodNiePodano}; ${T.dowodZakres}: ${
            dowod.zakres_typow.length > 0 ? dowod.zakres_typow.join(', ') : T.dowodZakresPusty
          }`}
          {dowod.warunek_waznosci ? `; ${T.dowodWarunek}: ${dowod.warunek_waznosci}` : ''}
          {dowod.adres_zrodla ? `; ${T.dowodZrodlo}: ${dowod.adres_zrodla}` : ''}
        </div>
        <div className="mvd-ncrfg-opis">
          {`${T.dowodPodstawa}: `}
          <OpisPodstawy podstawa={dowod.podstawa} />
        </div>
        <InformacjeAudytowe
          szczegolyAudytowe={szczegolyAudytowe}
          testid={`${testid}-informacje-audytowe`}
          wiersze={[{ etykieta: T.dowodIdentyfikatorRekordu, wartosc: dowod.rekord_id }]}
        />
      </div>
    );
  }
  if (odrzucony !== null) {
    return (
      <div className="mvd-ncrfg-dowod" data-testid={testid} data-stan="odrzucony">
        <div className="mvd-ncrfg-opis">
          {`${T.certyfikatOdrzucony}: ${odrzucony.powod_pl}`}
        </div>
      </div>
    );
  }
  return (
    <div className="mvd-ncrfg-dowod" data-testid={testid} data-stan="brak">
      <div className="mvd-ncrfg-opis">
        {zrodloDanych === 'ZATWIERDZONY_MODEL' ? T.brakDowoduModel : T.brakDowoduZadanie}
      </div>
    </div>
  );
}

// =============================================================================
// Nagłówek modułu wyniku biegu (macierz, zgodność przypadku, pulpit)
// =============================================================================

/**
 * Dowód certyfikatu w JEDNEJ linii nad tabelą wymagań (standard warsztatu KD6: wspólne dane
 * dowodu raz, w wierszach tylko odwołanie): producent i model, numer dokumentu, zakres typów,
 * wersja WiPWC, data akceptacji i warunek ważności — pola rekordu wykazu. Pełny zapis
 * z podstawą dowodu i identyfikatorem rekordu jest w szczegółach modułu (`DowodCertyfikatuOpis`).
 */
function DowodCertyfikatuZwiezly({
  dowod,
  odrzucony,
  zrodloDanych,
  testid,
}: {
  readonly dowod: DowodCertyfikatu | null;
  readonly odrzucony: CertyfikatOdrzucony | null;
  readonly zrodloDanych: ZrodloDanych;
  readonly testid: string;
}): JSX.Element {
  if (dowod !== null) {
    return (
      <span className="mvd-ncrfg-linia-tresc" data-testid={testid} data-stan="dowod">
        {`${dowod.producent} ${dowod.model} · `}
        <span data-testid={`${testid}-numer`}>{`${T.certyfikatNumer} ${dowod.numer_dokumentu}`}</span>
        {` · ${T.certyfikatTypy} ${
          dowod.zakres_typow.length > 0 ? dowod.zakres_typow.join(', ') : T.dowodZakresPusty
        } · `}
        <span data-testid={`${testid}-wipwc`}>{`${T.dowodWipwc} ${dowod.wersja_wipwc}`}</span>
        {` · ${T.certyfikatAkceptacja} ${dowod.data_akceptacji ?? T.dowodNiePodano}`}
        {dowod.warunek_waznosci ? ` · ${T.certyfikatWaznosc}: ${dowod.warunek_waznosci}` : ''}
      </span>
    );
  }
  if (odrzucony !== null) {
    return (
      <span className="mvd-ncrfg-linia-tresc" data-testid={testid} data-stan="odrzucony" data-uwaga="tak">
        {`${T.certyfikatOdrzucony}: ${odrzucony.powod_pl}`}
      </span>
    );
  }
  return (
    <span className="mvd-ncrfg-linia-tresc" data-testid={testid} data-stan="brak" data-uwaga="tak">
      {zrodloDanych === 'ZATWIERDZONY_MODEL' ? T.brakDowoduModel : T.brakDowoduZadanie}
    </span>
  );
}

function Pole({ etykieta, children }: { readonly etykieta: string; readonly children: ReactNode }) {
  return (
    <div className="mvd-ncrfg-pole">
      <dt>{etykieta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Nagłówek modułu z wyniku biegu — RAZ, nad tabelą wymagań (standard warsztatu KD6): typ modułu,
 * moc, napięcie, technologia i źródło danych w jednej linii; operator z wersją procedury PTPiREE
 * (ze stanem źródła); dowód certyfikatu urządzenia albo jawny brak. Powód klasyfikacji z progami
 * i podstawą oraz pełny zapis rekordu wykazu — jednym przyciskiem „Szczegóły".
 */
export function NaglowekModuluNcRfg({
  modul,
  odrzucony = null,
  testid,
}: {
  readonly modul: WynikModuluNcRfg;
  readonly odrzucony?: CertyfikatOdrzucony | null;
  readonly testid: string;
}): JSX.Element {
  const [otwarty, setOtwarty] = useState(false);
  const idSzczegolow = useId();
  const klasa = modul.klasyfikacja.modul;
  return (
    <div className="mvd-ncrfg-naglowek" data-testid={testid}>
      <div className="mvd-ncrfg-linia">
        <span
          className="mvd-ncrfg-klasa"
          data-testid={`${testid}-klasyfikacja`}
          data-modul={klasa ?? ''}
        >
          {klasa !== null ? `${T.klasaModulu} ${klasa}` : T.klasaPonizejProgu}
        </span>
        <span className="mvd-ncrfg-num">{`${liczbaPl(modul.p_max_kw)} kW`}</span>
        <span className="mvd-ncrfg-num">{`${liczbaPl(modul.voltage_kv)} kV`}</span>
        <span>{nazwaTechnologii(modul.technologia)}</span>
        <span className="mvd-ncrfg-linia-etyk">
          {`${T.zrodloDanych}: `}
          <span data-testid={`${testid}-zrodlo`}>{opisZrodlaDanych(modul.zrodlo_danych)}</span>
        </span>
      </div>
      <div className="mvd-ncrfg-linia">
        <span className="mvd-ncrfg-linia-etyk">{modul.operator_name_pl}</span>
        <OpisDokumentuWarstwy dokument={modul.wersja_procedury} testid={`${testid}-procedura`} />
      </div>
      <div className="mvd-ncrfg-linia">
        <span className="mvd-ncrfg-linia-etyk">{T.certyfikat}</span>
        <DowodCertyfikatuZwiezly
          dowod={modul.dowod_certyfikatu}
          odrzucony={odrzucony}
          zrodloDanych={modul.zrodlo_danych}
          testid={`${testid}-dowod`}
        />
        <button
          type="button"
          className="mvd-ncrfg-przelacz"
          aria-expanded={otwarty}
          aria-controls={idSzczegolow}
          onClick={() => setOtwarty((o) => !o)}
          data-testid={`${testid}-szczegoly-przelacz`}
        >
          {otwarty ? T.ukryjSzczegolyModulu : T.szczegolyModulu}
        </button>
      </div>
      {otwarty ? (
        <dl id={idSzczegolow} className="mvd-ncrfg-pola" data-testid={`${testid}-szczegoly`}>
          <Pole etykieta={T.klasyfikacja}>
            <OpisKlasyfikacji
              klasyfikacja={modul.klasyfikacja}
              testid={`${testid}-szczegoly-klasyfikacja`}
            />
          </Pole>
          <Pole etykieta={T.dowodCertyfikatu}>
            <DowodCertyfikatuOpis
              dowod={modul.dowod_certyfikatu}
              odrzucony={odrzucony}
              zrodloDanych={modul.zrodlo_danych}
              testid={`${testid}-szczegoly-dowod`}
            />
          </Pole>
        </dl>
      ) : null}
    </div>
  );
}

// =============================================================================
// Tabela rekordów wymagań (jedno wymaganie = jeden wiersz, szczegóły na żądanie)
// =============================================================================

export function ZapisDokumentu({
  blok,
  testid,
}: {
  readonly blok: readonly PozycjaBloku[];
  readonly testid: string;
}): JSX.Element {
  const [otwarty, setOtwarty] = useState(false);
  const idTresci = useId();
  const szczegolyAudytowe = useShellStore((stan) => stan.szczegolyAudytowe);
  // Karta #145: pozycje audytowe (odniesienie do dowodu, bieg śladu) niosą identyfikatory
  // i odciski — poza pierwszym planem, w informacjach audytowych (tryb ekspercki).
  const merytoryczne = blok.filter((p) => !POZYCJE_AUDYTOWE_BLOKU.includes(p.etykieta_pl));
  const audytowe = blok.filter((p) => POZYCJE_AUDYTOWE_BLOKU.includes(p.etykieta_pl));
  return (
    <div className="mvd-ncrfg-zapis">
      <button
        type="button"
        className="mvd-ncrfg-przelacz"
        aria-expanded={otwarty}
        aria-controls={idTresci}
        onClick={() => setOtwarty((o) => !o)}
        data-testid={`${testid}-przelacz`}
      >
        {otwarty ? T.ukryjZapis : T.pokazZapis}
      </button>
      {otwarty ? (
        <div id={idTresci}>
          <dl className="mvd-ncrfg-blok" data-testid={testid}>
            {merytoryczne.map((pozycja, indeks) => (
              <div key={`${pozycja.etykieta_pl}-${indeks}`} className="mvd-ncrfg-blok-wiersz">
                <dt>{pozycja.etykieta_pl}</dt>
                <dd>{pozycja.tresc_pl}</dd>
              </div>
            ))}
          </dl>
          <InformacjeAudytowe
            wiersze={audytowe.map((p) => ({ etykieta: p.etykieta_pl, wartosc: p.tresc_pl }))}
            szczegolyAudytowe={szczegolyAudytowe}
            testid={`${testid}-informacje-audytowe`}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Znak relacji przy wartości wymaganej (typografia tabeli; warunek pełny — KaTeX w szczegółach). */
function znakRelacji(relacja: Relacja): string {
  switch (relacja) {
    case 'NIE_WIECEJ':
      return '≤ ';
    case 'NIE_MNIEJ':
      return '≥ ';
    default:
      return '';
  }
}

/** Komórka z treścią i opcjonalnym wyróżnieniem wartości wymagającej uwagi (§10 pkt 8). */
interface Komorka {
  readonly tekst: string;
  readonly uwaga: 'ujemny' | 'brak' | null;
}

const KRESKA: Komorka = { tekst: T.kreska, uwaga: null };

/**
 * Wartość wymagana kryterium z LIMITU rekordu: liczba z jednostką i znakiem relacji, pasmo
 * „od … do", obwiednia (punkty w szczegółach). Kryterium logiczne nie ma wartości liczbowej
 * (kreska — warunek logiczny pokazuje karta). Kryterium liczbowe bez limitu = „brak limitu"
 * z wyróżnieniem (brak podstawy wartości jest informacją wymagającą uwagi, nie pustym polem).
 */
function komorkaWymagana(ocena: OcenaKryterium): Komorka {
  const { relacja } = ocena.kryterium;
  if (relacja === 'LOGICZNE') return KRESKA;
  const limit = ocena.limit;
  if (limit !== null && limit.wartosc !== null) {
    return { tekst: `${znakRelacji(relacja)}${wielkoscPl(limit.wartosc)}`, uwaga: null };
  }
  if (limit !== null && limit.pasmo !== null) {
    return {
      tekst: `${wielkoscPl(limit.pasmo[0])} … ${wielkoscPl(limit.pasmo[1])}`,
      uwaga: null,
    };
  }
  if (limit !== null && limit.obwiednia !== null) {
    return {
      tekst: limit.jednostka_obwiedni ? `${T.obwiednia} [${limit.jednostka_obwiedni}]` : T.obwiednia,
      uwaga: null,
    };
  }
  return { tekst: T.brakLimitu, uwaga: 'brak' };
}

/** Wartość wykazana z wyniku rekordu (kryterium logiczne: bez liczby — znacznik dowodu wystarcza). */
function komorkaWykazana(ocena: OcenaKryterium): Komorka {
  if (ocena.wynik === null || ocena.kryterium.relacja === 'LOGICZNE') return KRESKA;
  return { tekst: wielkoscPl(ocena.wynik.wartosc), uwaga: null };
}

/**
 * Zapas z MARGINESU rekordu (ze znakiem). Wynik bez oceny albo margines niedefiniowalny
 * (kryterium logiczne) — kreska; wynik bez marginesu — „brak" z wyróżnieniem; zapas ujemny —
 * wyróżnienie. Znak liczby pochodzi z backendu (margines), UI niczego nie liczy.
 */
function komorkaZapasu(ocena: OcenaKryterium): Komorka {
  const margines = ocena.margines;
  if (margines !== null && margines.wartosc !== null) {
    return {
      tekst: wielkoscPl(margines.wartosc, true),
      uwaga: margines.wartosc.wartosc < 0 ? 'ujemny' : null,
    };
  }
  if (ocena.wynik === null) return KRESKA;
  if (margines !== null && margines.niedefiniowalny) return KRESKA;
  return { tekst: T.brakZapasu, uwaga: 'brak' };
}

function KomorkaWartosci({ komorka, testid }: { readonly komorka: Komorka; readonly testid?: string }) {
  return (
    <span className="mvd-ncrfg-num" data-uwaga={komorka.uwaga ?? undefined} data-testid={testid}>
      {komorka.tekst}
    </span>
  );
}

/** Podstawa wspólna WSZYSTKICH rekordów (dokument i wydanie) — pokazywana raz nad tabelą. */
function podstawaWspolna(rekordy: readonly WynikWymagania[]): PodstawaWymagania | null {
  const pierwsza = rekordy[0]?.podstawa ?? null;
  if (pierwsza === null) return null;
  const wspolna = rekordy.every(
    (r) =>
      r.podstawa.dokument === pierwsza.dokument &&
      r.podstawa.wydanie === pierwsza.wydanie &&
      r.podstawa.status === pierwsza.status,
  );
  return wspolna ? pierwsza : null;
}

/** Dokument podstawy w komórce wymagania, gdy podstawa nie jest wspólna dla tabeli. */
function opisPodstawyWiersza(podstawa: PodstawaWymagania, wspolna: PodstawaWymagania | null): string {
  const jednostka = podstawa.jednostka_redakcyjna ?? '';
  if (wspolna !== null) return jednostka;
  const dokument = podstawa.wydanie ?? podstawa.dokument;
  return jednostka ? `${jednostka} · ${dokument}` : dokument;
}

/** Wiersz rekordu w tabeli: identyfikator jednoznaczny także dla powtórzonego `wymaganie_id`. */
interface WierszTabeli {
  readonly rekord: WynikWymagania;
  readonly indeks: number;
  readonly testid: string;
}

const LICZBA_KOLUMN = 6;

function WierszWymagania({
  wiersz,
  zdanie,
  blok,
  wspolna,
}: {
  readonly wiersz: WierszTabeli;
  readonly zdanie: string | null;
  readonly blok: readonly PozycjaBloku[] | null;
  readonly wspolna: PodstawaWymagania | null;
}): JSX.Element {
  const { rekord, testid } = wiersz;
  const [otwarty, setOtwarty] = useState(false);
  const idSzczegolow = useId();
  // Oceny składowe STOSOWALNE do wymagania — każda ma własny wiersz wartości, gdy jest ich
  // więcej niż jedna (agregat nie zastępuje składników, kontrakt werdyktu §2.3).
  const skladowe = rekord.oceny_skladowe.filter((o) => o.stosowalnosc.dotyczy);
  const jedna = skladowe.length === 1 ? skladowe[0] : null;
  const metoda = jedna?.wynik?.metoda ?? rekord.sposob_wykazania;
  return (
    <>
      <tr className="mvd-ncrfg-wiersz" data-testid={testid} data-status={rekord.status_maszynowy}>
        <th scope="row" className="mvd-ncrfg-kol-nazwa">
          <span className="mvd-ncrfg-wymaganie-nazwa">{rekord.nazwa_pl}</span>
          <span className="mvd-ncrfg-artykul">{opisPodstawyWiersza(rekord.podstawa, wspolna)}</span>
        </th>
        <td data-testid={`${testid}-wymagane`}>
          {jedna !== null ? <KomorkaWartosci komorka={komorkaWymagana(jedna)} /> : null}
          {skladowe.length === 0 ? <KomorkaWartosci komorka={KRESKA} /> : null}
        </td>
        <td data-testid={`${testid}-wykazane`}>
          {jedna !== null ? <KomorkaWartosci komorka={komorkaWykazana(jedna)} /> : null}
          <span className="mvd-ncrfg-znacznik" data-testid={`${testid}-metoda`} data-metoda={metoda}>
            {NAZWA_METODY_PL[metoda]}
          </span>
        </td>
        <td data-testid={`${testid}-zapas`}>
          {jedna !== null ? <KomorkaWartosci komorka={komorkaZapasu(jedna)} /> : null}
          {skladowe.length === 0 ? <KomorkaWartosci komorka={KRESKA} /> : null}
        </td>
        <td>
          <EtykietaWerdyktu
            etykieta={rekord.etykieta}
            status={rekord.status_maszynowy}
            testid={`${testid}-etykieta`}
            zwarta
          />
        </td>
        <td className="mvd-ncrfg-kol-akcja">
          <button
            type="button"
            className="mvd-ncrfg-przelacz"
            aria-expanded={otwarty}
            aria-controls={idSzczegolow}
            aria-label={`${T.kolSzczegoly}: ${rekord.nazwa_pl}`}
            onClick={() => setOtwarty((o) => !o)}
            data-testid={`${testid}-przelacz`}
          >
            {otwarty ? T.ukryjKarte : T.pokazKarte}
          </button>
        </td>
      </tr>
      {skladowe.length > 1
        ? skladowe.map((ocena) => (
            <tr
              key={ocena.kryterium_id}
              className="mvd-ncrfg-wiersz-skladowej"
              data-testid={`${testid}-skladowa-${ocena.kryterium_id}`}
            >
              <th scope="row" className="mvd-ncrfg-kol-nazwa mvd-ncrfg-skladowa-nazwa">
                {ocena.kryterium.opis_pl}
              </th>
              <td>
                <KomorkaWartosci komorka={komorkaWymagana(ocena)} />
              </td>
              <td>
                <KomorkaWartosci komorka={komorkaWykazana(ocena)} />{' '}
                {ocena.wynik !== null ? (
                  <span className="mvd-ncrfg-znacznik" data-metoda={ocena.wynik.metoda}>
                    {NAZWA_METODY_PL[ocena.wynik.metoda]}
                  </span>
                ) : null}
              </td>
              <td>
                <KomorkaWartosci komorka={komorkaZapasu(ocena)} />
              </td>
              <td colSpan={2} />
            </tr>
          ))
        : null}
      {otwarty ? (
        <tr className="mvd-ncrfg-wiersz-szczegolow">
          <td colSpan={LICZBA_KOLUMN} id={idSzczegolow} data-testid={`${testid}-karta`}>
            {/* Zdanie spoza rekordu (np. zdanie braku dokumentu 422) — tylko gdy różni się od
                wyjaśnienia rekordu; wyjaśnienie rekordu pokazuje karta (bez powtórzenia). */}
            {zdanie && zdanie !== rekord.wyjasnienie.zdanie_pl ? (
              <p className="mvd-ncrfg-zdanie" data-testid={`${testid}-zdanie`}>
                {zdanie}
              </p>
            ) : null}
            <KartaWerdyktu rekord={rekord} />
            {blok !== null ? <ZapisDokumentu blok={blok} testid={`${testid}-zapis`} /> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * Wymagania niestosowane do modułu — JEDEN wiersz zbiorczy („Nie dotyczy: 7 wymagań") z powodem
 * podanym raz, gdy wszystkie rekordy grupy mają ten sam powód stosowalności; rozwinięcie pokazuje
 * każdy rekord jego własnym wierszem z kartą na żądanie (licznik obok listy, nigdy zamiast niej —
 * kontrakt werdyktu §9).
 */
function GrupaNieDotyczy({
  wiersze,
  zdania,
  bloki,
  wspolna,
  testid,
}: {
  readonly wiersze: readonly WierszTabeli[];
  readonly zdania: readonly string[] | null;
  readonly bloki: readonly (readonly PozycjaBloku[])[] | null;
  readonly wspolna: PodstawaWymagania | null;
  readonly testid: string;
}): JSX.Element {
  const [otwarta, setOtwarta] = useState(false);
  const powody = new Set(wiersze.map((w) => w.rekord.stosowalnosc.powod_pl));
  const powodWspolny = powody.size === 1 ? wiersze[0].rekord.stosowalnosc.powod_pl : null;
  return (
    <>
      <tr className="mvd-ncrfg-wiersz-grupy" data-testid={testid}>
        <th scope="row" colSpan={LICZBA_KOLUMN - 1} className="mvd-ncrfg-kol-nazwa">
          <span className="mvd-ncrfg-wymaganie-nazwa">
            {`${T.nieDotyczyGrupa}: ${liczbaWymagan(wiersze.length)}`}
          </span>
          {powodWspolny ? (
            <span className="mvd-ncrfg-artykul" data-testid={`${testid}-powod`}>
              {powodWspolny}
            </span>
          ) : null}
        </th>
        <td className="mvd-ncrfg-kol-akcja">
          <button
            type="button"
            className="mvd-ncrfg-przelacz"
            aria-expanded={otwarta}
            onClick={() => setOtwarta((o) => !o)}
            data-testid={`${testid}-przelacz`}
          >
            {otwarta ? T.ukryjNieDotyczy : T.pokazNieDotyczy}
          </button>
        </td>
      </tr>
      {otwarta
        ? wiersze.map((wiersz) => (
            <WierszWymagania
              key={`${wiersz.rekord.wymaganie_id}-${wiersz.indeks}`}
              wiersz={wiersz}
              zdanie={zdania?.[wiersz.indeks] ?? wiersz.rekord.wyjasnienie.zdanie_pl}
              blok={bloki?.[wiersz.indeks] ?? null}
              wspolna={wspolna}
            />
          ))
        : null}
    </>
  );
}

/**
 * Rekordy `WynikWymagania` w kolejności backendu jako TABELA (standard warsztatu KD6): jedno
 * wymaganie = jeden wiersz — nazwa i jednostka redakcyjna, wartość wymagana (limit), wartość
 * wykazana ze znacznikiem źródła dowodu, zapas (margines) i stan (etykieta rekordu). Podstawa
 * wspólna dla wszystkich rekordów stoi raz nad tabelą. Zdanie wyjaśnienia, pełna `KartaWerdyktu`
 * (kryterium KaTeX, podstawa ze stanem źródła, metoda, kompletność dowodu) i blok dokumentu
 * formalnego — jednym przyciskiem „Szczegóły" w wierszu. Wymagania niestosowane do modułu
 * (`stosowalnosc.dotyczy` — jedno źródło podziału) zwinięte w jeden wiersz zbiorczy.
 * Ten sam `wymaganie_id` może wystąpić kilka razy — kolejne wystąpienia dostają sufiks numeru
 * wystąpienia (`-2`, `-3`…), liczony na CAŁEJ liście (identyfikatory nie zależą od podziału).
 */
export function ListaRekordowWymagan({
  rekordy,
  bloki = null,
  zdania = null,
  testid,
}: {
  readonly rekordy: readonly WynikWymagania[];
  readonly bloki?: readonly (readonly PozycjaBloku[])[] | null;
  readonly zdania?: readonly string[] | null;
  readonly testid: string;
}): JSX.Element {
  if (rekordy.length === 0) {
    return (
      <p className="mvd-ncrfg-opis" data-testid={`${testid}-pusta`}>
        {T.wymaganiaBrak}
      </p>
    );
  }
  const wystapienia = new Map<string, number>();
  const wiersze: WierszTabeli[] = rekordy.map((rekord, indeks) => {
    const numer = (wystapienia.get(rekord.wymaganie_id) ?? 0) + 1;
    wystapienia.set(rekord.wymaganie_id, numer);
    const idWiersza = numer === 1 ? rekord.wymaganie_id : `${rekord.wymaganie_id}-${numer}`;
    return { rekord, indeks, testid: `${testid}-${idWiersza}` };
  });
  const stosowane = wiersze.filter((w) => w.rekord.stosowalnosc.dotyczy);
  const niestosowane = wiersze.filter((w) => !w.rekord.stosowalnosc.dotyczy);
  const wspolna = podstawaWspolna(rekordy);
  return (
    <div className="mvd-ncrfg-wymagania" data-testid={testid}>
      {wspolna !== null ? (
        <p className="mvd-ncrfg-wspolna" data-testid={`${testid}-podstawa`}>
          <span className="mvd-ncrfg-linia-etyk">{`${T.podstawaWspolna}: `}</span>
          {wspolna.dokument}
          {` · ${T.stanZrodla}: ${nazwaStanuZrodla(wspolna.status)}`}
        </p>
      ) : null}
      <table className="mvd-ncrfg-tabela">
        <thead>
          <tr>
            <th scope="col">{T.kolWymaganie}</th>
            <th scope="col">{T.kolWymagane}</th>
            <th scope="col">{T.kolWykazane}</th>
            <th scope="col">{T.kolZapas}</th>
            <th scope="col">{T.kolStan}</th>
            <th scope="col">
              <span className="mvd-sr-only">{T.kolSzczegoly}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {stosowane.map((wiersz) => (
            <WierszWymagania
              key={`${wiersz.rekord.wymaganie_id}-${wiersz.indeks}`}
              wiersz={wiersz}
              zdanie={zdania?.[wiersz.indeks] ?? wiersz.rekord.wyjasnienie.zdanie_pl}
              blok={bloki?.[wiersz.indeks] ?? null}
              wspolna={wspolna}
            />
          ))}
          {niestosowane.length > 0 ? (
            <GrupaNieDotyczy
              wiersze={niestosowane}
              zdania={zdania}
              bloki={bloki}
              wspolna={wspolna}
              testid={`${testid}-nie-dotyczy`}
            />
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Sekcja modułu dokumentu formalnego (certyfikat, wniosek)
// =============================================================================

/**
 * Sekcja modułu dokumentu (`sekcja_modulu()`): wiersze, na których stoją rekordy (moduł,
 * klasyfikacja z podstawą, technologia, dowód certyfikatu albo powód odrzucenia — zdania
 * backendu, te same co DOCX, więc zostają prozą dokumentu), dowód rekordu wykazu w jednej
 * linii pól i tabela rekordów wymagań z blokami dokumentu w szczegółach wiersza.
 */
export function SekcjaModuluDokumentu({
  sekcja,
  testid,
}: {
  readonly sekcja: SekcjaModuluNcRfg;
  readonly testid: string;
}): JSX.Element {
  return (
    <section className="mvd-ncrfg-sekcja" data-testid={testid}>
      <h5 className="mvd-ncrfg-sekcja-tytul">
        {`${T.modul}: ${sekcja.der_name ?? sekcja.der_ref}`}
      </h5>
      <dl className="mvd-ncrfg-pola" data-testid={`${testid}-wiersze`}>
        {sekcja.wiersze.map((wiersz, indeks) => (
          <div key={`${wiersz.etykieta_pl}-${indeks}`} className="mvd-ncrfg-pole">
            <dt>{wiersz.etykieta_pl}</dt>
            <dd>{wiersz.tresc_pl}</dd>
          </div>
        ))}
      </dl>
      {/* Wiersze dokumentu niosą już zdanie o dowodzie (treść DOCX) — dowód rekordu wykazu
          w jednej linii pól (bez powtórzenia akapitu; standard warsztatu KD6). */}
      <div className="mvd-ncrfg-linia">
        <span className="mvd-ncrfg-linia-etyk">{T.certyfikat}</span>
        <DowodCertyfikatuZwiezly
          dowod={sekcja.dowod_certyfikatu}
          odrzucony={sekcja.certyfikat_odrzucony}
          zrodloDanych={sekcja.zrodlo_danych}
          testid={`${testid}-dowod`}
        />
      </div>
      <h6 className="mvd-ncrfg-podtytul">{T.wymagania}</h6>
      <ListaRekordowWymagan
        rekordy={sekcja.wymagania.map((w) => w.rekord)}
        bloki={sekcja.wymagania.map((w) => w.blok)}
        testid={`${testid}-wymagania`}
      />
    </section>
  );
}

// =============================================================================
// Braki dokumentu (422) — „czego brakuje"
// =============================================================================

/** Braki jednego modułu (kolejność pierwszego wystąpienia modułu w odpowiedzi backendu). */
interface GrupaBrakowModulu {
  readonly derRef: string;
  readonly derName: string | null;
  readonly rekordy: WynikWymagania[];
  readonly zdania: string[];
}

/**
 * Grupuje braki 422 po module (`der_ref` z pozycji braku — plan AB O-50 pkt 7). Porządek i
 * treść pochodzą z backendu (moduły w kolejności modelu, wymagania w kolejności profilu); to
 * wyłącznie układ listy — bez liczenia ani oceny. Zdanie pozycji to zdanie z `braki_pl` tego
 * samego indeksu (ten sam moduł — pary z jednego źródła).
 */
function brakiPoModule(
  braki: readonly BrakWymaganiaModulu[],
  zdania: readonly ZdanieBrakuModulu[],
): GrupaBrakowModulu[] {
  const grupy = new Map<string, GrupaBrakowModulu>();
  braki.forEach((brak, indeks) => {
    const grupa =
      grupy.get(brak.der_ref) ??
      { derRef: brak.der_ref, derName: brak.der_name, rekordy: [], zdania: [] };
    grupa.rekordy.push(brak.rekord);
    const zdanie = zdania[indeks];
    grupa.zdania.push(
      zdanie !== undefined && zdanie.der_ref === brak.der_ref
        ? zdanie.zdanie_pl
        : brak.rekord.wyjasnienie.zdanie_pl,
    );
    grupy.set(brak.der_ref, grupa);
  });
  return [...grupy.values()];
}

/**
 * Ekran braków dokumentu formalnego z odpowiedzi 422: komunikat backendu, braki tekstowe
 * (wniosek), rekordy W bez wykazanej zgodności pogrupowane po module, którego dotyczą
 * (plakietka + zdanie + karta), i źródła modelu nieobjęte oceną. To TREŚĆ inżynierska
 * („czego brakuje"), nie komunikat błędu.
 */
export function BrakiDokumentu({
  komunikat,
  brakiTekstowe = [],
  braki,
  zdania,
  pominietePl,
  testid,
}: {
  readonly komunikat: string;
  readonly brakiTekstowe?: readonly string[];
  readonly braki: readonly BrakWymaganiaModulu[];
  readonly zdania: readonly ZdanieBrakuModulu[];
  readonly pominietePl: readonly string[];
  readonly testid: string;
}): JSX.Element {
  const moduly = brakiPoModule(braki, zdania);
  return (
    <div className="mvd-ncrfg-braki" data-testid={testid}>
      <p className="mvd-ncrfg-braki-komunikat">{komunikat}</p>
      {brakiTekstowe.length > 0 ? (
        <div data-testid={`${testid}-tekstowe`}>
          <h6 className="mvd-ncrfg-podtytul">{T.brakiTekstowe}</h6>
          <ul className="mvd-ncrfg-lista">
            {brakiTekstowe.map((brak, indeks) => (
              <li key={indeks}>{brak}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {moduly.length > 0 ? (
        <div data-testid={`${testid}-rekordy`}>
          <h6 className="mvd-ncrfg-podtytul">{T.brakiRekordy}</h6>
          {moduly.map((modul) => (
            <section
              key={modul.derRef}
              className="mvd-ncrfg-braki-modul"
              data-testid={`${testid}-modul-${modul.derRef}`}
            >
              <p className="mvd-ncrfg-braki-modul-nazwa">
                {`${T.modul}: ${modul.derName ?? modul.derRef}`}
              </p>
              <ListaRekordowWymagan
                rekordy={modul.rekordy}
                zdania={modul.zdania}
                testid={`${testid}-rekordy-${modul.derRef}`}
              />
            </section>
          ))}
        </div>
      ) : null}
      {pominietePl.length > 0 ? (
        <div data-testid={`${testid}-pominiete`}>
          <h6 className="mvd-ncrfg-podtytul">{T.brakiPominiete}</h6>
          <ul className="mvd-ncrfg-lista">
            {pominietePl.map((opis, indeks) => (
              <li key={indeks}>{opis}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
