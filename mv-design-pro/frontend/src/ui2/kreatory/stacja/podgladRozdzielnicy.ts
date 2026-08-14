/**
 * Kreator stacji SN/nN — MODEL PODGLĄDU rozdzielnicy SN (karta SLD-GEN-POLA).
 *
 * Ten moduł SKŁADA ROZDZIELNICĘ: nagłówek pakietu katalogowego, szyna zbiorcza,
 * rozstawienie pól, tabele funkcji i aparatury, wyrocznie układu. Rysunek
 * POJEDYNCZEGO POLA powstaje w `generatorSldPola.ts` z RZECZYWISTEJ kompozycji
 * aparatów (BOM szablonu rodziny) — tu nie ma ani jednej decyzji „co stoi w
 * polu", bo taka decyzja podjęta drugi raz rozjechałaby się z pierwszą.
 *
 * Czysta funkcja: konfiguracja formularza + odczyty katalogu → OPIS RYSUNKU
 * (sloty pól, sceny pól, etykiety, geometria). Zero fizyki, zero obliczeń
 * sieciowych — geometria to układ rysunku, a wszystkie liczby w etykietach
 * pochodzą 1:1 z pozycji katalogowych wskazanych w formularzu.
 *
 * DLACZEGO OSOBNY MODUŁ, A NIE RYSUNEK W KOMPONENCIE. Układ (szerokości slotów,
 * zawijanie etykiet, głębokości torów) jest TESTOWALNY tylko wtedy, gdy powstaje
 * bez DOM-u: testy kontraktowe mierzą bboxy etykiet i sprawdzają, że sąsiednie
 * pola się nie nachodzą. Defekt zgłoszony przez właściciela („etykiety ról
 * stykają się ze sobą") był niewykrywalny, bo szerokość slotu dawała stała `96`
 * w komponencie — niezależna od długości tekstu, który w tym slocie stoi.
 *
 * SZEROKOŚĆ SLOTU WYNIKA Z TEGO, CO W NIM STOI (reguła KLASA §3 — warunek
 * wejścia i wyjścia z jednego źródła). Scena pola powstaje NAJPIERW we
 * współrzędnych względem osi slotu, a szerokość slotu liczy się z ZASIĘGU TEJ
 * SAMEJ sceny (`zasiegSceny`) i z pomiaru TYCH SAMYCH etykiet, które zostaną
 * narysowane. Dwa niezależne wzory (jeden „ile miejsca zajmie", drugi „co
 * narysować") rozjechałyby się przy pierwszym nowym symbolu w polu.
 *
 * REUŻYCIE (zakaz równoległej biblioteki symboli):
 *  · symbole: `ui/sld/v3/symbols` (`SYMBOL_DEFS` + `SYMBOL_GLYPHS`) — ten sam
 *    kanon IEC 60617, który rysuje kanwa SLD; brakujące glify (bezpiecznik sam,
 *    wskaźnik obecności napięcia) dorobione W KANONIE, nie tutaj,
 *  · pomiar tekstu: `ui/sld/v3/core/text` (`measureTextWidth`, deterministyczna
 *    formuła bez DOM — jedna prawda dla renderu i dla testów),
 *  · zapis liczb: `liczbaRysunkuPl` z tego samego kanonu (przecinek dziesiętny).
 *
 * GRANICE DANYCH (nazwane, nie zgadywane). Kompozycję aparatów pola niesie
 * `base_template.devices` szablonu (a gdy szablon niesie kompozycję producenta —
 * `device_instances`). Czego kontrakt katalogu NIE niesie na dziś: SZEROKOŚCI
 * pola i rozdzielnicy [mm] — nie ma jej ani w `SwitchgearFamily`, ani w
 * `CompleteMvBayTemplate`. Nagłówek pokazuje więc jawny brak zamiast liczby;
 * szerokość wejdzie razem z encją katalogowego pola (`CatalogFunctionalUnit`,
 * §3 kanonu konfiguratora), której dostarcza scalenie kanonu rodzin.
 */

import { liczbaRysunkuPl, measureTextWidth } from '../../../ui/sld/v3/core/text';
import {
  CONSTRUCTION_LABELS_PL,
  type SwitchgearFamily,
} from '../../../ui/catalog/SwitchgearFamilyPicker';
import type { CompleteMvBayTemplateSummary } from '../../../ui/catalog/BayTemplatePicker';
import {
  FIELD_ROLE_LABELS,
  SOURCE_STATUS_LABEL_PL,
  type SnFieldRole,
  type StationSnFieldTemplate,
} from '../../../ui/network-build/forms/InsertStationFormHelpers';
import type { MVApparatusCatalogType, TransformerType } from '../../../ui/catalog/types';
import {
  FONT_APARATU,
  FONT_ROLI,
  ODSTEP_TABELA_SZYNA,
  przesunScene,
  symbolRodzajuAparatu,
  wymiarSymbolu,
  zasiegSceny,
  zbudujBomPola,
  zbudujScenePola,
  type PozycjaBom,
  type ScenaPola,
} from './generatorSldPola';
import { etykietaRodzajuAparatu } from './stacjaModel';
import { STACJA_STRINGS as T } from './strings';

export {
  GRUBOSC_SZYNY,
  GRUBOSC_TORU,
  KLASA_APARATU,
  KLASA_OZNACZENIA,
  KLASA_ROLI,
  ODSTEP_TABELA_SZYNA,
  SKALA_SYMBOLU,
  RODZAJE_APARATU_KREATORA,
  SYMBOL_RODZAJU_APARATU,
  pozycjaOznaczenia,
  symbolRodzajuAparatu,
  wymiarSymbolu,
} from './generatorSldPola';
export type { OdcinekToru, ScenaPola, SymbolSceny } from './generatorSldPola';

const WYS_WIERSZA_ROLI_ = FONT_ROLI + 4;
const WYS_WIERSZA_APARATU_ = FONT_APARATU + 4;
export const WYS_WIERSZA_ROLI = WYS_WIERSZA_ROLI_;
export const WYS_WIERSZA_APARATU = WYS_WIERSZA_APARATU_;

/** Marginesy rysunku i szerokości slotu pola. */
const MARGINES = 10;
const MAKS_TEKST = 104;
const MIN_SLOT = 92;
const ODDECH_SLOTU = 16;

// --- Wejście / wyjście modelu -------------------------------------------

/**
 * Werdykt konfiguracji rozdzielnicy. NIE jest liczony w UI: pochodzi z operacji
 * domenowej backendu uruchomionej w trybie `dry_run` (ta sama, która wykona
 * zapis), więc nagłówek pokazuje dokładnie ten stan, który rozstrzygnie o
 * przyjęciu stacji. `NIESPRAWDZONA`/`SPRAWDZANIE` to uczciwe stany odczytu, nie
 * trzecia i czwarta ocena poprawności.
 */
export type StatusKonfiguracji = 'VALID' | 'INVALID' | 'NIESPRAWDZONA' | 'SPRAWDZANIE';

export interface WejsciePodgladu {
  readonly snFields: readonly StationSnFieldTemplate[];
  /** Katalog APARAT_SN (readout backendu) — do rozwiązania `apparatus_catalog_ref`. */
  readonly aparaty: readonly MVApparatusCatalogType[];
  /** Katalog TRAFO_SN_NN — do opisu transformatora pola transformatorowego. */
  readonly transformatory: readonly TransformerType[];
  /** Wskazany typ transformatora stacji (krok „Transformator"). */
  readonly transformatorRef: string | null;
  /** Napięcie szyny SN z kontekstu operacji [kV]; 0 = nieznane. */
  readonly snVoltageKv: number;
  /**
   * Kompletne szablony pól (`/api/catalog/complete-bay-templates`) — NOŚNIK
   * KOMPOZYCJI APARATÓW. Bez nich pole ma wyłącznie aparat główny wskazany w
   * formularzu; z nimi rysunek pokazuje realny skład pola rodziny.
   */
  readonly szablonyPol?: readonly CompleteMvBayTemplateSummary[];
  /** Rodzina rozdzielnicy wybrana w kroku pól — dane nagłówka pakietu. */
  readonly rodzina?: SwitchgearFamily | null;
  /** Nazwa producenta do nagłówka (readout katalogu producentów). */
  readonly producent?: string | null;
  /** Werdykt walidatora backendu; domyślnie „niesprawdzona". */
  readonly statusKonfiguracji?: StatusKonfiguracji;
  /** Komunikat backendu przy werdykcie `INVALID` (bez tłumaczenia w UI). */
  readonly komunikatStatusu?: string | null;
}

export interface SlotPodgladu {
  readonly klucz: string;
  readonly numer: number;
  readonly rola: SnFieldRole;
  /** Oś slotu [px świata]. */
  readonly x: number;
  readonly szerokosc: number;
  /** Wiersze nagłówka tabeli pól (nazwa roli, zawinięta). */
  readonly wierszeRoli: readonly string[];
  /** Wiersze opisu pod polem (rodzina, kod katalogowy, aparat, transformator). */
  readonly wierszeOpisu: readonly string[];
  /**
   * Ile pierwszych wierszy opisu to NAZWA KATALOGOWA aparatu (klasa
   * „tożsamość" kanonu SLD — rysowana pismem podstawowym, nie wygaszonym).
   * Zawinięta nazwa ma dwa wiersze i oba są nazwą; wyróżnianie tylko wiersza
   * `0` rozjeżdżało typografię tam, gdzie nazwa się nie mieściła.
   */
  readonly wierszyNazwy: number;
  /** `true` gdy pole nie ma wskazanego aparatu (uczciwy brak, nie domysł). */
  readonly brakAparatu: boolean;
  /** Kompozycja aparatów pola — wejście wyroczni dwustronnej BOM ↔ scena. */
  readonly bom: readonly PozycjaBom[];
  /** Scena pola przesunięta na oś slotu (symbole, tor, strefy). */
  readonly scena: ScenaPola;
  /** Dolna krawędź rysunku pola [px świata]. */
  readonly dol: number;
  /** Przerwa szyny wymuszona przez pole sprzęgłowe (para x) albo `null`. */
  readonly przerwaSzyny: readonly [number, number] | null;
}

/**
 * Nagłówek pakietu rozdzielnicy — czyta pakiet katalogowy, nie formularz.
 * Wartość `null` znaczy „katalog tego nie niesie" i ma być pokazana jako jawny
 * brak; nigdy nie wolno jej zastąpić liczbą domyślną.
 */
export interface NaglowekRozdzielnicy {
  readonly producent: string | null;
  readonly rodzina: string | null;
  readonly konstrukcja: string | null;
  /** Klasa napięciowa rodziny, np. „12 / 17,5 / 24 kV". */
  readonly klasaNapiecia: string | null;
  /** Prąd znamionowy szyn rodziny, np. „630 A". */
  readonly pradSzyn: string | null;
  /** Prąd zwarciowy krótkotrwały rodziny, np. „16 / 20 / 21 kA". */
  readonly pradZwarciowy: string | null;
  readonly liczbaJednostek: number;
  /**
   * Szerokość całkowita rozdzielnicy. Dziś ZAWSZE `null`: ani `SwitchgearFamily`,
   * ani `CompleteMvBayTemplate` nie niosą wymiaru pola — wejdzie z encją
   * katalogowego pola (`CatalogFunctionalUnit`, §3 kanonu konfiguratora).
   * Zmyślenie „bo typowe pole ma 750 mm" byłoby fabrykacją danej wykonawczej.
   */
  readonly szerokoscCalkowita: string | null;
  readonly status: StatusKonfiguracji;
  readonly komunikatStatusu: string | null;
}

export interface PodgladRozdzielnicy {
  readonly szerokosc: number;
  readonly wysokosc: number;
  /** Y osi szyny zbiorczej. */
  readonly szynaY: number;
  /** Odcinki szyny (więcej niż jeden, gdy stacja ma sprzęgło). */
  readonly odcinkiSzyny: readonly (readonly [number, number])[];
  readonly etykietaSzyny: string;
  /** Y pierwszego wiersza nagłówka tabeli pól (numer pola). */
  readonly naglowekY: number;
  /** Y pierwszego wiersza opisu pod polami. */
  readonly opisyY: number;
  /** Najwięcej wierszy opisu w polu — wysokość tabeli aparatury pod rysunkiem. */
  readonly wierszyOpisu: number;
  readonly sloty: readonly SlotPodgladu[];
  readonly naglowek: NaglowekRozdzielnicy;
}

// --- Pomocnicze (czyste) -------------------------------------------------

/** Jednostki, które NIGDY nie mają zostać oderwane od swojej liczby. */
const JEDNOSTKI = ['kVA', 'MVA', 'kV', 'kA', 'kW', 'MW', 'Hz', 'A', 'V', 'm'];

/**
 * Skleja liczbę z jej jednostką spacją nierozdzielającą — „17,5 kV" ma zostać
 * w jednym wierszu. Zapis „…17,5 / kV" (jednostka sama w nowym wierszu) jest w
 * rysunku technicznym błędem czytelności, a powstawał z każdej dłuższej nazwy
 * katalogowej. Szerokość tekstu się nie zmienia (spacja nierozdzielająca ma tę
 * samą długość), więc pomiar i układ zostają bez zmian.
 */
export function sklejJednostki(tekst: string): string {
  return tekst.replace(
    new RegExp(`(\\d) (${JEDNOSTKI.join('|')})\\b`, 'g'),
    (_m, liczba: string, jednostka: string) => `${liczba} ${jednostka}`,
  );
}

/**
 * Zawijanie tekstu do zadanej szerokości — deterministyczne (pomiar z kanonu,
 * bez DOM). Słowo dłuższe od limitu zostaje w całości we własnym wierszu:
 * ucięcie nazwy katalogowej („Rozłącznik bezpiecz…") ukrywałoby daną, na
 * której projektant opiera dobór; zamiast tego rośnie slot.
 */
export function zawinTekst(tekst: string, fontSize: number, maks: number): string[] {
  // Podział WYŁĄCZNIE po spacji zwykłej/tabulatorze/końcu wiersza: `\s` w
  // JavaScripcie obejmuje też spację nierozdzielającą, więc `split(/\s+/)`
  // rozrywałby dokładnie te pary, które `sklejJednostki` przed chwilą skleił.
  const slowa = sklejJednostki(tekst)
    .split(/[ \t\n\r]+/)
    .filter((s) => s.length > 0);
  if (slowa.length === 0) return [];
  const wiersze: string[] = [];
  let biezacy = slowa[0];
  for (const slowo of slowa.slice(1)) {
    const kandydat = `${biezacy} ${slowo}`;
    if (measureTextWidth(kandydat, fontSize) <= maks) biezacy = kandydat;
    else {
      wiersze.push(biezacy);
      biezacy = slowo;
    }
  }
  wiersze.push(biezacy);
  return wiersze;
}

/** Najszerszy wiersz zbioru [px świata]. */
function najszerszy(wiersze: readonly string[], fontSize: number): number {
  return wiersze.reduce((max, w) => Math.max(max, measureTextWidth(w, fontSize)), 0);
}

/** Separator członów opisu na rysunku (ten sam, co w pickerach kreatora). */
const SEPARATOR = ' · ';

/**
 * Pakowanie CZŁONÓW opisu w wiersze: separator trafia WYŁĄCZNIE między człony
 * stojące w tym samym wierszu. Zawijanie gotowego łańcucha zostawiało wiersz
 * zakończony wiszącym „·" (albo zaczęty od niego) — zapis obcy rysunkowi.
 */
export function zawinCzesci(
  czesci: readonly string[],
  fontSize: number,
  maks: number,
): string[] {
  const niepuste = czesci.filter((c) => c.trim() !== '');
  if (niepuste.length === 0) return [];
  const wiersze: string[] = [];
  let biezacy = niepuste[0];
  for (const czlon of niepuste.slice(1)) {
    const kandydat = `${biezacy}${SEPARATOR}${czlon}`;
    if (measureTextWidth(kandydat, fontSize) <= maks) biezacy = kandydat;
    else {
      wiersze.push(biezacy);
      biezacy = czlon;
    }
  }
  wiersze.push(biezacy);
  return wiersze;
}

/** Człony znamion aparatu — wyłącznie te, które pozycja katalogowa niesie. */
export function czesciZnamionAparatu(aparat: MVApparatusCatalogType): string[] {
  const czesci: string[] = [];
  if (Number.isFinite(aparat.u_n_kv)) czesci.push(`${liczbaRysunkuPl(aparat.u_n_kv)} kV`);
  if (Number.isFinite(aparat.i_n_a)) czesci.push(`${liczbaRysunkuPl(aparat.i_n_a)} A`);
  const wylaczalny = aparat.breaking_capacity_ka;
  if (typeof wylaczalny === 'number' && Number.isFinite(wylaczalny)) {
    czesci.push(`${liczbaRysunkuPl(wylaczalny)} kA`);
  }
  return czesci;
}

/** Znamiona aparatu w konwencji rysunku: „17,5 kV · 630 A · 25 kA". */
export function znamionaAparatu(aparat: MVApparatusCatalogType): string {
  return czesciZnamionAparatu(aparat).join(SEPARATOR);
}

/** Człony opisu transformatora stacji — wyłącznie te, które niesie katalog. */
export function czesciZnamionTransformatora(typ: TransformerType): string[] {
  const czesci: string[] = [];
  if (Number.isFinite(typ.rated_power_mva)) {
    czesci.push(`${liczbaRysunkuPl(typ.rated_power_mva * 1000)} kVA`);
  }
  if (Number.isFinite(typ.voltage_hv_kv) && Number.isFinite(typ.voltage_lv_kv)) {
    czesci.push(`${liczbaRysunkuPl(typ.voltage_hv_kv)}/${liczbaRysunkuPl(typ.voltage_lv_kv)} kV`);
  }
  return czesci;
}

/** Opis transformatora stacji w konwencji rysunku: „630 kVA · 15/0,4 kV". */
export function znamionaTransformatora(typ: TransformerType): string {
  return czesciZnamionTransformatora(typ).join(SEPARATOR);
}

/** Referencja katalogowa pozycji wyposażenia pola (`equipment.ct|vt|relay`). */
function refWyposazenia(
  equipment: Record<string, unknown> | undefined,
  klucz: string,
): string | null {
  const wpis = equipment?.[klucz];
  if (!wpis || typeof wpis !== 'object') return null;
  const ref = (wpis as { catalog_ref?: unknown }).catalog_ref;
  return typeof ref === 'string' && ref.trim() !== '' ? ref : null;
}

/**
 * Lista wartości katalogowych rodziny w konwencji rysunku: „12 / 17,5 / 24 kV".
 * Pusta lista daje `null` — rodzina bez zadeklarowanych wartości pokazuje brak,
 * nie „0".
 */
function listaZnamion(wartosci: readonly number[] | undefined, jednostka: string): string | null {
  if (!wartosci || wartosci.length === 0) return null;
  return `${wartosci.map((w) => liczbaRysunkuPl(w)).join(' / ')} ${jednostka}`;
}

/**
 * Wyrównanie ZEJŚĆ pól o torze zakończonym wyprowadzeniem (liniowe, odgałęźne)
 * do wspólnego poziomu.
 *
 * Symbole kanonu mają różne wysokości (wyłącznik 16, reklozer 24, rozłącznik
 * bezpiecznikowy 32 px), a pola różnią się liczbą aparatów w kompozycji, więc
 * tory kończyły się na różnych poziomach — na rysunku wykonawczym wyprowadzenia
 * z rozdzielnicy leżą w jednej linii, a „strzępiasty" dół czyta się jak błąd
 * rysunku. Pola z własnym zakończeniem (transformatorowe — zejście do
 * transformatora i strona nN; sprzęgłowe — powrót na szynę) NIE są wyrównywane:
 * ich dół wynika z topologii, nie z długości toru.
 */
function wyrownajZejscia(sceny: readonly ScenaPola[]): ScenaPola[] {
  const doWyrownania = sceny.filter((s) => s.zejscieOtwarte);
  if (doWyrownania.length === 0) return [...sceny];
  const poziom = Math.max(...doWyrownania.map((s) => s.dol));
  return sceny.map((scena) => {
    if (!scena.zejscieOtwarte || scena.dol === poziom) return scena;
    const tor = scena.tor.slice();
    const ostatni = tor[tor.length - 1];
    tor[tor.length - 1] = [ostatni[0], ostatni[1], ostatni[2], poziom] as const;
    return { ...scena, tor, dol: poziom };
  });
}

// --- Budowa opisu rysunku ------------------------------------------------

/**
 * Buduje opis rysunku rozdzielnicy z konfiguracji formularza.
 *
 * Kolejność pól = kolejność listy pól kreatora (ta sama, którą projektant widzi
 * w wierszach kroku 4 i którą dostanie operacja domenowa) — podgląd nie sortuje
 * po swojemu, bo numer pola na rysunku ma zgadzać się z numerem wiersza.
 */
export function zbudujPodglad(wejscie: WejsciePodgladu): PodgladRozdzielnicy {
  const {
    snFields,
    aparaty,
    transformatory,
    transformatorRef,
    snVoltageKv,
    szablonyPol = [],
    rodzina = null,
    producent = null,
    statusKonfiguracji = 'NIESPRAWDZONA',
    komunikatStatusu = null,
  } = wejscie;
  const transformator = transformatorRef
    ? transformatory.find((t) => t.id === transformatorRef) ?? null
    : null;

  const wstepne = snFields.map((pole, index) => {
    const aparat = pole.apparatus_catalog_ref
      ? aparaty.find((a) => a.id === pole.apparatus_catalog_ref) ?? null
      : null;
    const szablon = pole.bay_template_ref
      ? szablonyPol.find((s) => s.template_ref === pole.bay_template_ref) ?? null
      : null;
    const bom = zbudujBomPola({
      szablon,
      // Wskazany aparat główny jest pozycją BOM pola — także wtedy, gdy pole nie
      // ma jeszcze dobranego pakietu katalogowego (wtedy jest jedyną znaną).
      maAparatGlowny: aparat !== null,
      maCt: refWyposazenia(pole.equipment, 'ct') !== null,
      maVt: refWyposazenia(pole.equipment, 'vt') !== null,
      maPrzekaznik: refWyposazenia(pole.equipment, 'relay') !== null,
      // Transformator stacji przyłącza się polem transformatorowym — to dana
      // projektu (stacja SN/nN go tworzy), a nie opcja karty katalogowej.
      maTransformator: pole.field_role === 'TRANSFORMATOROWE',
    });
    const wierszeRoli = zawinTekst(
      FIELD_ROLE_LABELS[pole.field_role] ?? pole.field_role,
      FONT_ROLI,
      MAKS_TEKST,
    );
    // Rodzaj i znamiona idą jednym wierszem, dopóki się w nim mieszczą — dopiero
    // przy dłuższych danych rozchodzą się na dwa. Zawijanie wspólnego łańcucha
    // wypychało separator „·" na początek wiersza (zapis obcy rysunkowi).
    const wierszeNazwy = aparat
      ? zawinTekst(aparat.name, FONT_APARATU, MAKS_TEKST)
      : zawinTekst(T.podgladBrakAparatu, FONT_APARATU, MAKS_TEKST);
    const opisAparatu = aparat
      ? [
          ...wierszeNazwy,
          ...zawinCzesci(
            [etykietaRodzajuAparatu(aparat.device_kind), ...czesciZnamionAparatu(aparat)],
            FONT_APARATU,
            MAKS_TEKST,
          ),
        ]
      : wierszeNazwy;
    const opisTransformatora =
      pole.field_role === 'TRANSFORMATOROWE'
        ? transformator
          ? [
              ...zawinTekst(transformator.name, FONT_APARATU, MAKS_TEKST),
              ...zawinCzesci(czesciZnamionTransformatora(transformator), FONT_APARATU, MAKS_TEKST),
            ]
          : zawinTekst(T.podgladBrakTransformatora, FONT_APARATU, MAKS_TEKST)
        : [];
    // Pakiet katalogowy pola: rodzina + KOD KATALOGOWY pola (to on identyfikuje
    // jednostkę funkcjonalną w ofercie producenta) + status pakietu — ten sam
    // słownik statusów, co w pickerze szablonu pola (jedno źródło nazw).
    const opisPakietu = szablon
      ? zawinCzesci(
          [
            rodzina?.family_name ?? szablon.switchgear_family_ref ?? '',
            szablon.template_code ?? szablon.template_ref,
          ],
          FONT_APARATU,
          MAKS_TEKST,
        )
      : [];
    const status = pole.bay_template_ref
      ? SOURCE_STATUS_LABEL_PL[pole.source_status]
      : T.podgladBrakSzablonu;
    const wierszeOpisu = [...opisAparatu, ...opisTransformatora, ...opisPakietu, status];
    return {
      pole,
      index,
      aparat,
      bom,
      wierszeRoli,
      wierszeOpisu,
      wierszyNazwy: wierszeNazwy.length,
    };
  });

  const naglowekY = MARGINES + FONT_ROLI;
  const wierszyNaglowka = Math.max(1, ...wstepne.map((w) => w.wierszeRoli.length));
  const szynaY = naglowekY + (wierszyNaglowka + 1) * WYS_WIERSZA_ROLI_ + ODSTEP_TABELA_SZYNA;

  // Sceny pól powstają PRZED rozstawieniem — szerokość slotu wynika z nich.
  const sceny = wyrownajZejscia(
    wstepne.map((w) =>
      zbudujScenePola(w.bom, {
        szynaY,
        symbolAparatuGlownego: symbolRodzajuAparatu(w.aparat?.device_kind),
        sprzeglo: w.pole.field_role === 'SPRZEGLO',
      }),
    ),
  );

  let kursorX = MARGINES;
  const sloty: SlotPodgladu[] = wstepne.map((w, i) => {
    const scena = sceny[i];
    const [dxMin, dxMax] = zasiegSceny(scena);
    const szerokoscTekstu = Math.max(
      najszerszy(w.wierszeRoli, FONT_ROLI),
      najszerszy(w.wierszeOpisu, FONT_APARATU),
    );
    // Slot musi pomieścić JEDNO I DRUGIE: rysunek (symetrycznie wokół osi, żeby
    // oś slotu pokrywała się z osią nagłówka i opisu) oraz najszerszy wiersz.
    const polowaRysunku = Math.max(-dxMin, dxMax);
    const szerokosc = Math.max(
      MIN_SLOT,
      szerokoscTekstu + ODDECH_SLOTU,
      2 * polowaRysunku + ODDECH_SLOTU,
    );
    const x = kursorX + szerokosc / 2;
    kursorX += szerokosc;
    const przesunieta = przesunScene(scena, x);
    return {
      klucz: `${w.pole.field_role}-${w.index}`,
      numer: w.index + 1,
      rola: w.pole.field_role,
      x,
      szerokosc,
      wierszeRoli: w.wierszeRoli,
      wierszeOpisu: w.wierszeOpisu,
      wierszyNazwy: w.wierszyNazwy,
      brakAparatu: w.aparat === null,
      bom: w.bom,
      scena: przesunieta,
      dol: przesunieta.dol,
      przerwaSzyny: przesunieta.przerwa,
    };
  });

  const szerokosc = Math.max(kursorX + MARGINES, MIN_SLOT + 2 * MARGINES);
  const opisyY = Math.max(szynaY + 60, ...sloty.map((s) => s.dol)) + 2 * WYS_WIERSZA_APARATU_;
  const wierszyOpisu = Math.max(1, ...sloty.map((s) => s.wierszeOpisu.length));
  const wysokosc = opisyY + wierszyOpisu * WYS_WIERSZA_APARATU_ + MARGINES;

  // Odcinki szyny: pełna belka minus przerwy pól sprzęgłowych.
  const przerwy = sloty
    .map((s) => s.przerwaSzyny)
    .filter((p): p is readonly [number, number] => p !== null)
    .slice()
    .sort((a, b) => a[0] - b[0]);
  const odcinkiSzyny: (readonly [number, number])[] = [];
  let od = MARGINES;
  for (const [a, b] of przerwy) {
    if (a > od) odcinkiSzyny.push([od, a]);
    od = b;
  }
  odcinkiSzyny.push([od, szerokosc - MARGINES]);

  return {
    szerokosc,
    wysokosc,
    szynaY,
    wierszyOpisu,
    odcinkiSzyny,
    etykietaSzyny:
      snVoltageKv > 0 ? T.podgladSzyna(liczbaRysunkuPl(snVoltageKv)) : T.podgladSzynaBezNapiecia,
    naglowekY,
    opisyY,
    sloty,
    naglowek: {
      producent: producent ?? rodzina?.manufacturer_ref ?? null,
      rodzina: rodzina?.family_name ?? null,
      konstrukcja: rodzina ? CONSTRUCTION_LABELS_PL[rodzina.construction_type] : null,
      klasaNapiecia: listaZnamion(rodzina?.voltage_levels, 'kV'),
      pradSzyn: listaZnamion(rodzina?.rated_current_options, 'A'),
      pradZwarciowy: listaZnamion(rodzina?.short_time_current_options, 'kA'),
      liczbaJednostek: snFields.length,
      // Kontrakt katalogu nie niesie wymiaru pola — patrz nagłówek modułu.
      szerokoscCalkowita: null,
      status: statusKonfiguracji,
      komunikatStatusu,
    },
  };
}

// --- Wyrocznie układu (wejście testów kontraktowych) ---------------------

export interface BboxEtykiety {
  readonly slot: number;
  readonly wiersz: string;
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
}

/**
 * Prostokąty otaczające WSZYSTKIE wiersze tekstu rysunku (nagłówek roli + opisy
 * pod polami). Tekst jest centrowany na osi slotu, więc bbox liczymy z pomiaru
 * kanonu — tego samego, którym liczona jest szerokość slotu.
 */
export function bboxyEtykiet(podglad: PodgladRozdzielnicy): BboxEtykiety[] {
  const wynik: BboxEtykiety[] = [];
  for (const slot of podglad.sloty) {
    // Numer pola też jest napisem rysunku — wyrocznia obejmuje KAŻDY wiersz
    // tekstu, nie tylko te, które dziś wyglądają na zagrożone (reguła KLASA §1).
    const numer = T.podgladPole(slot.numer);
    const wNumeru = measureTextWidth(numer, FONT_ROLI);
    wynik.push({
      slot: slot.numer,
      wiersz: numer,
      x1: slot.x - wNumeru / 2,
      x2: slot.x + wNumeru / 2,
      y: podglad.naglowekY,
    });
    slot.wierszeRoli.forEach((wiersz, i) => {
      const w = measureTextWidth(wiersz, FONT_ROLI);
      wynik.push({
        slot: slot.numer,
        wiersz,
        x1: slot.x - w / 2,
        x2: slot.x + w / 2,
        y: podglad.naglowekY + (i + 1) * WYS_WIERSZA_ROLI_,
      });
    });
    slot.wierszeOpisu.forEach((wiersz, i) => {
      const w = measureTextWidth(wiersz, FONT_APARATU);
      wynik.push({
        slot: slot.numer,
        wiersz,
        x1: slot.x - w / 2,
        x2: slot.x + w / 2,
        y: podglad.opisyY + i * WYS_WIERSZA_APARATU_,
      });
    });
  }
  return wynik;
}

/** Minimalny prześwit między etykietami sąsiednich pól [px świata]. */
export const MIN_PRZESWIT_ETYKIET = 6;

/**
 * Wyrocznia odstępów: pary etykiet RÓŻNYCH pól, które leżą w tym samym wierszu
 * i nachodzą na siebie (albo stykają się poniżej minimalnego prześwitu). Pusta
 * lista = rysunek czytelny. Deklaracja bez wyroczni byłaby fałszywą pewnością —
 * defekt „etykiety stykają się" żył w repo dokładnie dlatego.
 */
export function kolizjeEtykiet(podglad: PodgladRozdzielnicy): string[] {
  const bboxy = bboxyEtykiet(podglad);
  const kolizje: string[] = [];
  for (let i = 0; i < bboxy.length; i += 1) {
    for (let j = i + 1; j < bboxy.length; j += 1) {
      const a = bboxy[i];
      const b = bboxy[j];
      if (a.slot === b.slot || a.y !== b.y) continue;
      const przeswit = Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2);
      if (przeswit < MIN_PRZESWIT_ETYKIET) {
        kolizje.push(`„${a.wiersz}" (pole ${a.slot}) × „${b.wiersz}" (pole ${b.slot})`);
      }
    }
  }
  return kolizje;
}

/**
 * Wyrocznia zasięgu: elementy rysunku pola, które wychodzą poza własny slot.
 * Wyjście poza slot = wejście w rysunek sąsiada (ta sama klasa defektu co
 * kolizja etykiet, tylko po stronie geometrii). Obejmuje symbole WRAZ Z
 * OZNACZENIAMI (zasięg sceny), tor, strefę kablową i kreskę strony nN.
 */
export function wyjsciaPozaSlot(podglad: PodgladRozdzielnicy): string[] {
  const bledy: string[] = [];
  for (const slot of podglad.sloty) {
    const lewa = slot.x - slot.szerokosc / 2;
    const prawa = slot.x + slot.szerokosc / 2;
    const [dxMin, dxMax] = zasiegSceny(slot.scena, slot.x);
    if (dxMin < lewa || dxMax > prawa) {
      bledy.push(`rysunek pola ${slot.numer} wychodzi poza slot`);
    }
    for (const s of slot.scena.symbole) {
      if (s.x < lewa || s.x + wymiarSymbolu(s.id).szerokosc > prawa) {
        bledy.push(`symbol ${s.id} pola ${slot.numer} poza slotem`);
      }
    }
    for (const [x1, , x2] of slot.scena.tor) {
      if (Math.min(x1, x2) < lewa || Math.max(x1, x2) > prawa) {
        bledy.push(`tor pola ${slot.numer} poza slotem`);
      }
    }
  }
  return bledy;
}
