/*
 * KARTA WERDYKTU — JEDEN komponent prezentacji rekordu werdyktu wyjaśnialnego
 * (`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md` §4, §5, §9; kontrakt prezentacji V12.7 §6a).
 *
 * Co karta robi: pokazuje PEŁNY rekord z backendu — `OcenaKryterium` (poziom K) albo
 * `WynikWymagania` (poziom W) — w kolejności minimum §9: Ocena · Kryterium · Wynik · Limit ·
 * Margines · Niepewność · Wyjaśnienie · Podstawa · Dowód · Kompletność dowodu, a zakres
 * ważności i ślad jako sekcje rozwijane (jedno kliknięcie, natywny przycisk z
 * `aria-expanded`). Rekord W pokazuje dodatkowo stosowalność, sposób wykazania, pokrycie
 * programu badań, kryteria naruszone, kryterium najbliżej granicy oraz WSZYSTKIE oceny
 * składowe jako zagnieżdżone karty — zawsze w DOM (zakaz „master PASS": agregat nie zastępuje
 * składników).
 *
 * Czego karta NIE robi (granica kontraktu):
 *  - nie zna znaczenia statusu maszynowego: etykietę PL niesie rekord (`etykieta.etykieta_pl`,
 *    liczona w `backend/src/werdykt/etykiety.py`); w UI NIE MA mapy „status → etykieta";
 *  - nie liczy marginesu, kompletności, statusu ani żadnej reguły K/W — tylko formatuje liczby
 *    z rekordu (najwyżej 4 cyfry znaczące, bez własnych progów);
 *  - nie składa zdań wyjaśnienia: `zdanie_pl`, `przyczyna_pl`, `czego_brakuje` i `zastrzezenia`
 *    są wyświetlane dosłownie (to samo, co dokument formalny — T13);
 *  - nie pokazuje w pierwszym planie surowych identyfikatorów (identyfikator kryterium/
 *    wymagania, referencja elementu, kody osi dowodu, identyfikatory biegów, wersje silnika):
 *    te idą do zwiniętej wspólnej sekcji `InformacjeAudytowe` karty; pierwszy plan niesie
 *    wyłącznie nazwy polskie tych samych wartości.
 *
 * JEDYNE miejsce mapowania SEMANTYKI koloru (`pozytywna` / `negatywna` / `ostrzegawcza` /
 * `neutralna`) na kolor to `SEMANTYKA_KOLOR` poniżej — na tokeny motywu `--mvd-*`, więc oba
 * motywy (jasny i ciemny) działają bez literałów koloru. Matematyka (warunek kryterium,
 * symbol wielkości, definicja marginesu) renderuje się WYŁĄCZNIE z pól `*_latex` przez
 * `MathInline` (`ui/proof/MathRenderer`).
 */

import { useId, useState, type CSSProperties, type ReactNode } from 'react';

import { MathInline } from '../../../ui/proof/MathRenderer';
import {
  jestWynikiemWymagania,
  type ClaimKind,
  type DanaPrzyjeta,
  type DziedzinaFizyki,
  type EvidenceTier,
  type FieldQuality,
  type KompletnoscDowodu,
  type LimitKryterium,
  type Margines,
  type MetodaDowodu,
  type Niepewnosc,
  type OcenaKryterium,
  type OdnosnikSladu,
  type PodstawaWymagania,
  type PokrycieProgramu,
  type PoziomRekordu,
  type RekordWerdyktu,
  type Relacja,
  type RodzajPodstawy,
  type RodzajSkali,
  type SemantykaEtykiety,
  type StanDanych,
  type StanZrodla,
  type StatusDowodu,
  type StatusModelu,
  type Stosowalnosc,
  type Wielkosc,
  type WyjasnienieWerdyktu,
  type WynikKryterium,
  type WynikWymagania,
  type ZakresWaznosci,
  type Etykieta,
  type StatusWerdyktu,
} from './werdykt';
import {
  InformacjeAudytowe,
  type WierszInformacjiAudytowych,
} from './InformacjeAudytowe';
import { useNazwaObiektu } from './useNazwaObiektu';
import { opisOdnosnikaSladu } from './opisKrokuSladu';
import './wzorzec.css';
import './kartaWerdyktu.css';

// ---------------------------------------------------------------------------
// JEDYNA mapa koloru: semantyka etykiety → token motywu (§9)
// ---------------------------------------------------------------------------

/**
 * Semantyka etykiety → kolor (token motywu). JEDYNA taka mapa w interfejsie — nie istnieje
 * żadna mapa po statusie maszynowym. Kolor tła plakietki i paska karty pochodzi z tego samego
 * tokenu (`color-mix` w `kartaWerdyktu.css`), więc oba motywy mają spójny kontrast.
 */
export const SEMANTYKA_KOLOR: Readonly<Record<SemantykaEtykiety, string>> = {
  pozytywna: 'var(--mvd-ok)',
  negatywna: 'var(--mvd-err)',
  ostrzegawcza: 'var(--mvd-warn)',
  neutralna: 'var(--mvd-muted)',
};

/** Styl karty z własnością niestandardową koloru semantyki (typ bez rzutowania). */
type StylKarty = CSSProperties & Record<'--mvd-werdykt-kolor', string>;

// ---------------------------------------------------------------------------
// Nazwy PL osi dowodu i słowników pomocniczych (NIE statusu werdyktu)
// ---------------------------------------------------------------------------

/** Lustro `backend/src/werdykt/wyjasnienie.py::NAZWA_METODY_PL` — te same słowa co dokument. */
const NAZWA_METODY_PL: Readonly<Record<MetodaDowodu, string>> = {
  CERTYFIKAT: 'certyfikat urządzenia',
  RAPORT_Z_TESTU: 'raport z testu',
  SYMULACJA: 'symulacja',
  OBLICZENIE: 'obliczenie',
  DEKLARACJA: 'deklaracja',
  POMIAR: 'pomiar',
  OCENA_OPERATORA: 'ocena operatora',
  DOWOD_LACZONY: 'dowód łączony',
  BRAK_METODY: 'brak metody',
};

/** Lustro `backend/src/werdykt/wyjasnienie.py::NAZWA_RODZAJU_PODSTAWY_PL`. */
const NAZWA_RODZAJU_PODSTAWY_PL: Readonly<Record<RodzajPodstawy, string>> = {
  ROZPORZADZENIE_UE: 'rozporządzenie UE',
  NORMA: 'norma',
  PRAWO_KRAJOWE: 'prawo krajowe',
  WOS: 'wymogi ogólnego stosowania (WOS)',
  PROCEDURA_PTPIREE: 'procedura PTPiREE',
  WIPWC: 'WiPWC',
  OSD: 'wymagania operatora systemu dystrybucyjnego',
  KATALOG_PRODUCENTA: 'katalog producenta',
  ZALOZENIE_PROJEKTOWE: 'założenie projektowe',
  NIEUSTALONA: 'warstwa o nieustalonym pochodzeniu',
};

/** Poziom dowodowy ZDOLNOŚCI narzędzia — lustro `werdykt.proweniencja.EvidenceTier.label_pl`. */
const NAZWA_POZIOMU_PL: Readonly<Record<EvidenceTier, string>> = {
  VALIDATED_SIMULATION: 'symulacja zwalidowana',
  TYPE_TEST_CERTIFICATE: 'certyfikat badania typu (wykaz PTPiREE)',
  DECLARATION: 'deklaracja wnioskodawcy',
  UNVALIDATED_MODEL: 'model niezwalidowany',
  NOT_SIMULATED: 'brak symulacji',
};

/** Rodzaj twierdzenia — lustro `werdykt.proweniencja.ClaimKind.label_pl`. */
const NAZWA_TWIERDZENIA_PL: Readonly<Record<ClaimKind, string>> = {
  DYNAMIC_PERFORMANCE: 'zachowanie dynamiczne',
  DECLARED_CONFIGURATION: 'konfiguracja zadeklarowana',
  STATIC_CALCULATION: 'obliczenie statyczne',
};

/** Jakość danej — lustro `werdykt.proweniencja.FieldQuality.label_pl`. */
const NAZWA_JAKOSCI_PL: Readonly<Record<FieldQuality, string>> = {
  DATASHEET: 'karta techniczna',
  ESTIMATED: 'oszacowane',
  SYSTEM_DEFAULT: 'domyślne techniczne',
};

/** Stan źródła podstawy — lustro `werdykt.wyjasnienie.NAZWA_STANU_ZRODLA_PL`. */
const NAZWA_STANU_ZRODLA_PL: Readonly<Record<StanZrodla, string>> = {
  ZWERYFIKOWANE: 'zweryfikowane',
  WSKAZANE: 'wskazane (dokument i jednostka redakcyjna wskazane, treść poza repozytorium)',
  NIEUSTALONE: 'nieustalone',
};

const NAZWA_STANU_DANYCH_PL: Readonly<Record<StanDanych, string>> = {
  ZWALIDOWANE: 'dane zwalidowane',
  UNVALIDATED_INPUT: 'dane przyjęte bez walidacji',
};

/** Nazwa skali marginesu względnego (§2.4) — mianownik zdania „skala: …". */
const NAZWA_SKALI_PL: Readonly<Record<RodzajSkali, string>> = {
  TOLERANCJA: 'tolerancja z profilu',
  LIMIT: 'wartość graniczna',
  NIEPEWNOSC: 'niepewność',
};

/** Postać limitu wg relacji kryterium (opis słowny; nierówność pokazuje `warunek_latex`). */
const NAZWA_RELACJI_PL: Readonly<Record<Relacja, string>> = {
  NIE_WIECEJ: 'górna granica',
  NIE_MNIEJ: 'dolna granica',
  PASMO: 'pasmo dopuszczalne',
  OBWIEDNIA_DOLNA: 'obwiednia dolna',
  OBWIEDNIA_GORNA: 'obwiednia górna',
  LOGICZNE: 'kryterium logiczne',
};

const NAZWA_DZIEDZINY_PL: Readonly<Record<DziedzinaFizyki, string>> = {
  POWER_FLOW: 'rozpływ mocy',
  SHORT_CIRCUIT: 'zwarcia',
  RMS_DYNAMICS: 'dynamika RMS',
  SEQUENCE_DOMAIN: 'składowe symetryczne',
  HARMONIC_FREQUENCY_DOMAIN: 'harmoniczne (dziedzina częstotliwości)',
  SUPRAHARMONIC_FREQUENCY_DOMAIN: 'supraharmoniczne (dziedzina częstotliwości)',
};

/*
 * Trzy słowniki niosące wartość `NIE_DOTYCZY` (kompletność dowodu, status modelu, pokrycie
 * programu) mają nazwy w instrukcji `switch`, nie w literale obiektu: ta sama wartość należy
 * do słownika statusów werdyktu, a literał obiektu z takim kluczem byłby nieodróżnialny od
 * zakazanej mapy „status → etykieta" (kontrakt §12 pkt 3). To są osie DOWODU, nie werdykt.
 */
function nazwaKompletnosci(kompletnosc: KompletnoscDowodu): string {
  switch (kompletnosc) {
    case 'PELNY':
      return 'pełny';
    case 'NIEPELNY':
      return 'niepełny';
    case 'NIE_DOTYCZY':
      return 'nie dotyczy';
  }
}

function nazwaStatusuModelu(status: StatusModelu): string {
  switch (status) {
    case 'UNVALIDATED_MODEL':
      return 'model urządzenia niezwalidowany';
    case 'VALIDATED_AGAINST_TEST':
      return 'model urządzenia zwalidowany wynikiem testu';
    case 'CERTIFIED_MODEL':
      return 'model urządzenia certyfikowany';
    case 'NIE_DOTYCZY':
      return 'nie dotyczy (bez modelu urządzenia)';
  }
}

function nazwaPokrycia(pokrycie: PokrycieProgramu): string {
  switch (pokrycie) {
    case 'PELNE':
      return 'pełne';
    case 'CZESCIOWE':
      return 'częściowe';
    case 'NIE_DOTYCZY':
      return 'nie dotyczy';
  }
}

// ---------------------------------------------------------------------------
// Teksty interfejsu (polski język techniczny, bez skrótów)
// ---------------------------------------------------------------------------

const TEKSTY = {
  ocena: 'Ocena',
  przedmiot: 'Przedmiot',
  element: 'element modelu',
  stosowalnosc: 'Stosowalność',
  kryterium: 'Kryterium',
  warunekWstepny: 'Warunek wstępny',
  podstawaWarunkuWstepnego: 'Podstawa warunku wstępnego',
  wynik: 'Wynik',
  limit: 'Limit',
  margines: 'Margines',
  niepewnosc: 'Niepewność',
  wyjasnienie: 'Wyjaśnienie',
  przyczyna: 'Przyczyna',
  czegoBrakuje: 'Czego brakuje',
  zastrzezenia: 'Zastrzeżenia',
  podstawaKryterium: 'Podstawa kryterium',
  podstawaWymagania: 'Podstawa wymagania',
  podstawaLimitu: 'Podstawa limitu',
  podstawaStosowalnosci: 'Podstawa stosowalności',
  dowod: 'Dowód',
  kompletnosc: 'Kompletność dowodu',
  powodyNiepelnosci: 'Powody niepełności',
  zakres: 'Zakres ważności',
  slad: 'Ślad obliczeń',
  sposobWykazania: 'Sposób wykazania',
  podstawaSposobu: 'Podstawa reguły sposobu wykazania',
  sposobBezReguly: 'bez osobnej reguły właściwości sposobu wykazania',
  pokrycie: 'Pokrycie programu badań',
  kryteriaNaruszone: 'Kryteria naruszone',
  najblizejGranicy: 'Kryterium najbliżej granicy',
  ocenySkladowe: 'Oceny składowe',
  rozwin: 'Rozwiń',
  zwin: 'Zwiń',
  // Wartości pól
  dotyczy: 'dotyczy',
  nieDotyczy: 'nie dotyczy',
  nieWyznaczono: 'nie wyznaczono',
  nieWskazano: 'nie wskazano',
  brak: 'brak',
  marginesBrak: 'nie wyznaczono (brak wyniku albo limitu)',
  marginesNiedefiniowalny: 'niedefiniowalny',
  marginesWzgledny: 'margines względny (odniesiony do skali)',
  marginesWzglednyBrak: 'margines względny: brak skali',
  skala: 'skala',
  punkt: 'punkt',
  definicja: 'definicja',
  metoda: 'metoda',
  metodaOszacowania: 'metoda oszacowania',
  chwila: 'chwila punktu krytycznego',
  punktKrytyczny: 'punkt krytyczny',
  wartoscLogiczna: 'wartość logiczna',
  limitLogiczny: 'kryterium logiczne — bez limitu skalarnego; podstawę podaje pole „Podstawa kryterium”',
  limitBrak: 'brak limitu i jego podstawy',
  pasmoOd: 'od',
  pasmoDo: 'do',
  obwiedniaChwila: 'chwila t [s]',
  obwiedniaWartosc: 'wartość obwiedni',
  zakresStosowalnosciLimitu: 'zakres stosowalności',
  wersjaProfilu: 'wersja profilu',
  dokument: 'dokument',
  wydanie: 'wydanie',
  jednostkaRedakcyjna: 'jednostka redakcyjna',
  rodzajPodstawy: 'rodzaj',
  stanZrodla: 'stan źródła',
  uwagi: 'uwagi',
  typModulu: 'typ modułu',
  technologia: 'technologia',
  modulIstniejacy: 'moduł istniejący (art. 4 rozporządzenia 2016/631)',
  modulNowy: 'moduł nowy (art. 4 rozporządzenia 2016/631)',
  modulNieustalony: 'nie ustalono, czy moduł jest nowy, czy istniejący (art. 4 rozporządzenia 2016/631)',
  warunekNieuruchomiony: 'warunek wstępny kryterium nie wystąpił w scenariuszu',
  metodaDowodu: 'metoda',
  poziom: 'poziom zdolności narzędzia',
  twierdzenie: 'rodzaj twierdzenia',
  statusModelu: 'walidacja modelu urządzenia',
  statusDanych: 'stan danych wejściowych',
  danePrzyjete: 'dane przyjęte',
  odniesienie: 'odniesienie do dowodu',
  domenaWalidacji: 'domena walidacji silnika',
  wDomenie: 'bieg w zadeklarowanej domenie walidacji',
  pozaDomena: 'bieg poza zadeklarowaną domeną walidacji',
  domenaNieokreslona: 'nie określono — dowód bez biegu albo bez zadeklarowanej domeny',
  bezWartosci: 'bez wartości liczbowej',
  jakoscDanej: 'jakość danej',
  opisZakresu: 'opis zakresu',
  rodzajAnalizy: 'rodzaj analizy',
  modelUrzadzenia: 'model urządzenia',
  symetria: 'symetria zakłócenia',
  parametrySieci: 'parametry sieci',
  regulator: 'regulator',
  ograniczniki: 'ograniczniki aktywne',
  wykluczenia: 'wykluczenia (wynik ich nie obejmuje)',
  identyfikatorBiegu: 'identyfikator biegu',
  wersjaSilnika: 'wersja silnika',
  identyfikatorKryterium: 'identyfikator kryterium',
  identyfikatorWymagania: 'identyfikator wymagania',
  identyfikatorKroku: 'identyfikator kroku śladu',
  kodPoziomu: 'kod poziomu zdolności narzędzia',
  kodWalidacjiModelu: 'kod walidacji modelu urządzenia',
  kodStanuDanych: 'kod stanu danych wejściowych',
  kodStanuZrodla: 'kod stanu źródła podstawy',
  brakSladu: 'rekord nie niesie odnośników śladu',
  najblizejBrak: 'nie wskazano — powód podaje pole „Przyczyna” w wyjaśnieniu',
  naruszoneBrak: 'brak',
  skladoweBrak:
    'wymaganie nie ma ocen składowych — powód (nie dotyczy albo brak metody wykazania) podaje wyjaśnienie',
} as const;

// ---------------------------------------------------------------------------
// Formatowanie liczb — wyłącznie zapis, zero przeliczeń i progów
// ---------------------------------------------------------------------------

/** Liczba po polsku, najwyżej 4 cyfry znaczące, bez separatora tysięcy (jak zdania backendu). */
function liczba(wartosc: number): string {
  return wartosc.toLocaleString('pl-PL', { maximumSignificantDigits: 4, useGrouping: false });
}

/** Liczba ze znakiem (margines): „+2", „−2", „0". */
function liczbaZeZnakiem(wartosc: number): string {
  return wartosc.toLocaleString('pl-PL', {
    maximumSignificantDigits: 4,
    useGrouping: false,
    signDisplay: 'exceptZero',
  });
}

/** Wielkość z jednostką; jednostka bezwymiarowa „1" nie jest dopisywana (jak w backendzie). */
function wielkosc(w: Wielkosc, zeZnakiem = false): string {
  const tekst = zeZnakiem ? liczbaZeZnakiem(w.wartosc) : liczba(w.wartosc);
  return w.jednostka === '1' ? tekst : `${tekst} ${w.jednostka}`;
}

// ---------------------------------------------------------------------------
// Klocki prezentacji
// ---------------------------------------------------------------------------

function Pole({
  etykieta,
  testId,
  children,
}: {
  readonly etykieta: string;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="mvd-werdykt-pole" data-testid={testId}>
      <dt className="mvd-werdykt-pole-etykieta">{etykieta}</dt>
      <dd className="mvd-werdykt-pole-tresc">{children}</dd>
    </div>
  );
}

/** Para „nazwa: wartość" wewnątrz treści pola. */
function Para({ nazwa, children }: { readonly nazwa: string; readonly children: ReactNode }) {
  return (
    <span className="mvd-werdykt-para">
      <span className="mvd-werdykt-para-nazwa">{nazwa}:</span> {children}
    </span>
  );
}

/** Kod maszynowy osi dowodu obok nazwy PL (ten sam zapis, którego używa dokument formalny). */
function ListaTekstow({
  pozycje,
  testId,
}: {
  readonly pozycje: readonly string[];
  readonly testId: string;
}) {
  return (
    <ul className="mvd-werdykt-lista" data-testid={testId}>
      {pozycje.map((pozycja, indeks) => (
        <li key={`${indeks}-${pozycja}`}>{pozycja}</li>
      ))}
    </ul>
  );
}

function SekcjaRozwijana({
  tytul,
  domyslnieZwinieta,
  testId,
  children,
}: {
  readonly tytul: string;
  readonly domyslnieZwinieta: boolean;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  const [otwarta, setOtwarta] = useState(!domyslnieZwinieta);
  const idTresci = useId();
  return (
    <section className="mvd-werdykt-rozwijana">
      <button
        type="button"
        className="mvd-werdykt-rozwijana-przycisk"
        aria-expanded={otwarta}
        aria-controls={otwarta ? idTresci : undefined}
        data-testid={`${testId}-przelacz`}
        onClick={() => setOtwarta((stan) => !stan)}
      >
        <span className="mvd-werdykt-rozwijana-tytul">{tytul}</span>
        <span className="mvd-werdykt-rozwijana-zwijak">{otwarta ? TEKSTY.zwin : TEKSTY.rozwin}</span>
      </button>
      {otwarta && (
        <div id={idTresci} className="mvd-werdykt-rozwijana-tresc" data-testid={testId}>
          {children}
        </div>
      )}
    </section>
  );
}

function PodstawaSzczegoly({
  podstawa,
  testId,
}: {
  readonly podstawa: PodstawaWymagania;
  readonly testId: string;
}) {
  return (
    <span className="mvd-werdykt-podstawa" data-testid={testId} data-stan-zrodla={podstawa.status}>
      <Para nazwa={TEKSTY.dokument}>„{podstawa.dokument}”</Para>
      <Para nazwa={TEKSTY.wydanie}>{podstawa.wydanie ?? TEKSTY.nieWskazano}</Para>
      <Para nazwa={TEKSTY.jednostkaRedakcyjna}>
        {podstawa.jednostka_redakcyjna ?? TEKSTY.nieWskazano}
      </Para>
      <Para nazwa={TEKSTY.rodzajPodstawy}>{NAZWA_RODZAJU_PODSTAWY_PL[podstawa.rodzaj]}</Para>
      <Para nazwa={TEKSTY.stanZrodla}>
        <span className="mvd-werdykt-stan-zrodla">{NAZWA_STANU_ZRODLA_PL[podstawa.status]}</span>
      </Para>
      {podstawa.uwagi_pl !== null && <Para nazwa={TEKSTY.uwagi}>{podstawa.uwagi_pl}</Para>}
    </span>
  );
}

function ListaDanych({
  dane,
  testId,
}: {
  readonly dane: readonly DanaPrzyjeta[];
  readonly testId: string;
}) {
  return (
    <ul className="mvd-werdykt-lista" data-testid={testId}>
      {dane.map((dana, indeks) => (
        <li key={`${indeks}-${dana.nazwa_pl}`}>
          {dana.nazwa_pl}:{' '}
          {dana.wartosc === null ? (
            TEKSTY.bezWartosci
          ) : (
            <span className="mvd-num">{wielkosc(dana.wartosc)}</span>
          )}
          {dana.jakosc !== null && (
            <>
              {' · '}
              {TEKSTY.jakoscDanej}: {NAZWA_JAKOSCI_PL[dana.jakosc]}
            </>
          )}
          {' — '}
          {dana.powod_pl}
        </li>
      ))}
    </ul>
  );
}

function TrescStosowalnosci({
  stosowalnosc,
  testId,
}: {
  readonly stosowalnosc: Stosowalnosc;
  readonly testId: string;
}) {
  const statusModulu =
    stosowalnosc.modul_istniejacy === null
      ? stosowalnosc.typ_modulu !== null
        ? TEKSTY.modulNieustalony
        : null
      : stosowalnosc.modul_istniejacy
        ? TEKSTY.modulIstniejacy
        : TEKSTY.modulNowy;
  return (
    <>
      <span className="mvd-werdykt-akapit">
        <strong>{stosowalnosc.dotyczy ? TEKSTY.dotyczy : TEKSTY.nieDotyczy}</strong>:{' '}
        {stosowalnosc.powod_pl}
      </span>
      {stosowalnosc.typ_modulu !== null && (
        <Para nazwa={TEKSTY.typModulu}>{stosowalnosc.typ_modulu}</Para>
      )}
      {stosowalnosc.technologia !== null && (
        <Para nazwa={TEKSTY.technologia}>{stosowalnosc.technologia}</Para>
      )}
      {statusModulu !== null && <span className="mvd-werdykt-para">{statusModulu}</span>}
      {stosowalnosc.warunek_wstepny_nieuruchomiony && (
        <span className="mvd-werdykt-para">{TEKSTY.warunekNieuruchomiony}</span>
      )}
      {stosowalnosc.podstawa !== null && (
        <span className="mvd-werdykt-akapit">
          <span className="mvd-werdykt-para-nazwa">{TEKSTY.podstawaStosowalnosci}:</span>{' '}
          <PodstawaSzczegoly podstawa={stosowalnosc.podstawa} testId={`${testId}-podstawa`} />
        </span>
      )}
    </>
  );
}

function TrescWyniku({
  wynik,
  relacja,
}: {
  readonly wynik: WynikKryterium | null;
  readonly relacja: Relacja;
}) {
  if (wynik === null) return <>{TEKSTY.nieWyznaczono}</>;
  return (
    <>
      <span className="mvd-werdykt-akapit">
        {wynik.wielkosc_pl}
        {wynik.symbol_latex.trim() !== '' && (
          <>
            {' '}
            <MathInline latex={wynik.symbol_latex} />
          </>
        )}
        {': '}
        {relacja === 'LOGICZNE' ? (
          <>
            {wynik.punkt_krytyczny_pl} ({TEKSTY.wartoscLogiczna}{' '}
            <span className="mvd-num">{wielkosc(wynik.wartosc)}</span>)
          </>
        ) : (
          <strong className="mvd-num">{wielkosc(wynik.wartosc)}</strong>
        )}
      </span>
      {relacja !== 'LOGICZNE' && wynik.punkt_krytyczny_pl !== null && (
        <Para nazwa={TEKSTY.punktKrytyczny}>{wynik.punkt_krytyczny_pl}</Para>
      )}
      {wynik.chwila_s !== null && (
        <Para nazwa={TEKSTY.chwila}>
          <span className="mvd-num">{liczba(wynik.chwila_s)} s</span>
        </Para>
      )}
      <Para nazwa={TEKSTY.metoda}>{NAZWA_METODY_PL[wynik.metoda]}</Para>
    </>
  );
}

function TrescLimitu({
  limit,
  relacja,
  testId,
}: {
  readonly limit: LimitKryterium | null;
  readonly relacja: Relacja;
  readonly testId: string;
}) {
  if (relacja === 'LOGICZNE') return <>{TEKSTY.limitLogiczny}</>;
  if (limit === null) return <>{TEKSTY.limitBrak}</>;
  return (
    <>
      <span className="mvd-werdykt-akapit">
        {NAZWA_RELACJI_PL[relacja]}:{' '}
        {limit.wartosc !== null && <strong className="mvd-num">{wielkosc(limit.wartosc)}</strong>}
        {limit.pasmo !== null && (
          <strong className="mvd-num">
            {TEKSTY.pasmoOd} {wielkosc(limit.pasmo[0])} {TEKSTY.pasmoDo} {wielkosc(limit.pasmo[1])}
          </strong>
        )}
      </span>
      {limit.obwiednia !== null && (
        <table className="mvd-werdykt-obwiednia" data-testid={`${testId}-obwiednia`}>
          <thead>
            <tr>
              <th scope="col">{TEKSTY.obwiedniaChwila}</th>
              <th scope="col">
                {TEKSTY.obwiedniaWartosc} [{limit.jednostka_obwiedni}]
              </th>
            </tr>
          </thead>
          <tbody>
            {limit.obwiednia.map((punkt) => (
              <tr key={punkt.t_s}>
                <td className="mvd-num">{liczba(punkt.t_s)}</td>
                <td className="mvd-num">{liczba(punkt.wartosc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <span className="mvd-werdykt-akapit">
        <span className="mvd-werdykt-para-nazwa">{TEKSTY.podstawaLimitu}:</span>{' '}
        <PodstawaSzczegoly podstawa={limit.podstawa} testId={`${testId}-podstawa`} />
      </span>
      {limit.zakres_stosowalnosci_pl !== null && (
        <Para nazwa={TEKSTY.zakresStosowalnosciLimitu}>{limit.zakres_stosowalnosci_pl}</Para>
      )}
      {limit.wersja_profilu !== null && (
        <Para nazwa={TEKSTY.wersjaProfilu}>{limit.wersja_profilu}</Para>
      )}
    </>
  );
}

function TrescMarginesu({ margines }: { readonly margines: Margines | null }) {
  if (margines === null) return <>{TEKSTY.marginesBrak}</>;
  if (margines.wartosc === null) {
    return (
      <>
        <span className="mvd-werdykt-akapit">
          {TEKSTY.marginesNiedefiniowalny} — {margines.powod_pl}
        </span>
        {margines.punkt_pl !== null && <Para nazwa={TEKSTY.punkt}>{margines.punkt_pl}</Para>}
      </>
    );
  }
  return (
    <>
      <strong className="mvd-num mvd-werdykt-akapit">{wielkosc(margines.wartosc, true)}</strong>
      {margines.definicja_latex !== null && (
        <Para nazwa={TEKSTY.definicja}>
          <MathInline latex={margines.definicja_latex} />
        </Para>
      )}
      {margines.punkt_pl !== null && <Para nazwa={TEKSTY.punkt}>{margines.punkt_pl}</Para>}
      {margines.skala !== null && margines.skala_rodzaj !== null && margines.wzgledny !== null ? (
        <>
          <Para nazwa={TEKSTY.skala}>
            <span className="mvd-num">{wielkosc(margines.skala)}</span> (
            {NAZWA_SKALI_PL[margines.skala_rodzaj]})
          </Para>
          <Para nazwa={TEKSTY.marginesWzgledny}>
            <span className="mvd-num">{liczbaZeZnakiem(margines.wzgledny)}</span>
          </Para>
        </>
      ) : (
        <span className="mvd-werdykt-para">{TEKSTY.marginesWzglednyBrak}</span>
      )}
    </>
  );
}

function TrescNiepewnosci({ niepewnosc }: { readonly niepewnosc: Niepewnosc }) {
  if (niepewnosc.wartosc !== null) {
    return (
      <>
        <strong className="mvd-num">±{wielkosc(niepewnosc.wartosc)}</strong>
        {niepewnosc.metoda_pl !== null && (
          <Para nazwa={TEKSTY.metodaOszacowania}>{niepewnosc.metoda_pl}</Para>
        )}
      </>
    );
  }
  return (
    <>
      {TEKSTY.nieDotyczy} — {niepewnosc.powod_pl}
    </>
  );
}

function TrescWyjasnienia({
  wyjasnienie,
  testId,
}: {
  readonly wyjasnienie: WyjasnienieWerdyktu;
  readonly testId: string;
}) {
  return (
    <>
      {/* Zdanie ZAWSZE widoczne, bez rozwijania i bez dymka (§9) — dosłownie z rekordu. */}
      <p className="mvd-werdykt-zdanie" data-testid={`${testId}-zdanie`}>
        {wyjasnienie.zdanie_pl}
      </p>
      {wyjasnienie.przyczyna_pl !== null && (
        <p className="mvd-werdykt-akapit" data-testid={`${testId}-przyczyna`}>
          <span className="mvd-werdykt-para-nazwa">{TEKSTY.przyczyna}:</span>{' '}
          {wyjasnienie.przyczyna_pl}
        </p>
      )}
      {wyjasnienie.czego_brakuje.length > 0 && (
        <div className="mvd-werdykt-podsekcja">
          <span className="mvd-werdykt-para-nazwa">{TEKSTY.czegoBrakuje}:</span>
          <ListaTekstow pozycje={wyjasnienie.czego_brakuje} testId={`${testId}-czego-brakuje`} />
        </div>
      )}
      {wyjasnienie.zastrzezenia.length > 0 && (
        <div className="mvd-werdykt-podsekcja">
          <span className="mvd-werdykt-para-nazwa">{TEKSTY.zastrzezenia}:</span>
          <ListaTekstow pozycje={wyjasnienie.zastrzezenia} testId={`${testId}-zastrzezenia`} />
        </div>
      )}
    </>
  );
}

function TrescDowodu({ dowod, testId }: { readonly dowod: StatusDowodu; readonly testId: string }) {
  return (
    <>
      <Para nazwa={TEKSTY.metodaDowodu}>{NAZWA_METODY_PL[dowod.metoda]}</Para>
      <Para nazwa={TEKSTY.poziom}>
        {NAZWA_POZIOMU_PL[dowod.poziom]}
      </Para>
      <Para nazwa={TEKSTY.twierdzenie}>{NAZWA_TWIERDZENIA_PL[dowod.rodzaj_twierdzenia]}</Para>
      <Para nazwa={TEKSTY.statusModelu}>
        {nazwaStatusuModelu(dowod.status_modelu)}
      </Para>
      <Para nazwa={TEKSTY.statusDanych}>
        {NAZWA_STANU_DANYCH_PL[dowod.status_danych.stan]}
      </Para>
      {dowod.status_danych.dane_przyjete.length > 0 && (
        <div className="mvd-werdykt-podsekcja">
          <span className="mvd-werdykt-para-nazwa">{TEKSTY.danePrzyjete}:</span>
          <ListaDanych dane={dowod.status_danych.dane_przyjete} testId={`${testId}-dane-przyjete`} />
        </div>
      )}
      <Para nazwa={TEKSTY.domenaWalidacji}>
        {dowod.w_domenie_walidacji === null
          ? TEKSTY.domenaNieokreslona
          : dowod.w_domenie_walidacji
            ? TEKSTY.wDomenie
            : TEKSTY.pozaDomena}
        {dowod.domena_pl !== null && <> — {dowod.domena_pl}</>}
      </Para>
      {/* Karta #145: odniesienie do dowodu (bieg z odciskiem, rekord wykazu, identyfikator
          raportu) jest metadaną — wyłącznie w „Informacjach audytowych" karty. */}
    </>
  );
}

function TrescKompletnosci({
  kompletnosc,
  powody,
  testId,
}: {
  readonly kompletnosc: KompletnoscDowodu;
  readonly powody: readonly string[];
  readonly testId: string;
}) {
  return (
    <>
      <span className="mvd-werdykt-akapit">
        {nazwaKompletnosci(kompletnosc)}
      </span>
      {powody.length > 0 && (
        <div className="mvd-werdykt-podsekcja">
          <span className="mvd-werdykt-para-nazwa">{TEKSTY.powodyNiepelnosci}:</span>
          <ListaTekstow pozycje={powody} testId={`${testId}-powody`} />
        </div>
      )}
    </>
  );
}

function TrescZakresu({
  zakres,
  testId,
}: {
  readonly zakres: ZakresWaznosci;
  readonly testId: string;
}) {
  return (
    <dl className="mvd-werdykt-pola mvd-werdykt-pola-wewnetrzne">
      <div className="mvd-werdykt-pole">
        <dt className="mvd-werdykt-pole-etykieta">{TEKSTY.opisZakresu}</dt>
        <dd className="mvd-werdykt-pole-tresc">{zakres.opis_pl}</dd>
      </div>
      {zakres.rodzaj_analizy !== null && (
        <div className="mvd-werdykt-pole">
          <dt className="mvd-werdykt-pole-etykieta">{TEKSTY.rodzajAnalizy}</dt>
          <dd className="mvd-werdykt-pole-tresc">
            {NAZWA_DZIEDZINY_PL[zakres.rodzaj_analizy]}
          </dd>
        </div>
      )}
      {(
        [
          [TEKSTY.technologia, zakres.technologia],
          [TEKSTY.modelUrzadzenia, zakres.model_urzadzenia],
          [TEKSTY.symetria, zakres.symetria_zaklocenia],
          [TEKSTY.regulator, zakres.regulator],
        ] as const
      ).map(([nazwa, wartosc]) =>
        wartosc === null ? null : (
          <div className="mvd-werdykt-pole" key={nazwa}>
            <dt className="mvd-werdykt-pole-etykieta">{nazwa}</dt>
            <dd className="mvd-werdykt-pole-tresc">{wartosc}</dd>
          </div>
        ),
      )}
      {zakres.parametry_sieci.length > 0 && (
        <div className="mvd-werdykt-pole">
          <dt className="mvd-werdykt-pole-etykieta">{TEKSTY.parametrySieci}</dt>
          <dd className="mvd-werdykt-pole-tresc">
            <ListaDanych dane={zakres.parametry_sieci} testId={`${testId}-parametry-sieci`} />
          </dd>
        </div>
      )}
      {zakres.ograniczniki.length > 0 && (
        <div className="mvd-werdykt-pole">
          <dt className="mvd-werdykt-pole-etykieta">{TEKSTY.ograniczniki}</dt>
          <dd className="mvd-werdykt-pole-tresc">
            <ListaTekstow pozycje={zakres.ograniczniki} testId={`${testId}-ograniczniki`} />
          </dd>
        </div>
      )}
      {zakres.wykluczenia.length > 0 && (
        <div className="mvd-werdykt-pole">
          <dt className="mvd-werdykt-pole-etykieta">{TEKSTY.wykluczenia}</dt>
          <dd className="mvd-werdykt-pole-tresc">
            <ListaTekstow pozycje={zakres.wykluczenia} testId={`${testId}-wykluczenia`} />
          </dd>
        </div>
      )}
    </dl>
  );
}

function TrescSladu({ slad }: { readonly slad: readonly OdnosnikSladu[] }) {
  if (slad.length === 0) return <p className="mvd-werdykt-akapit">{TEKSTY.brakSladu}</p>;
  return (
    <ol className="mvd-werdykt-lista mvd-werdykt-slad">
      {slad.map((odnosnik, indeks) => (
        // Karta #145: identyfikator kroku (`lom:<ref>:81R`, `proof:…`) jest metadaną —
        // pierwszy plan niesie opis kroku, identyfikator trafia do „Informacji audytowych".
        // Opis kroku silnika prób NC RfG składany z danych odnośnika (klucz kroku → nazwa).
        <li key={`${indeks}-${odnosnik.krok}`}>{opisOdnosnikaSladu(odnosnik)}</li>
      ))}
    </ol>
  );
}

/**
 * Surowe identyfikatory rekordu (identyfikator kryterium/wymagania, referencja elementu, kody
 * osi dowodu, identyfikatory biegów i wersje silnika ze śladu) — materiał audytowy, poza
 * pierwszym planem karty: wspólna sekcja `InformacjeAudytowe` (zwinięta). Pierwszy plan niesie
 * wyłącznie nazwy polskie tych samych wartości.
 */
function wierszeAudytoweRekordu(rekord: RekordWerdyktu): WierszInformacjiAudytowych[] {
  const wymaganie = jestWynikiemWymagania(rekord);
  const wiersze: WierszInformacjiAudytowych[] = [
    wymaganie
      ? { etykieta: TEKSTY.identyfikatorWymagania, wartosc: rekord.wymaganie_id }
      : { etykieta: TEKSTY.identyfikatorKryterium, wartosc: rekord.kryterium_id },
  ];
  if (!wymaganie && rekord.przedmiot.element_ref !== null) {
    wiersze.push({ etykieta: TEKSTY.element, wartosc: rekord.przedmiot.element_ref });
  }
  wiersze.push(
    { etykieta: TEKSTY.kodStanuZrodla, wartosc: rekord.podstawa.status },
    { etykieta: TEKSTY.kodPoziomu, wartosc: rekord.dowod.poziom },
    { etykieta: TEKSTY.kodWalidacjiModelu, wartosc: rekord.dowod.status_modelu },
    { etykieta: TEKSTY.kodStanuDanych, wartosc: rekord.dowod.status_danych.stan },
  );
  if (rekord.dowod.odniesienie !== null) {
    wiersze.push({ etykieta: TEKSTY.odniesienie, wartosc: rekord.dowod.odniesienie });
  }
  rekord.slad.forEach((odnosnik, indeks) => {
    wiersze.push({
      etykieta: `${TEKSTY.identyfikatorKroku} (${indeks + 1})`,
      wartosc: odnosnik.krok,
    });
    if (odnosnik.run_id !== null) {
      wiersze.push({
        etykieta: `${TEKSTY.identyfikatorBiegu} (${indeks + 1}. ${odnosnik.krok})`,
        wartosc: odnosnik.run_id,
      });
    }
    if (odnosnik.wersja_silnika !== null) {
      wiersze.push({
        etykieta: `${TEKSTY.wersjaSilnika} (${indeks + 1}. ${odnosnik.krok})`,
        wartosc: odnosnik.wersja_silnika,
      });
    }
  });
  return wiersze;
}

/** Nazwa oceny składowej — lustro `backend/src/werdykt/wyjasnienie.py::nazwa_skladowej`. */
function nazwaSkladowej(ocena: OcenaKryterium): string {
  return `${ocena.kryterium.opis_pl} (${ocena.przedmiot.nazwa_pl})`;
}

/** Nazwa składnika po identyfikatorze; identyfikator bez składnika zostaje pokazany wprost. */
function nazwaSkladowejPoId(rekord: WynikWymagania, kryteriumId: string): string {
  const ocena = rekord.oceny_skladowe.find((o) => o.kryterium_id === kryteriumId);
  return ocena === undefined ? kryteriumId : nazwaSkladowej(ocena);
}

// ---------------------------------------------------------------------------
// Karta
// ---------------------------------------------------------------------------

export interface KartaWerdyktuProps {
  /** PEŁNY rekord z backendu (poziom K albo W) — karta nie przyjmuje samego statusu. */
  readonly rekord: RekordWerdyktu;
  /** Stan początkowy sekcji rozwijanych (zakres ważności, ślad); domyślnie zwinięte. */
  readonly zwiniete?: boolean;
  /** Nagłówek nadrzędny nad tytułem rekordu (np. nazwa grupy prezentacyjnej wymagań). */
  readonly naglowek?: string;
}

function PolaKryterium({
  rekord,
  testId,
}: {
  readonly rekord: OcenaKryterium;
  readonly testId: string;
}) {
  const relacja = rekord.kryterium.relacja;
  return (
    <>
      <Pole etykieta={TEKSTY.stosowalnosc} testId={`${testId}-stosowalnosc`}>
        <TrescStosowalnosci stosowalnosc={rekord.stosowalnosc} testId={`${testId}-stosowalnosc`} />
      </Pole>
      <Pole etykieta={TEKSTY.kryterium} testId={`${testId}-kryterium`}>
        <span className="mvd-werdykt-akapit">{rekord.kryterium.opis_pl}</span>
        {rekord.kryterium.warunek_latex.trim() !== '' && (
          <span className="mvd-werdykt-akapit mvd-werdykt-warunek">
            <MathInline latex={rekord.kryterium.warunek_latex} />
          </span>
        )}
        <span className="mvd-werdykt-para">{NAZWA_RELACJI_PL[relacja]}</span>
        {rekord.kryterium.warunek_wstepny_pl !== null && (
          <Para nazwa={TEKSTY.warunekWstepny}>{rekord.kryterium.warunek_wstepny_pl}</Para>
        )}
        {rekord.kryterium.warunek_wstepny_podstawa !== null && (
          <span className="mvd-werdykt-akapit">
            <span className="mvd-werdykt-para-nazwa">{TEKSTY.podstawaWarunkuWstepnego}:</span>{' '}
            <PodstawaSzczegoly
              podstawa={rekord.kryterium.warunek_wstepny_podstawa}
              testId={`${testId}-warunek-wstepny-podstawa`}
            />
          </span>
        )}
      </Pole>
      <Pole etykieta={TEKSTY.wynik} testId={`${testId}-wynik`}>
        <TrescWyniku wynik={rekord.wynik} relacja={relacja} />
      </Pole>
      <Pole etykieta={TEKSTY.limit} testId={`${testId}-limit`}>
        <TrescLimitu limit={rekord.limit} relacja={relacja} testId={`${testId}-limit`} />
      </Pole>
      <Pole etykieta={TEKSTY.margines} testId={`${testId}-margines`}>
        <TrescMarginesu margines={rekord.margines} />
      </Pole>
      <Pole etykieta={TEKSTY.niepewnosc} testId={`${testId}-niepewnosc`}>
        <TrescNiepewnosci niepewnosc={rekord.niepewnosc} />
      </Pole>
    </>
  );
}

function PolaWymagania({
  rekord,
  testId,
}: {
  readonly rekord: WynikWymagania;
  readonly testId: string;
}) {
  return (
    <>
      <Pole etykieta={TEKSTY.stosowalnosc} testId={`${testId}-stosowalnosc`}>
        <TrescStosowalnosci stosowalnosc={rekord.stosowalnosc} testId={`${testId}-stosowalnosc`} />
      </Pole>
      <Pole etykieta={TEKSTY.sposobWykazania} testId={`${testId}-sposob-wykazania`}>
        <span className="mvd-werdykt-akapit">{NAZWA_METODY_PL[rekord.sposob_wykazania]}</span>
        {rekord.podstawa_sposobu_wykazania === null ? (
          <span className="mvd-werdykt-para">{TEKSTY.sposobBezReguly}</span>
        ) : (
          <span className="mvd-werdykt-akapit">
            <span className="mvd-werdykt-para-nazwa">{TEKSTY.podstawaSposobu}:</span>{' '}
            <PodstawaSzczegoly
              podstawa={rekord.podstawa_sposobu_wykazania}
              testId={`${testId}-sposob-wykazania-podstawa`}
            />
          </span>
        )}
      </Pole>
      <Pole etykieta={TEKSTY.pokrycie} testId={`${testId}-pokrycie`}>
        <span className="mvd-werdykt-akapit">
          {nazwaPokrycia(rekord.pokrycie_programu)}
        </span>
        <span className="mvd-werdykt-akapit">{rekord.pokrycie_programu_pl}</span>
      </Pole>
      <Pole etykieta={TEKSTY.kryteriaNaruszone} testId={`${testId}-naruszone`}>
        {rekord.kryteria_naruszone.length === 0 ? (
          TEKSTY.naruszoneBrak
        ) : (
          <ListaTekstow
            pozycje={rekord.kryteria_naruszone.map((id) => nazwaSkladowejPoId(rekord, id))}
            testId={`${testId}-naruszone-lista`}
          />
        )}
      </Pole>
      <Pole etykieta={TEKSTY.najblizejGranicy} testId={`${testId}-najblizej`}>
        {rekord.kryterium_najblizej_granicy === null
          ? TEKSTY.najblizejBrak
          : nazwaSkladowejPoId(rekord, rekord.kryterium_najblizej_granicy)}
      </Pole>
    </>
  );
}

function KartaWerdyktuRekordu({
  rekord,
  zwiniete,
  naglowek,
  zagniezdzona,
}: {
  readonly rekord: RekordWerdyktu;
  readonly zwiniete: boolean;
  readonly naglowek: string | undefined;
  readonly zagniezdzona: boolean;
}) {
  const idTytulu = useId();
  const nazwaObiektu = useNazwaObiektu();
  const wymaganie = jestWynikiemWymagania(rekord);
  const identyfikator = wymaganie ? rekord.wymaganie_id : rekord.kryterium_id;
  const poziom: PoziomRekordu = wymaganie ? 'W' : 'K';
  const testId = `mvd-werdykt-${identyfikator}`;
  const styl: StylKarty = { '--mvd-werdykt-kolor': SEMANTYKA_KOLOR[rekord.etykieta.semantyka] };
  // Poziom nagłówka: karta główna h3, „Oceny składowe" h4, karta zagnieżdżona h5.
  const Tytul = zagniezdzona ? 'h5' : 'h3';
  return (
    <article
      className={`mvd-werdykt${zagniezdzona ? ' mvd-werdykt-zagniezdzona' : ''}`}
      style={styl}
      aria-labelledby={idTytulu}
      data-testid={testId}
      data-poziom={poziom}
      data-semantyka={rekord.etykieta.semantyka}
    >
      <header className="mvd-werdykt-naglowek">
        {naglowek !== undefined && <p className="mvd-werdykt-nadtytul">{naglowek}</p>}
        <Tytul id={idTytulu} className="mvd-werdykt-tytul">
          {wymaganie ? rekord.nazwa_pl : rekord.kryterium.opis_pl}
        </Tytul>
        {!wymaganie && (
          <p className="mvd-werdykt-meta">
            {/* Karta #145: nazwa elementu z modelu (JEDEN most identyfikator → nazwa);
                rekord bez elementu (agregat) niesie własną nazwę przedmiotu. */}
            {TEKSTY.przedmiot}:{' '}
            {rekord.przedmiot.element_ref !== null
              ? nazwaObiektu(rekord.przedmiot.element_ref, rekord.przedmiot.nazwa_pl)
              : rekord.przedmiot.nazwa_pl}{' '}
            — {rekord.przedmiot.opis_pl}
          </p>
        )}
      </header>
      <dl className="mvd-werdykt-pola">
        <Pole etykieta={TEKSTY.ocena} testId={`${testId}-ocena`}>
          {/* Etykieta Z REKORDU (backend `werdykt/etykiety.py`); kolor wyłącznie z semantyki. */}
          <span className="mvd-werdykt-ocena" data-testid={`${testId}-etykieta`}>
            {rekord.etykieta.etykieta_pl}
          </span>
        </Pole>
        {wymaganie ? (
          <PolaWymagania rekord={rekord} testId={testId} />
        ) : (
          <PolaKryterium rekord={rekord} testId={testId} />
        )}
        <Pole etykieta={TEKSTY.wyjasnienie} testId={`${testId}-wyjasnienie`}>
          <TrescWyjasnienia wyjasnienie={rekord.wyjasnienie} testId={testId} />
        </Pole>
        <Pole
          etykieta={wymaganie ? TEKSTY.podstawaWymagania : TEKSTY.podstawaKryterium}
          testId={`${testId}-podstawa`}
        >
          <PodstawaSzczegoly podstawa={rekord.podstawa} testId={`${testId}-podstawa-tresc`} />
        </Pole>
        <Pole etykieta={TEKSTY.dowod} testId={`${testId}-dowod`}>
          <TrescDowodu dowod={rekord.dowod} testId={`${testId}-dowod`} />
        </Pole>
        <Pole etykieta={TEKSTY.kompletnosc} testId={`${testId}-kompletnosc`}>
          <TrescKompletnosci
            kompletnosc={rekord.kompletnosc_dowodu}
            powody={rekord.powody_niepelnosci}
            testId={`${testId}-kompletnosc`}
          />
        </Pole>
      </dl>
      <SekcjaRozwijana tytul={TEKSTY.zakres} domyslnieZwinieta={zwiniete} testId={`${testId}-zakres`}>
        <TrescZakresu zakres={rekord.zakres_waznosci} testId={`${testId}-zakres`} />
      </SekcjaRozwijana>
      <SekcjaRozwijana tytul={TEKSTY.slad} domyslnieZwinieta={zwiniete} testId={`${testId}-slad`}>
        <TrescSladu slad={rekord.slad} />
      </SekcjaRozwijana>
      <InformacjeAudytowe
        wiersze={wierszeAudytoweRekordu(rekord)}
        trybEkspercki
        testid={`${testId}-audyt`}
      />
      {wymaganie && (
        <section className="mvd-werdykt-skladowe" data-testid={`${testId}-skladowe`}>
          <h4 className="mvd-werdykt-skladowe-tytul">
            {TEKSTY.ocenySkladowe} <span className="mvd-num">({rekord.oceny_skladowe.length})</span>
          </h4>
          {rekord.oceny_skladowe.length === 0 ? (
            <p className="mvd-werdykt-akapit">{TEKSTY.skladoweBrak}</p>
          ) : (
            rekord.oceny_skladowe.map((ocena) => (
              <KartaWerdyktuRekordu
                key={ocena.kryterium_id}
                rekord={ocena}
                zwiniete={zwiniete}
                naglowek={undefined}
                zagniezdzona
              />
            ))
          )}
        </section>
      )}
    </article>
  );
}

/**
 * Karta werdyktu wyjaśnialnego — JEDYNA prezentacja rekordu `OcenaKryterium` /
 * `WynikWymagania` w interfejsie. Poziom rekordu rozpoznawany po kształcie (`wymaganie_id`).
 */
export function KartaWerdyktu({ rekord, zwiniete = true, naglowek }: KartaWerdyktuProps) {
  return (
    <KartaWerdyktuRekordu
      rekord={rekord}
      zwiniete={zwiniete}
      naglowek={naglowek}
      zagniezdzona={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Plakietka etykiety (komórka macierzy, listy rekordów)
// ---------------------------------------------------------------------------

export interface EtykietaWerdyktuProps {
  /** Etykieta Z REKORDU backendu (`rekord.etykieta`) — tekst i semantyka bez przemapowania. */
  readonly etykieta: Etykieta;
  /** Status maszynowy rekordu — wyłącznie atrybut `data-status` (filtry, testy), nigdy tekst. */
  readonly status?: StatusWerdyktu | null;
  readonly testid?: string;
}

/**
 * Kompaktowa plakietka etykiety rekordu werdyktu — ten sam kolor semantyki co karta
 * (`SEMANTYKA_KOLOR`, jedyna mapa semantyka → kolor). Tekst WYŁĄCZNIE `etykieta.etykieta_pl`.
 * Szczegół rekordu pokazuje `KartaWerdyktu`; plakietka nie zastępuje karty (§9: etykieta bez
 * wyjaśnienia nie jest odpowiedzią inżynierską — konsument zawsze prowadzi do karty).
 */
export function EtykietaWerdyktu({ etykieta, status = null, testid }: EtykietaWerdyktuProps) {
  const styl: StylKarty = { '--mvd-werdykt-kolor': SEMANTYKA_KOLOR[etykieta.semantyka] };
  return (
    <span
      className="mvd-werdykt-plakietka"
      style={styl}
      data-testid={testid}
      data-semantyka={etykieta.semantyka}
      data-status={status ?? undefined}
    >
      {etykieta.etykieta_pl}
    </span>
  );
}
