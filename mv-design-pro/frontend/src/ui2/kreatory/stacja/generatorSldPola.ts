/**
 * FIELD SLD GENERATOR — mini-SLD POLA z RZECZYWISTEJ kompozycji aparatów
 * (karta SLD-GEN-POLA, etap S4 programu KONFIGURATOR-POL-RMU).
 *
 * POTOK (kanon `docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §5):
 *
 *   MODEL POLA (`CompleteMvBayTemplate` z `/api/catalog/complete-bay-templates`
 *     + wybory projektanta: aparat główny z katalogu APARAT_SN, wyposażenie
 *     pomiarowo-zabezpieczeniowe, transformator stacji)
 *        ↓ `zbudujBomPola`
 *   BOM POLA — lista pozycji w postaci kanonicznej (rodzaj, oznaczenie Q,
 *     pozycja, umiejscowienie elektryczne, źródło pozycji)
 *        ↓ `terminalePola`
 *   TERMINALE ELEKTRYCZNE — do czego pozycja się przyłącza (szyna / tor / ziemia
 *     / odgałęzienie pomiarowe / strona nN)
 *        ↓ `SYMBOL_RODZAJU_BOM` (+ nadpisanie aparatu głównego)
 *   SYMBOLE IEC — WYŁĄCZNIE kanon `ui/sld/v3/symbols` (`SYMBOL_DEFS`/`SYMBOL_GLYPHS`);
 *     brakujący glif dorabia się W KANONIE (tak powstały `fuse` i `voltageIndicator`),
 *     nigdy lokalną biblioteką glifów
 *        ↓ `zbudujScenePola`
 *   SCENA POLA — symbole z pozycją i oznaczeniem, odcinki toru, strefa kablowa,
 *     zejście strony nN; ta sama scena zasila mini-SLD kreatora i (docelowo)
 *     globalny SLD, bo powstaje z TEGO SAMEGO modelu pola.
 *
 * CZYSTA FUNKCJA. Zero `fetch`, zero stanu, zero DOM — dane wchodzą parametrem,
 * scena wychodzi wartością. Zero fizyki: geometria to układ rysunku, a każda
 * liczba w opisie pochodzi 1:1 z pozycji katalogowej wskazanej w formularzu.
 *
 * DWA ZAKAZY KARTY, OBA SPRAWDZANE WYROCZNIĄ `roznicaBomScena`:
 *  · nie wolno narysować aparatu, którego NIE MA w BOM pola,
 *  · nie wolno pominąć aparatu, który W BOM JEST.
 * Wyrocznia jest dwustronna i pracuje na oznaczeniach Q — deklaracja bez testu
 * byłaby fałszywą pewnością (reguła KLASA §4).
 *
 * DLACZEGO BOM, A NIE „ROLA POLA". Poprzedni podgląd rysował pole z ROLI i
 * jednego wybranego aparatu, więc cztery pola różniące się rzeczywistym składem
 * (RMU rozłącznikowe vs pole wyłącznikowe z przekładnikami vs transformatorowe
 * switch-fuse vs pomiarowe) dawały cztery identyczne rysunki różniące się
 * podpisem. Kompozycja aparatów JEST daną katalogową rodziny — SafeRing nie ma
 * w słowniku rodziny przekładnika prądowego, UniGear ma; ta różnica ma być
 * widoczna na rysunku, bo zmienia projekt zabezpieczeń.
 */

import { LABEL_TYPOGRAPHY, measureTextWidth } from '../../../ui/sld/v3/core/text';
import { SYMBOL_DEFS, type SymbolId } from '../../../ui/sld/v3/symbols/defs';
import type {
  BayDeviceInstanceWire,
  BayDeviceTemplateWire,
  CompleteMvBayTemplateSummary,
} from '../../../ui/catalog/BayTemplatePicker';
import { ETYKIETY_RODZAJU_APARATU } from './stacjaModel';

// ---------------------------------------------------------------------------
// BOM POLA — postać kanoniczna
// ---------------------------------------------------------------------------

/**
 * Rodzaj pozycji BOM pola — postać KANONICZNA generatora.
 *
 * Zbiór jest sumą dwóch nomenklatur kontraktu backendu, sprowadzonych do jednej
 * przez normalizatory niżej (jedna geometria, dwa adaptery — nigdy dwie
 * równoległe ścieżki rysowania):
 *  · `BayDeviceTemplate.kind` — kanoniczny układ aparatury szablonu pola
 *    (CB, DS_BUS, DS_LINE, ES, CT, VT, FUSE, SURGE_ARRESTER, CABLE_HEAD,
 *    TRANSFORMER_DEVICE),
 *  · `BayDeviceInstanceTemplate.apparatus_kind` — kompozycja producenta
 *    (dokłada VPIS, przekaźnik, licznik i wyłącznik strony nN).
 */
export type RodzajAparatuBom =
  | 'APARAT_GLOWNY'
  | 'ODLACZNIK_SZYNOWY'
  | 'ODLACZNIK_LINIOWY'
  | 'UZIEMNIK'
  | 'PRZEKLADNIK_PRADOWY'
  | 'PRZEKLADNIK_NAPIECIOWY'
  | 'BEZPIECZNIK'
  | 'OGRANICZNIK_PRZEPIEC'
  | 'GLOWICA_KABLOWA'
  | 'TRANSFORMATOR'
  | 'WSKAZNIK_NAPIECIA'
  | 'PRZEKAZNIK'
  | 'LICZNIK'
  | 'WYLACZNIK_NN';

/**
 * Umiejscowienie elektryczne pozycji — z niego wynika geometria:
 *  · `TOR` — aparat toru głównego (szyna → … → wyprowadzenie),
 *  · `ZIEMIA` — odgałęzienie DO ZIEMI (uziemnik, ogranicznik przepięć),
 *  · `BOCZNE` — odgałęzienie pomiarowo-sygnalizacyjne (przekładnik napięciowy,
 *    wskaźnik obecności napięcia) — nie przewodzi prądu roboczego pola,
 *  · `ADNOTACJA` — element obok toru, bez udziału w ciągłości elektrycznej
 *    (przekaźnik, licznik) — ta sama zasada, co w kanonie SLD v3 §17.1.
 */
export type UmiejscowienieBom = 'TOR' | 'ZIEMIA' | 'BOCZNE' | 'ADNOTACJA';

/** Skąd pozycja BOM pochodzi — jawne źródło danych każdej kreski rysunku. */
export type ZrodloPozycjiBom = 'szablon' | 'producent' | 'wyposazenie';

export interface PozycjaBom {
  readonly rodzaj: RodzajAparatuBom;
  /** Oznaczenie operatorskie (Q1/Q0/Q2/Q9/T1/GK/TR…) — z danych, nie z domysłu. */
  readonly oznaczenie: string;
  /** Pozycja w kolumnie pola (od szyny w dół) — porządek toru. */
  readonly pozycja: number;
  readonly umiejscowienie: UmiejscowienieBom;
  readonly opcjonalny: boolean;
  readonly zrodlo: ZrodloPozycjiBom;
}

/**
 * `BayDeviceTemplate.kind` → rodzaj kanoniczny. Tablica ZAMKNIĘTA względem
 * kontraktu backendu (`bay_templates.py`) — test sprawdza obie strony, więc
 * nowy kind w kontrakcie czerwieni się tutaj, zamiast po cichu zniknąć z pola.
 */
export const RODZAJ_Z_KIND_SZABLONU: Readonly<
  Record<BayDeviceTemplateWire['kind'], RodzajAparatuBom>
> = {
  CB: 'APARAT_GLOWNY',
  DS_BUS: 'ODLACZNIK_SZYNOWY',
  DS_LINE: 'ODLACZNIK_LINIOWY',
  ES: 'UZIEMNIK',
  CT: 'PRZEKLADNIK_PRADOWY',
  VT: 'PRZEKLADNIK_NAPIECIOWY',
  FUSE: 'BEZPIECZNIK',
  SURGE_ARRESTER: 'OGRANICZNIK_PRZEPIEC',
  CABLE_HEAD: 'GLOWICA_KABLOWA',
  TRANSFORMER_DEVICE: 'TRANSFORMATOR',
};

/**
 * `BayDeviceInstanceTemplate.apparatus_kind` → rodzaj kanoniczny.
 *
 * `null` = pozycja NIE JEST aparatem rysowanym w polu; lista jest jawna i
 * uzasadniona, bo „nic nie rysujemy" musi być decyzją, nie przeoczeniem:
 *  · `busbar` — to SZYNA rozdzielnicy, rysuje ją rozdzielnica, nie pole,
 *  · `bus_coupler` — to ROLA pola (sprzęgło), nie osobny aparat w jego kolumnie,
 *  · `interlock` — blokada ruchowa: reguła eksploatacyjna, nie aparat na torze.
 */
export const RODZAJ_Z_KIND_INSTANCJI: Readonly<
  Record<BayDeviceInstanceWire['apparatus_kind'], RodzajAparatuBom | null>
> = {
  circuit_breaker: 'APARAT_GLOWNY',
  switch_disconnector: 'APARAT_GLOWNY',
  disconnector_busbar: 'ODLACZNIK_SZYNOWY',
  disconnector_line: 'ODLACZNIK_LINIOWY',
  earthing_switch: 'UZIEMNIK',
  fuse_set: 'BEZPIECZNIK',
  current_transformer: 'PRZEKLADNIK_PRADOWY',
  voltage_transformer: 'PRZEKLADNIK_NAPIECIOWY',
  surge_arrester: 'OGRANICZNIK_PRZEPIEC',
  cable_head: 'GLOWICA_KABLOWA',
  transformer: 'TRANSFORMATOR',
  voltage_indicator: 'WSKAZNIK_NAPIECIA',
  protection_relay: 'PRZEKAZNIK',
  meter: 'LICZNIK',
  lv_breaker: 'WYLACZNIK_NN',
  busbar: null,
  bus_coupler: null,
  interlock: null,
};

/** `BayDeviceTemplate.placement` → umiejscowienie kanoniczne. */
const UMIEJSCOWIENIE_Z_PLACEMENT: Readonly<
  Record<BayDeviceTemplateWire['placement'], UmiejscowienieBom>
> = {
  UPSTREAM: 'TOR',
  MIDSTREAM: 'TOR',
  DOWNSTREAM: 'TOR',
  GROUND_BRANCH: 'ZIEMIA',
  OFF_PATH: 'BOCZNE',
};

/** `BayDeviceInstanceTemplate.electrical_side` → umiejscowienie kanoniczne. */
const UMIEJSCOWIENIE_Z_STRONY: Readonly<
  Record<NonNullable<BayDeviceInstanceWire['electrical_side']>, UmiejscowienieBom>
> = {
  busbar_side: 'TOR',
  line_side: 'TOR',
  transformer_side: 'TOR',
  lv_side: 'TOR',
  earthing_branch: 'ZIEMIA',
  metering_branch: 'BOCZNE',
};

/**
 * Rodzaje, które z natury nie stoją w torze mocy — niezależnie od tego, co
 * deklaruje `electrical_side`/`placement` szablonu.
 *
 * Predykat jest JEDEN (reguła KLASA §3): tego samego używa normalizacja obu
 * źródeł i wyrocznia sceny, więc przekaźnik nie może raz trafić na tor, a raz
 * obok niego, zależnie od tego, którym adapterem wszedł.
 */
const POZA_TOREM: Readonly<Record<RodzajAparatuBom, UmiejscowienieBom | null>> = {
  APARAT_GLOWNY: null,
  ODLACZNIK_SZYNOWY: null,
  ODLACZNIK_LINIOWY: null,
  UZIEMNIK: 'ZIEMIA',
  PRZEKLADNIK_PRADOWY: null,
  PRZEKLADNIK_NAPIECIOWY: 'BOCZNE',
  BEZPIECZNIK: null,
  OGRANICZNIK_PRZEPIEC: 'ZIEMIA',
  GLOWICA_KABLOWA: null,
  TRANSFORMATOR: null,
  WSKAZNIK_NAPIECIA: 'BOCZNE',
  PRZEKAZNIK: 'ADNOTACJA',
  LICZNIK: 'ADNOTACJA',
  WYLACZNIK_NN: null,
};

function umiejscowienie(rodzaj: RodzajAparatuBom, zrodla: UmiejscowienieBom): UmiejscowienieBom {
  return POZA_TOREM[rodzaj] ?? zrodla;
}

// ---------------------------------------------------------------------------
// Mapowanie rodzaj → symbol kanonu IEC (`ui/sld/v3/symbols`)
// ---------------------------------------------------------------------------

/**
 * INWENTARZ MAPOWAŃ aparat → symbol kanonu. Każdy rodzaj BOM ma symbol; brak
 * symbolu w kanonie zamyka się DOROBIENIEM GLIFU W KANONIE (tak powstały `fuse`
 * — bezpiecznik sam, bo kanon miał wyłącznie rozłącznik z bezpiecznikiem — oraz
 * `voltageIndicator` dla VPIS), nigdy podstawieniem symbolu podobnego.
 *
 * `APARAT_GLOWNY` ma tu wartość DOMYŚLNĄ: rzeczywisty symbol wynika z pozycji
 * katalogu APARAT_SN wskazanej przez projektanta (`SYMBOL_RODZAJU_APARATU`),
 * bo to ona rozstrzyga, czy pole jest wyłącznikowe, rozłącznikowe, reklozerowe
 * czy switch-fuse. Bez wskazania aparatu pole zostaje BEZ symbolu łącznika —
 * uczciwy brak, nigdy podstawiony wyłącznik.
 */
export const SYMBOL_RODZAJU_BOM: Readonly<Record<RodzajAparatuBom, SymbolId>> = {
  APARAT_GLOWNY: 'breaker',
  ODLACZNIK_SZYNOWY: 'disconnector',
  ODLACZNIK_LINIOWY: 'disconnector',
  UZIEMNIK: 'earthSwitch',
  PRZEKLADNIK_PRADOWY: 'currentTransformer',
  PRZEKLADNIK_NAPIECIOWY: 'voltageTransformer',
  BEZPIECZNIK: 'fuse',
  OGRANICZNIK_PRZEPIEC: 'surgeArrester',
  GLOWICA_KABLOWA: 'cableHead',
  TRANSFORMATOR: 'transformer2W',
  WSKAZNIK_NAPIECIA: 'voltageIndicator',
  PRZEKAZNIK: 'protectionRelay',
  LICZNIK: 'meter',
  WYLACZNIK_NN: 'breaker',
};

/**
 * `device_kind` katalogu APARAT_SN → symbol kanoniczny biblioteki v3.
 *
 * Tablica jest ZAMKNIĘTA względem słownika rodzajów aparatu kreatora
 * (`ETYKIETY_RODZAJU_APARATU` w `stacjaModel.ts`) — pilnuje tego test
 * kontraktowy: każdy rodzaj, który kreator umie NAZWAĆ w pickerze, musi mieć
 * symbol, inaczej projektant zobaczyłby pusty tor dla aparatu, który wybrał.
 * Rodzaj spoza słownika (nowa pozycja katalogu bez etykiety) daje `null` = tor
 * bez symbolu — uczciwy brak, nigdy podstawiony wyłącznik.
 */
export const SYMBOL_RODZAJU_APARATU: Readonly<Record<string, SymbolId>> = {
  WYLACZNIK: 'breaker',
  REKLOZER: 'recloser',
  ROZLACZNIK: 'loadBreakSwitch',
  ROZLACZNIK_BEZPIECZNIKOWY: 'fuseSwitch',
  ODLACZNIK: 'disconnector',
  UZIEMNIK: 'earthSwitch',
};

export function symbolRodzajuAparatu(deviceKind: string | null | undefined): SymbolId | null {
  if (!deviceKind) return null;
  return SYMBOL_RODZAJU_APARATU[deviceKind] ?? null;
}

/** Rodzaje aparatu, które kreator umie nazwać — wejście testu kompletności. */
export const RODZAJE_APARATU_KREATORA: readonly string[] = Object.keys(ETYKIETY_RODZAJU_APARATU);

// ---------------------------------------------------------------------------
// Budowa BOM pola
// ---------------------------------------------------------------------------

/**
 * Wejście budowy BOM POLA (instancji, nie szablonu): katalogowa kompozycja
 * rodziny + jawne wybory projektanta. To odpowiednik `FieldInstance.zbuduj_bom()`
 * z kanonu §3: instancja NIE dubluje parametrów katalogu, dokłada wyłącznie to,
 * co projektant realnie wskazał.
 */
export interface WejscieBomPola {
  /** Kompletny szablon pola rodziny (`/api/catalog/complete-bay-templates`). */
  readonly szablon: CompleteMvBayTemplateSummary | null;
  /**
   * Projektant wskazał APARAT GŁÓWNY pola (pozycja katalogu APARAT_SN).
   *
   * REGUŁA JEST LUSTREM BACKENDU (`bay_templates.template_primary_devices`,
   * parametr `main_apparatus_kind`): wskazanie z formularza NADPISUJE pozycję
   * aparatu głównego kompozycji (`CB` układu kanonicznego), a nie dokłada
   * nowego aparatu. Pole, którego kompozycja aparatu głównego nie ma (pomiarowe
   * — tor przekładników napięciowych; potrzeb własnych — odłącznik z
   * bezpiecznikiem), zostaje przy swoim składzie: dorysowanie łącznika, którego
   * karta katalogowa nie przewiduje, byłoby fabrykacją.
   *
   * Wyjątek nazwany: pole BEZ dobranego pakietu katalogowego nie ma żadnej
   * kompozycji — wtedy wskazany aparat JEST całą kompozycją, jaką projekt na
   * dziś zna, i bez niego rysunek gubiłby dokonany wybór.
   */
  readonly maAparatGlowny?: boolean;
  /** Referencje wyposażenia z kroku „Pomiar i zabezpieczenia" (`equipment`). */
  readonly maCt?: boolean;
  readonly maVt?: boolean;
  readonly maPrzekaznik?: boolean;
  /**
   * Pole zasila TRANSFORMATOR STACJI. To dana projektu, nie opcja pola: stacja
   * SN/nN tworzy transformator własną operacją domenową i przyłącza go polem
   * transformatorowym, więc transformator należy do BOM tego pola niezależnie
   * od tego, czy karta katalogowa rodziny wymienia go w kompozycji celki
   * (rodziny RMU wymieniają, rodziny pól wyłącznikowych zwykle nie — bo tam
   * transformator stoi POZA rozdzielnicą). Gdy kompozycja już go niesie,
   * pozycja NIE jest dokładana drugi raz.
   */
  readonly maTransformator?: boolean;
}

/** Kanoniczne oznaczenia pozycji dokładanych przez wyposażenie pola. */
const OZNACZENIE_WYPOSAZENIA: Readonly<
  Record<'APARAT' | 'CT' | 'VT' | 'RELAY' | 'TR', string>
> = {
  // Lustro oznaczeń kanonicznego szablonu pola (`bay_templates.py`): aparat
  // główny Q0, przekładnik prądowy T1, napięciowy T2, transformator pola TR —
  // te same litery, co na schemacie wykonawczym.
  APARAT: 'Q0',
  CT: 'T1',
  VT: 'T2',
  RELAY: 'F',
  TR: 'TR',
};

/**
 * Pozycje w kolumnie pola dla wyposażenia dołożonego POZA kompozycją rodziny.
 * Kolejność toru jest kanonem (§5): przekładnik prądowy stoi ZA aparatem
 * głównym i PRZED odłącznikiem liniowym, przekładnik napięciowy jest bocznym
 * odgałęzieniem pomiarowym. Liczby dobrane tak, by wpaść między pozycje szablonu
 * (CB=1, DS_LINE=3), a nie doklejać się na koniec kolumny.
 */
const POZYCJA_WYPOSAZENIA: Readonly<
  Record<'APARAT' | 'CT' | 'VT' | 'RELAY' | 'TR', number>
> = {
  // Aparat główny stoi tam, gdzie w układzie kanonicznym (za odłącznikiem
  // szynowym, przed przekładnikiem) — pozycja 1, jak `CB` szablonu.
  APARAT: 1,
  CT: 2,
  VT: 2.5,
  RELAY: -1,
  // Transformator zamyka tor pola — za wszystkimi aparatami celki (najdalsza
  // pozycja kanonicznych szablonów to 6, pole źródłowe PV).
  TR: 100,
};

function pozycjeSzablonu(szablon: CompleteMvBayTemplateSummary): PozycjaBom[] {
  const instancje = szablon.device_instances ?? [];
  // Kompozycja PRODUCENTA ma pierwszeństwo, gdy szablon ją niesie: jest bogatsza
  // (VPIS, przekaźnik, licznik) i opisuje konkretne pole katalogowe. Gdy jest
  // pusta — obowiązuje kanoniczny układ aparatury szablonu. JEDNO źródło na
  // rysunek: nigdy suma obu (ten sam aparat wszedłby dwa razy).
  if (instancje.length > 0) {
    const wynik: PozycjaBom[] = [];
    for (const instancja of instancje) {
      const rodzaj = RODZAJ_Z_KIND_INSTANCJI[instancja.apparatus_kind] ?? null;
      if (rodzaj === null) continue;
      const strona = instancja.electrical_side ?? 'line_side';
      wynik.push({
        rodzaj,
        oznaczenie: instancja.label,
        pozycja: instancja.position_in_bay ?? 0,
        umiejscowienie: umiejscowienie(rodzaj, UMIEJSCOWIENIE_Z_STRONY[strona]),
        opcjonalny: instancja.is_optional === true,
        zrodlo: 'producent',
      });
    }
    return wynik;
  }
  return (szablon.base_template?.devices ?? []).map((device) => {
    const rodzaj = RODZAJ_Z_KIND_SZABLONU[device.kind];
    return {
      rodzaj,
      oznaczenie: device.designation_q,
      pozycja: device.position,
      umiejscowienie: umiejscowienie(rodzaj, UMIEJSCOWIENIE_Z_PLACEMENT[device.placement]),
      opcjonalny: device.optional === true,
      zrodlo: 'szablon' as const,
    };
  });
}

/**
 * BOM POLA — kompozycja katalogowa rodziny + wyposażenie wskazane w kreatorze.
 *
 * Wyposażenie WIĄŻE SIĘ z pozycją kompozycji, gdy rodzina taką pozycję ma
 * (wskazanie przekładnika prądowego dla pola, które już go w składzie ma, to
 * dobór pozycji katalogowej, a NIE drugi przekładnik). Gdy rodzina pozycji nie
 * ma — wyposażenie wchodzi jako pozycja własna instancji pola, bo projektant
 * realnie ją zamówił; jej źródło (`wyposazenie`) zostaje jawne, żeby opis pola
 * mógł ją odróżnić od wyposażenia fabrycznego.
 *
 * Kolejność: rosnąco po pozycji, a przy równej pozycji — stabilnie po kolejności
 * wejścia. Determinizm jest wymogiem (te same dane ⇒ ten sam rysunek).
 */
export function zbudujBomPola(wejscie: WejscieBomPola): PozycjaBom[] {
  const {
    szablon,
    maAparatGlowny = false,
    maCt = false,
    maVt = false,
    maPrzekaznik = false,
    maTransformator = false,
  } = wejscie;
  const pozycje: PozycjaBom[] = szablon ? pozycjeSzablonu(szablon) : [];
  const ma = (rodzaj: RodzajAparatuBom): boolean => pozycje.some((p) => p.rodzaj === rodzaj);
  /** Czy pole ma w ogóle kompozycję katalogową (dobrany pakiet rodziny). */
  const zKompozycji = pozycje.length > 0;

  if (maAparatGlowny && !ma('APARAT_GLOWNY') && !zKompozycji) {
    pozycje.push({
      rodzaj: 'APARAT_GLOWNY',
      oznaczenie: OZNACZENIE_WYPOSAZENIA.APARAT,
      pozycja: POZYCJA_WYPOSAZENIA.APARAT,
      umiejscowienie: 'TOR',
      opcjonalny: false,
      zrodlo: 'wyposazenie',
    });
  }
  if (maCt && !ma('PRZEKLADNIK_PRADOWY')) {
    pozycje.push({
      rodzaj: 'PRZEKLADNIK_PRADOWY',
      oznaczenie: OZNACZENIE_WYPOSAZENIA.CT,
      pozycja: POZYCJA_WYPOSAZENIA.CT,
      umiejscowienie: 'TOR',
      opcjonalny: true,
      zrodlo: 'wyposazenie',
    });
  }
  if (maVt && !ma('PRZEKLADNIK_NAPIECIOWY')) {
    pozycje.push({
      rodzaj: 'PRZEKLADNIK_NAPIECIOWY',
      oznaczenie: OZNACZENIE_WYPOSAZENIA.VT,
      pozycja: POZYCJA_WYPOSAZENIA.VT,
      umiejscowienie: 'BOCZNE',
      opcjonalny: true,
      zrodlo: 'wyposazenie',
    });
  }
  if (maTransformator && !ma('TRANSFORMATOR')) {
    pozycje.push({
      rodzaj: 'TRANSFORMATOR',
      oznaczenie: OZNACZENIE_WYPOSAZENIA.TR,
      pozycja: POZYCJA_WYPOSAZENIA.TR,
      umiejscowienie: 'TOR',
      opcjonalny: false,
      zrodlo: 'wyposazenie',
    });
  }
  if (maPrzekaznik && !ma('PRZEKAZNIK')) {
    pozycje.push({
      rodzaj: 'PRZEKAZNIK',
      oznaczenie: OZNACZENIE_WYPOSAZENIA.RELAY,
      pozycja: POZYCJA_WYPOSAZENIA.RELAY,
      umiejscowienie: 'ADNOTACJA',
      opcjonalny: true,
      zrodlo: 'wyposazenie',
    });
  }

  return pozycje
    .map((pozycja, indeks) => ({ pozycja, indeks }))
    .sort((a, b) => a.pozycja.pozycja - b.pozycja.pozycja || a.indeks - b.indeks)
    .map((w) => w.pozycja);
}

// ---------------------------------------------------------------------------
// TERMINALE ELEKTRYCZNE
// ---------------------------------------------------------------------------

/**
 * Terminal elektryczny pozycji BOM — CZEGO pozycja dotyka. To ogniwo potoku
 * między BOM a geometrią: rysunek nie decyduje „gdzie postawić kreskę" na
 * podstawie roli pola, tylko na podstawie tego, co pozycja realnie łączy.
 */
export type TerminalPola = 'SZYNA' | 'TOR' | 'ZIEMIA' | 'ODGALEZIENIE' | 'STRONA_NN' | 'BRAK';

export interface TerminalePozycji {
  readonly pozycja: PozycjaBom;
  /** Terminal od strony szyny (górny). */
  readonly gora: TerminalPola;
  /** Terminal od strony wyprowadzenia (dolny). */
  readonly dol: TerminalPola;
}

/**
 * Terminale pozycji BOM. Pierwsza pozycja toru wisi na SZYNIE, ostatnia
 * wyprowadza pole (kabel albo strona nN transformatora), uziemnik i ogranicznik
 * schodzą do ZIEMI, tor pomiarowy kończy się na odgałęzieniu.
 */
export function terminalePola(bom: readonly PozycjaBom[]): TerminalePozycji[] {
  const tor = bom.filter((p) => p.umiejscowienie === 'TOR');
  return bom.map((pozycja) => {
    if (pozycja.umiejscowienie === 'ZIEMIA') {
      return { pozycja, gora: 'TOR' as const, dol: 'ZIEMIA' as const };
    }
    if (pozycja.umiejscowienie === 'BOCZNE') {
      return { pozycja, gora: 'TOR' as const, dol: 'ODGALEZIENIE' as const };
    }
    if (pozycja.umiejscowienie === 'ADNOTACJA') {
      return { pozycja, gora: 'BRAK' as const, dol: 'BRAK' as const };
    }
    const pierwszy = tor[0] === pozycja;
    const ostatni = tor[tor.length - 1] === pozycja;
    const dol: TerminalPola = !ostatni
      ? 'TOR'
      : pozycja.rodzaj === 'TRANSFORMATOR'
        ? 'STRONA_NN'
        : 'TOR';
    return { pozycja, gora: pierwszy ? ('SZYNA' as const) : ('TOR' as const), dol };
  });
}

// ---------------------------------------------------------------------------
// Stałe rysunku (px świata; viewBox skaluje się do szerokości panelu)
// ---------------------------------------------------------------------------

/** Klasy typograficzne kanonu użyte w podglądzie (hierarchia: rola > aparat). */
export const KLASA_ROLI = 't3' as const;
export const KLASA_APARATU = 't4' as const;
/**
 * Oznaczenia Q przy symbolach — klasa `t4` kanonu, opisana w nim wprost jako
 * „adnotacje i oznaczniki aparatu (Q/QE/T/F)". Osobna stała, bo to inna ROLA
 * pisma niż opis pola pod rysunkiem, choć dziś obie klasy mają ten sam rozmiar:
 * gdyby kanon je rozjechał, oznaczenia mają iść za oznacznikami aparatu.
 */
export const KLASA_OZNACZENIA = 't4' as const;

export const FONT_ROLI = LABEL_TYPOGRAPHY[KLASA_ROLI].fontSize;
export const FONT_APARATU = LABEL_TYPOGRAPHY[KLASA_APARATU].fontSize;
export const FONT_OZNACZENIA = LABEL_TYPOGRAPHY[KLASA_OZNACZENIA].fontSize;

/**
 * POWIĘKSZENIE SYMBOLU względem gabarytu kanonicznego.
 *
 * Kanon v3 dobiera gabaryty (16/24/32 px świata) do kanwy CAŁEJ sieci, gdzie w
 * kadrze stoją dziesiątki stacji. Tu w kadrze stoi JEDNA rozdzielnica na całą
 * szerokość panelu, a szerokość slotu dyktuje TEKST (nazwa katalogowa aparatu
 * ma ~100 px świata) — przy skali 1:1 wyłącznik 16 px byłby plamką obok
 * własnego podpisu. Mnożnik 1,5: kolumna pola niesie teraz PEŁNY skład aparatów
 * (5–6 symboli jeden pod drugim zamiast jednego), więc powiększenie z czasów
 * rysunku jednoaparatowego (1,8) wypychało kolumnę poza kadr panelu.
 *
 * Skalowanie jest JEDNORODNE (rysunek i miejsce, które zajmuje, liczone przez
 * `wymiarSymbolu`) — glify zostają nietknięte, żadnej kopii geometrii kanonu.
 */
export const SKALA_SYMBOLU = 1.5;

/** Gabaryt symbolu W TYM rysunku (kanon × powiększenie) — jedna prawda. */
export function wymiarSymbolu(id: SymbolId): { szerokosc: number; wysokosc: number } {
  const def = SYMBOL_DEFS[id];
  return { szerokosc: def.width * SKALA_SYMBOLU, wysokosc: def.height * SKALA_SYMBOLU };
}

/** Pionowa budowa pola: zejście od szyny, odstępy między aparatami. */
const ZEJSCIE_OD_SZYNY = 14;
const ODSTEP_APARATOW = 8;
const ZEJSCIE_KONCOWE = 14;
/** Zejście strony nN pod transformatorem (kreska + poprzeczka nN). */
const ZEJSCIE_NN = 16;
/** Prześwit między dolną krawędzią tabeli pól a szyną (miejsce na opis szyny). */
export const ODSTEP_TABELA_SZYNA = 20;
/** Rozstaw nóg sprzęgła (przerwa szyny) — połowa szerokości „U" łącznika szyn. */
export const POLOWA_SPRZEGLA = 22;
/**
 * Prześwit między kolumnami pola (tor ↔ odgałęzienie ↔ adnotacja).
 *
 * Odsunięcie NIE jest stałą liczbą pikseli, tylko liczy się z GABARYTÓW tego, co
 * w danym polu stoi (`kolumnyPola`): transformator ma 32 j.św. szerokości wobec
 * 16 j.św. wyłącznika, więc odsunięcie dobre dla pola liniowego wsadzało
 * uziemnik w uzwojenia transformatora. Wyrocznia `kolizjeSymboliPola` złapała to
 * na kompozycji SafeRing TR i na polu z pełnym wyposażeniem — dlatego warunek
 * układu i warunek kontroli pochodzą tu z JEDNEGO źródła (reguła KLASA §3).
 */
const PRZESWIT_KOLUMN = 6;
/** Odstęp oznaczenia Q od krawędzi symbolu. */
const ODSTEP_OZNACZENIA = 3;
/** Poprzeczka strony nN — połowa jej szerokości. */
const POLOWA_KRESKI_NN = 9;

/** Grubości kresek (hierarchia rysunku wykonawczego: szyna > tor > aparat). */
export const GRUBOSC_SZYNY = 3.2;
export const GRUBOSC_TORU = 1.4;

// ---------------------------------------------------------------------------
// SCENA POLA
// ---------------------------------------------------------------------------

/** Symbol sceny wraz z pozycją (origin = lewy górny róg bboxa) i oznaczeniem. */
export interface SymbolSceny {
  readonly id: SymbolId;
  readonly x: number;
  readonly y: number;
  /** Oznaczenie operatorskie rysowane przy symbolu (Q1/Q0/T1/GK/TR…). */
  readonly oznaczenie: string;
  readonly rodzaj: RodzajAparatuBom;
  readonly umiejscowienie: UmiejscowienieBom;
  /** `true` = symbol poza torem głównym (odgałęzienie, adnotacja). */
  readonly boczny: boolean;
}

export type OdcinekToru = readonly [number, number, number, number];

/** Strefa przedziału kablowego pola — obwiednia, nie aparat. */
export interface StrefaKablowa {
  readonly x: number;
  readonly y: number;
  readonly szerokosc: number;
  readonly wysokosc: number;
}

export interface ScenaPola {
  readonly symbole: readonly SymbolSceny[];
  readonly tor: readonly OdcinekToru[];
  /**
   * Przedział kablowy — strefa zakończenia kablowego pola. Rysowana WYŁĄCZNIE
   * gdy kompozycja pola niesie głowicę kablową: przedział bez głowicy byłby
   * obwiednią wokół niczego.
   */
  readonly strefaKablowa: StrefaKablowa | null;
  /** Poprzeczka strony nN pod transformatorem (para x) albo `null`. */
  readonly kreskaNn: readonly [number, number, number] | null;
  /** Dolna krawędź rysunku pola [px świata]. */
  readonly dol: number;
  /** Przerwa szyny wymuszona przez pole sprzęgłowe (para x) albo `null`. */
  readonly przerwa: readonly [number, number] | null;
  /**
   * `true` = tor kończy się wyprowadzeniem (pole liniowe/odgałęźne) — podlega
   * wyrównaniu zejść. Pole transformatorowe i sprzęgłowe mają zakończenie z
   * topologii (transformator / powrót na szynę) i wyrównaniu NIE podlegają.
   */
  readonly zejscieOtwarte: boolean;
}

export interface OpcjeScenyPola {
  /** Y osi szyny zbiorczej [px świata]. */
  readonly szynaY: number;
  /**
   * Symbol aparatu GŁÓWNEGO z katalogu APARAT_SN. `null` = projektant go nie
   * wskazał — pozycja `APARAT_GLOWNY` zostaje wtedy PUSTYM odcinkiem toru
   * (brak widoczny jako brak, nigdy podstawiony wyłącznik).
   */
  readonly symbolAparatuGlownego: SymbolId | null;
  /** Pole sprzęgłowe — tor wraca na szynę, a szyna dostaje przerwę. */
  readonly sprzeglo?: boolean;
}

/**
 * SCENA POLA z BOM. Tor pionowy powstaje w KOLEJNOŚCI POZYCJI aparatów:
 * szyna → aparaty toru → (przedział kablowy → głowica → kabel) → transformator
 * → kreska strony nN. Uziemnik i ogranicznik schodzą bocznym odgałęzieniem do
 * ziemi, przekładnik napięciowy i wskaźnik napięcia — bocznym odgałęzieniem
 * pomiarowym, przekaźnik i licznik stoją jako adnotacja obok toru.
 *
 * Współrzędne są WZGLĘDEM OSI SLOTU (dx), więc scena jest przesuwalna bez
 * przeliczania: rozdzielnica rozstawia pola, pole nie wie, gdzie stoi.
 */
export function zbudujScenePola(
  bom: readonly PozycjaBom[],
  opcje: OpcjeScenyPola,
): ScenaPola {
  const { szynaY, symbolAparatuGlownego, sprzeglo = false } = opcje;
  const os = sprzeglo ? -POLOWA_SPRZEGLA : 0;
  const symbole: SymbolSceny[] = [];
  const tor: OdcinekToru[] = [];
  const terminale = terminalePola(bom);

  let y = szynaY;
  let strefaKablowa: StrefaKablowa | null = null;
  let kreskaNn: readonly [number, number, number] | null = null;

  const symbolPozycji = (pozycja: PozycjaBom): SymbolId | null =>
    pozycja.rodzaj === 'APARAT_GLOWNY' ? symbolAparatuGlownego : SYMBOL_RODZAJU_BOM[pozycja.rodzaj];

  /**
   * KOLUMNY POLA — osie odgałęzień policzone z gabarytów aparatów TEGO pola.
   * Kolejno od osi toru: kolumna toru (najszerszy aparat w torze), kolumna
   * ziemi (uziemnik, ogranicznik) w lewo, kolumna pomiarowa (przekładnik
   * napięciowy, VPIS) w prawo, kolumna adnotacji (przekaźnik, licznik) w lewo
   * ZA kolumną ziemi — dzięki temu żadne dwie kolumny nie mogą się nałożyć
   * niezależnie od tego, jak szerokie aparaty zniesie kompozycja.
   */
  const szerokosciRodzaju = (u: UmiejscowienieBom): number[] =>
    bom
      .filter((p) => p.umiejscowienie === u)
      .map((p) => {
        const id = symbolPozycji(p);
        return id ? wymiarSymbolu(id).szerokosc : wymiarSymbolu('breaker').szerokosc;
      });
  const maks = (wartosci: number[]): number => (wartosci.length > 0 ? Math.max(...wartosci) : 0);
  const polowaToru = Math.max(
    maks(szerokosciRodzaju('TOR')) / 2,
    wymiarSymbolu('breaker').szerokosc / 2,
  );
  const szerZiemi = maks(szerokosciRodzaju('ZIEMIA'));
  const szerBocznych = maks(szerokosciRodzaju('BOCZNE'));
  const szerAdnotacji = maks(szerokosciRodzaju('ADNOTACJA'));
  const osZiemi = os - (polowaToru + PRZESWIT_KOLUMN + szerZiemi / 2);
  const osBoczna = os + (polowaToru + PRZESWIT_KOLUMN + szerBocznych / 2);
  const osAdnotacji =
    os - (polowaToru + PRZESWIT_KOLUMN + szerZiemi + PRZESWIT_KOLUMN + szerAdnotacji / 2);

  const dolacz = (
    id: SymbolId,
    pozycja: PozycjaBom,
    dx: number,
    yGorne: number,
  ): number => {
    const wym = wymiarSymbolu(id);
    symbole.push({
      id,
      x: dx - wym.szerokosc / 2,
      y: yGorne,
      oznaczenie: pozycja.oznaczenie,
      rodzaj: pozycja.rodzaj,
      umiejscowienie: pozycja.umiejscowienie,
      boczny: pozycja.umiejscowienie !== 'TOR',
    });
    return wym.wysokosc;
  };

  // Zejście od szyny — wspólne dla każdego pola, także pustego (rozdzielnica
  // zawsze pokazuje, że pole od szyny odchodzi).
  tor.push([os, y, os, y + ZEJSCIE_OD_SZYNY]);
  y += ZEJSCIE_OD_SZYNY;

  const naTorze = terminale.filter((t) => t.pozycja.umiejscowienie === 'TOR');
  const yAdnotacji = y;

  for (const terminal of terminale) {
    const { pozycja } = terminal;
    const id = symbolPozycji(pozycja);

    if (pozycja.umiejscowienie === 'ADNOTACJA') {
      // Adnotacja NIE uczestniczy w ciągłości elektrycznej — stoi obok toru,
      // na wysokości pierwszego aparatu pola (tam, gdzie na schemacie
      // wykonawczym stoi opis funkcji zabezpieczeniowej).
      if (id) dolacz(id, pozycja, osAdnotacji, yAdnotacji);
      continue;
    }

    if (pozycja.umiejscowienie === 'ZIEMIA') {
      // Odgałęzienie DO ZIEMI — w LEWO od osi toru. Uziemnik pola jest osobnym
      // aparatem, nie stanem toru: rysunek ma pokazać, że tor da się uziemić.
      if (!id) continue;
      tor.push([os, y, osZiemi, y]);
      dolacz(id, pozycja, osZiemi, y);
      continue;
    }

    if (pozycja.umiejscowienie === 'BOCZNE') {
      // Odgałęzienie POMIAROWE/SYGNALIZACYJNE — w PRAWO od osi toru (przekładnik
      // napięciowy, wskaźnik obecności napięcia nie przewodzą prądu pola).
      if (!id) continue;
      tor.push([os, y, osBoczna, y]);
      dolacz(id, pozycja, osBoczna, y);
      continue;
    }

    // --- tor główny ---
    const ostatniNaTorze = naTorze[naTorze.length - 1]?.pozycja === pozycja;
    const pierwszyNaTorze = naTorze[0]?.pozycja === pozycja;
    if (!pierwszyNaTorze) {
      tor.push([os, y, os, y + ODSTEP_APARATOW]);
      y += ODSTEP_APARATOW;
    }

    if (pozycja.rodzaj === 'GLOWICA_KABLOWA' && id) {
      // Przedział kablowy: strefa zakończenia kablowego pola, obejmująca głowicę.
      const wym = wymiarSymbolu(id);
      const margines = 5;
      strefaKablowa = {
        x: os - wym.szerokosc / 2 - margines,
        y: y - margines,
        szerokosc: wym.szerokosc + 2 * margines,
        wysokosc: wym.wysokosc + 2 * margines,
      };
    }

    if (!id) {
      // Pozycja bez symbolu (nierozstrzygnięty aparat główny) — sam tor przez
      // wysokość aparatu; miejsce zostaje puste, żeby brak był widoczny.
      const pustyOdcinek = wymiarSymbolu('breaker').wysokosc;
      tor.push([os, y, os, y + pustyOdcinek]);
      y += pustyOdcinek;
    } else {
      y += dolacz(id, pozycja, os, y);
    }

    if (ostatniNaTorze && pozycja.rodzaj === 'TRANSFORMATOR') {
      // Strona nN transformatora: zejście + poprzeczka (wyprowadzenie 0,4 kV).
      tor.push([os, y, os, y + ZEJSCIE_NN]);
      y += ZEJSCIE_NN;
      kreskaNn = [os - POLOWA_KRESKI_NN, os + POLOWA_KRESKI_NN, y];
    }
  }

  if (sprzeglo) {
    // Sprzęgło = łącznik SZYN: tor schodzi z lewej sekcji, przechodzi przez
    // aparaty i wraca do prawej sekcji. Przerwa szyny nad polem jest częścią
    // symbolu — bez niej sprzęgło rysowałoby się jak zwykły odpływ.
    const prawa = POLOWA_SPRZEGLA;
    tor.push([os, y, os, y + ZEJSCIE_KONCOWE]);
    tor.push([os, y + ZEJSCIE_KONCOWE, prawa, y + ZEJSCIE_KONCOWE]);
    tor.push([prawa, y + ZEJSCIE_KONCOWE, prawa, szynaY]);
    y += ZEJSCIE_KONCOWE;
  } else if (kreskaNn === null) {
    tor.push([os, y, os, y + ZEJSCIE_KONCOWE]);
    y += ZEJSCIE_KONCOWE;
  }

  return {
    symbole,
    tor,
    strefaKablowa,
    kreskaNn,
    dol: y,
    przerwa: sprzeglo ? [-POLOWA_SPRZEGLA, POLOWA_SPRZEGLA] : null,
    zejscieOtwarte: !sprzeglo && kreskaNn === null,
  };
}

// ---------------------------------------------------------------------------
// WYROCZNIE (wejście testów kontraktowych)
// ---------------------------------------------------------------------------

/**
 * WYROCZNIA DWUSTRONNA BOM ↔ SCENA (dwa zakazy karty w jednym miejscu).
 * Pusta lista = scena rysuje DOKŁADNIE kompozycję pola:
 *  · każda pozycja BOM ma swój symbol (nic nie zniknęło),
 *  · każdy symbol sceny ma swoją pozycję BOM (nic nie zostało dorysowane).
 *
 * Wyjątek nazwany: pozycja `APARAT_GLOWNY` bez wskazanego aparatu katalogowego
 * NIE ma symbolu — to uczciwy brak wyboru projektanta, a nie zgubiony aparat;
 * wyrocznia rozpoznaje go po `symbolAparatuGlownego === null`.
 */
export function roznicaBomScena(
  bom: readonly PozycjaBom[],
  scena: ScenaPola,
  opcje: { readonly symbolAparatuGlownego: SymbolId | null },
): string[] {
  const bledy: string[] = [];
  const klucz = (rodzaj: RodzajAparatuBom, oznaczenie: string): string => `${rodzaj}|${oznaczenie}`;
  const wScenie = new Map<string, number>();
  for (const symbol of scena.symbole) {
    const k = klucz(symbol.rodzaj, symbol.oznaczenie);
    wScenie.set(k, (wScenie.get(k) ?? 0) + 1);
  }
  const wBom = new Map<string, number>();
  for (const pozycja of bom) {
    if (pozycja.rodzaj === 'APARAT_GLOWNY' && opcje.symbolAparatuGlownego === null) continue;
    const k = klucz(pozycja.rodzaj, pozycja.oznaczenie);
    wBom.set(k, (wBom.get(k) ?? 0) + 1);
  }
  for (const [k, ile] of wBom) {
    const wS = wScenie.get(k) ?? 0;
    if (wS < ile) bledy.push(`pozycja BOM „${k}" nie została narysowana (${wS}/${ile})`);
  }
  for (const [k, ile] of wScenie) {
    const wB = wBom.get(k) ?? 0;
    if (ile > wB) bledy.push(`symbol „${k}" narysowany bez pozycji w BOM (${ile}/${wB})`);
  }
  return bledy;
}

/**
 * WYROCZNIA CIĄGŁOŚCI TORU: kolejne aparaty toru głównego stoją w kolejności
 * POZYCJI BOM (od szyny w dół) i żaden nie wyprzedza swojego poprzednika.
 * Pusta lista = kolejność rysunku zgadza się z kolejnością kompozycji.
 */
export function bledyKolejnosciToru(bom: readonly PozycjaBom[], scena: ScenaPola): string[] {
  const bledy: string[] = [];
  const naTorze = bom.filter((p) => p.umiejscowienie === 'TOR');
  const yPozycji = (p: PozycjaBom): number | null => {
    const symbol = scena.symbole.find(
      (s) => s.rodzaj === p.rodzaj && s.oznaczenie === p.oznaczenie,
    );
    return symbol ? symbol.y : null;
  };
  let poprzedniY = -Infinity;
  let poprzednia: PozycjaBom | null = null;
  for (const pozycja of naTorze) {
    const y = yPozycji(pozycja);
    if (y === null) continue;
    if (y < poprzedniY) {
      bledy.push(
        `„${pozycja.oznaczenie}" (poz. ${pozycja.pozycja}) stoi WYŻEJ niż `
        + `„${poprzednia?.oznaczenie ?? '?'}" — kolejność toru niezgodna z BOM`,
      );
    }
    poprzedniY = y;
    poprzednia = pozycja;
  }
  return bledy;
}

/** Bbox symbolu sceny wraz z jego oznaczeniem (do wyroczni kolizji i zasięgu). */
function bboxSymbolu(symbol: SymbolSceny): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const wym = wymiarSymbolu(symbol.id);
  return {
    x1: symbol.x,
    y1: symbol.y,
    x2: symbol.x + wym.szerokosc,
    y2: symbol.y + wym.wysokosc,
  };
}

/**
 * WYROCZNIA KOLIZJI: dwa symbole tego samego pola nie mogą na siebie nachodzić.
 * Kolumna pola niesie teraz pełny skład aparatury i dwa odgałęzienia boczne, więc
 * „na oko się mieści" przestało wystarczać — deklaracja bez wyroczni byłaby
 * fałszywą pewnością (reguła KLASA §4).
 */
export function kolizjeSymboliPola(scena: ScenaPola): string[] {
  const kolizje: string[] = [];
  for (let i = 0; i < scena.symbole.length; i += 1) {
    for (let j = i + 1; j < scena.symbole.length; j += 1) {
      const a = bboxSymbolu(scena.symbole[i]);
      const b = bboxSymbolu(scena.symbole[j]);
      const nachodzi = a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
      if (nachodzi) {
        kolizje.push(
          `„${scena.symbole[i].oznaczenie}" × „${scena.symbole[j].oznaczenie}" nachodzą na siebie`,
        );
      }
    }
  }
  return kolizje;
}

/**
 * Zasięg poziomy sceny [dxMin, dxMax] — liczony Z TEJ SCENY (rysunek i miejsce,
 * które zajmuje, pochodzą z jednego źródła; reguła KLASA §3). Obejmuje symbole
 * WRAZ Z ICH OZNACZENIAMI, odcinki toru, strefę kablową, kreskę nN i przerwę
 * szyny — bo każdy z nich realnie zajmuje miejsce w slocie.
 */
export function zasiegSceny(scena: ScenaPola, os = 0): readonly [number, number] {
  // Oś pola należy do zasięgu z definicji (od niej odchodzi zejście od szyny),
  // dlatego jest ziarnem. `os` to ta sama liczba, o którą scenę przesunięto
  // (`przesunScene`) — dzięki temu wyrocznia mierzy scenę PRZED i PO
  // rozstawieniu tym samym wzorem, zamiast zakładać, że oś leży w zerze.
  let min = os;
  let max = os;
  for (const symbol of scena.symbole) {
    const bbox = bboxSymbolu(symbol);
    min = Math.min(min, bbox.x1);
    max = Math.max(max, bbox.x2);
    if (symbol.oznaczenie !== '') {
      const szerokosc = measureTextWidth(symbol.oznaczenie, FONT_OZNACZENIA);
      // Oznaczenie stoi po PRAWEJ stronie symbolu (poza adnotacją, która ma je
      // po lewej — patrz `pozycjaOznaczenia`).
      if (symbol.umiejscowienie === 'ADNOTACJA') min = Math.min(min, bbox.x1 - ODSTEP_OZNACZENIA - szerokosc);
      else max = Math.max(max, bbox.x2 + ODSTEP_OZNACZENIA + szerokosc);
    }
  }
  for (const [x1, , x2] of scena.tor) {
    min = Math.min(min, x1, x2);
    max = Math.max(max, x1, x2);
  }
  if (scena.strefaKablowa) {
    min = Math.min(min, scena.strefaKablowa.x);
    max = Math.max(max, scena.strefaKablowa.x + scena.strefaKablowa.szerokosc);
  }
  if (scena.kreskaNn) {
    min = Math.min(min, scena.kreskaNn[0]);
    max = Math.max(max, scena.kreskaNn[1]);
  }
  if (scena.przerwa) {
    min = Math.min(min, scena.przerwa[0]);
    max = Math.max(max, scena.przerwa[1]);
  }
  return [min, max];
}

/**
 * Punkt zaczepienia oznaczenia Q symbolu. Adnotacje mają oznaczenie po lewej
 * (stoją po lewej stronie toru), reszta po prawej — jedno miejsce rozstrzygania,
 * z którego korzysta i render, i wyrocznia zasięgu.
 */
export function pozycjaOznaczenia(symbol: SymbolSceny): {
  x: number;
  y: number;
  kotwica: 'start' | 'end';
} {
  const bbox = bboxSymbolu(symbol);
  const y = bbox.y1 + (bbox.y2 - bbox.y1) / 2 + FONT_OZNACZENIA / 3;
  if (symbol.umiejscowienie === 'ADNOTACJA') {
    return { x: bbox.x1 - ODSTEP_OZNACZENIA, y, kotwica: 'end' };
  }
  return { x: bbox.x2 + ODSTEP_OZNACZENIA, y, kotwica: 'start' };
}

/** Przesunięcie sceny na oś slotu — czyste, bez przeliczania geometrii. */
export function przesunScene(scena: ScenaPola, x: number): ScenaPola {
  return {
    ...scena,
    symbole: scena.symbole.map((s) => ({ ...s, x: s.x + x })),
    tor: scena.tor.map(([x1, y1, x2, y2]) => [x1 + x, y1, x2 + x, y2] as OdcinekToru),
    strefaKablowa: scena.strefaKablowa
      ? { ...scena.strefaKablowa, x: scena.strefaKablowa.x + x }
      : null,
    kreskaNn: scena.kreskaNn
      ? ([scena.kreskaNn[0] + x, scena.kreskaNn[1] + x, scena.kreskaNn[2]] as const)
      : null,
    przerwa: scena.przerwa ? ([scena.przerwa[0] + x, scena.przerwa[1] + x] as const) : null,
  };
}

/**
 * PODPIS STRUKTURY sceny — wejście snapshotów struktury (nie pikseli). Czyta
 * się jak spis aparatów pola: `Q1:disconnector>Q0:breaker>T1:currentTransformer`
 * dla toru, `[Q9:earthSwitch]` dla odgałęzień, `(F:protectionRelay)` dla adnotacji.
 */
export function podpisScenyPola(scena: ScenaPola): string {
  const czlon = (s: SymbolSceny): string => {
    const rdzen = `${s.oznaczenie}:${s.id}`;
    if (s.umiejscowienie === 'ZIEMIA' || s.umiejscowienie === 'BOCZNE') return `[${rdzen}]`;
    if (s.umiejscowienie === 'ADNOTACJA') return `(${rdzen})`;
    return rdzen;
  };
  const czesci = scena.symbole.map(czlon);
  if (scena.strefaKablowa) czesci.push('{przedzial-kablowy}');
  if (scena.kreskaNn) czesci.push('{strona-nn}');
  return czesci.join('>');
}
