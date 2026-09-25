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

import { EtykietaWerdyktu, KartaWerdyktu } from '../../wyniki/wzorzec/KartaWerdyktu';
import { InformacjeAudytowe } from '../../wyniki/wzorzec/InformacjeAudytowe';
import { useShellStore } from '../../shell/useShellStore';
import type { PodstawaWymagania, StanZrodla, WynikWymagania } from '../../wyniki/wzorzec/werdykt';
import {
  NCRFG_STRINGS as T,
  liczbaPl,
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
  const trybEkspercki = useShellStore((stan) => stan.advancementMode) === 'expert';
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
          trybEkspercki={trybEkspercki}
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

function Pole({ etykieta, children }: { readonly etykieta: string; readonly children: ReactNode }) {
  return (
    <div className="mvd-ncrfg-pole">
      <dt>{etykieta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Nagłówek modułu z wyniku biegu: klasyfikacja (z powodem, progami i podstawą), technologia,
 * źródło danych, dowód certyfikatu albo jawny brak i wersja procedury obowiązująca moduł.
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
  return (
    <dl className="mvd-ncrfg-pola" data-testid={testid}>
      <Pole etykieta={T.klasyfikacja}>
        <OpisKlasyfikacji klasyfikacja={modul.klasyfikacja} testid={`${testid}-klasyfikacja`} />
      </Pole>
      <Pole etykieta={T.technologia}>{nazwaTechnologii(modul.technologia)}</Pole>
      <Pole etykieta={T.zrodloDanych}>
        <span data-testid={`${testid}-zrodlo`}>{opisZrodlaDanych(modul.zrodlo_danych)}</span>
      </Pole>
      <Pole etykieta={T.dowodCertyfikatu}>
        <DowodCertyfikatuOpis
          dowod={modul.dowod_certyfikatu}
          odrzucony={odrzucony}
          zrodloDanych={modul.zrodlo_danych}
          testid={`${testid}-dowod`}
        />
      </Pole>
      <Pole etykieta={T.wersjaProcedury}>
        <OpisDokumentuWarstwy dokument={modul.wersja_procedury} testid={`${testid}-procedura`} />
      </Pole>
    </dl>
  );
}

// =============================================================================
// Lista rekordów wymagań (plakietka + karta)
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
  const trybEkspercki = useShellStore((stan) => stan.advancementMode) === 'expert';
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
            trybEkspercki={trybEkspercki}
            testid={`${testid}-informacje-audytowe`}
          />
        </div>
      ) : null}
    </div>
  );
}

function WierszWymagania({
  rekord,
  zdanie,
  blok,
  testid,
}: {
  readonly rekord: WynikWymagania;
  readonly zdanie: string | null;
  readonly blok: readonly PozycjaBloku[] | null;
  readonly testid: string;
}): JSX.Element {
  const [otwarty, setOtwarty] = useState(false);
  const idKarty = useId();
  return (
    <li className="mvd-ncrfg-wymaganie" data-testid={testid} data-status={rekord.status_maszynowy}>
      <div className="mvd-ncrfg-wymaganie-wiersz">
        <EtykietaWerdyktu
          etykieta={rekord.etykieta}
          status={rekord.status_maszynowy}
          testid={`${testid}-etykieta`}
        />
        <span className="mvd-ncrfg-wymaganie-nazwa">{rekord.nazwa_pl}</span>
        <button
          type="button"
          className="mvd-ncrfg-przelacz"
          aria-expanded={otwarty}
          aria-controls={idKarty}
          onClick={() => setOtwarty((o) => !o)}
          data-testid={`${testid}-przelacz`}
        >
          {otwarty ? T.ukryjKarte : T.pokazKarte}
        </button>
      </div>
      {zdanie ? <p className="mvd-ncrfg-opis mvd-ncrfg-zdanie">{zdanie}</p> : null}
      {otwarty ? (
        <div id={idKarty} className="mvd-ncrfg-karta" data-testid={`${testid}-karta`}>
          <KartaWerdyktu rekord={rekord} />
          {blok !== null ? <ZapisDokumentu blok={blok} testid={`${testid}-zapis`} /> : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Rekordy `WynikWymagania` w kolejności backendu: plakietka etykiety z rekordu, nazwa
 * wymagania i zdanie wyjaśnienia; pełna `KartaWerdyktu` po jednym kliknięciu (natywny
 * przycisk z `aria-expanded`). Opcjonalnie blok dokumentu formalnego (te same zdania co DOCX).
 * Ten sam `wymaganie_id` może wystąpić na liście kilka razy (kilka rekordów jednego wymagania)
 * — kolejne wystąpienia dostają sufiks numeru wystąpienia (`-2`, `-3`…), żeby identyfikatory
 * wierszy były jednoznaczne.
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
  return (
    <ul className="mvd-ncrfg-wymagania" data-testid={testid}>
      {rekordy.map((rekord, indeks) => {
        const numer = (wystapienia.get(rekord.wymaganie_id) ?? 0) + 1;
        wystapienia.set(rekord.wymaganie_id, numer);
        const idWiersza = numer === 1 ? rekord.wymaganie_id : `${rekord.wymaganie_id}-${numer}`;
        return (
          <WierszWymagania
            key={`${rekord.wymaganie_id}-${indeks}`}
            rekord={rekord}
            zdanie={zdania?.[indeks] ?? rekord.wyjasnienie.zdanie_pl}
            blok={bloki?.[indeks] ?? null}
            testid={`${testid}-${idWiersza}`}
          />
        );
      })}
    </ul>
  );
}

// =============================================================================
// Sekcja modułu dokumentu formalnego (certyfikat, wniosek)
// =============================================================================

/**
 * Sekcja modułu dokumentu (`sekcja_modulu()`): wiersze, na których stoją rekordy (moduł,
 * klasyfikacja z podstawą, technologia, dowód certyfikatu albo powód odrzucenia — zdania
 * backendu), jawny dowód certyfikatu i rekordy wymagań z blokami dokumentu.
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
      <DowodCertyfikatuOpis
        dowod={sekcja.dowod_certyfikatu}
        odrzucony={sekcja.certyfikat_odrzucony}
        zrodloDanych={sekcja.zrodlo_danych}
        testid={`${testid}-dowod`}
      />
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
