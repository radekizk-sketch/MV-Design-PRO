/**
 * Kreator stacji SN/nN — MODEL PODGLĄDU pól rozdzielnicy SN (karta MINI-RMU-CAD).
 *
 * Czysta funkcja: konfiguracja formularza + odczyty katalogu → OPIS RYSUNKU
 * (sloty pól, symbole kanoniczne, etykiety, geometria). Zero fizyki, zero
 * obliczeń sieciowych — geometria to układ rysunku, a wszystkie liczby w
 * etykietach pochodzą 1:1 z pozycji katalogowych wskazanych w formularzu.
 *
 * DLACZEGO OSOBNY MODUŁ, A NIE RYSUNEK W KOMPONENCIE. Układ (szerokości slotów,
 * zawijanie etykiet, głębokości torów) jest TESTOWALNY tylko wtedy, gdy powstaje
 * bez DOM-u: testy kontraktowe mierzą bboxy etykiet i sprawdzają, że sąsiednie
 * pola się nie nachodzą. Defekt zgłoszony przez właściciela („etykiety ról
 * stykają się ze sobą") był niewykrywalny, bo szerokość slotu dawała stała `96`
 * w komponencie — niezależna od długości tekstu, który w tym slocie stoi.
 *
 * SZEROKOŚĆ SLOTU WYNIKA Z TEGO, CO W NIM STOI (reguła KLASA §3 — warunek
 * wejścia i wyjścia z jednego źródła). Rysunek pola powstaje NAJPIERW we
 * współrzędnych względem osi slotu, a szerokość slotu liczy się z ZASIĘGU TEGO
 * SAMEGO rysunku i z pomiaru TYCH SAMYCH etykiet, które zostaną narysowane.
 * Dwa niezależne wzory (jeden „ile miejsca zajmie", drugi „co narysować")
 * rozjechałyby się przy pierwszym nowym symbolu w polu.
 *
 * REUŻYCIE (zakaz równoległej biblioteki symboli — §0 pkt 4 karty):
 *  · symbole: `ui/sld/v3/symbols` (`SYMBOL_DEFS` + `SYMBOL_GLYPHS`) — ten sam
 *    kanon IEC 60617, który rysuje kanwa SLD; brakujący glif reklozera
 *    dorobiony W KANONIE (nie tutaj),
 *  · pomiar tekstu: `ui/sld/v3/core/text` (`measureTextWidth`, deterministyczna
 *    formuła bez DOM — jedna prawda dla renderu i dla testów),
 *  · zapis liczb: `liczbaRysunkuPl` z tego samego kanonu (przecinek dziesiętny).
 *
 * GRANICE DANYCH (nazwane, nie zgadywane — §0 pkt 3 karty). Podsumowanie
 * szablonu pola, którym dysponuje kreator (`CompleteMvBayTemplateSummary`),
 * niesie WYŁĄCZNIE `template_ref`/`bay_kind`/`bay_role`/`source_status`/
 * `source_refs`/`version`/`hash`. NIE niesie składu aparatury pola
 * (`BayTemplate.devices` backendu: DS_BUS/CB/CT/DS_LINE/ES wraz z oznaczeniami
 * Q0/Q1/Q2/Q9), więc podgląd NIE rysuje odłączników szynowych, uziemników ani
 * oznaczeń literowo-cyfrowych aparatów — rysowanie ich „bo zwykle są" byłoby
 * fabrykacją. Rysowane jest wyłącznie to, co projektant realnie wskazał: aparat
 * główny pola (katalog APARAT_SN), transformator stacji (katalog TRAFO_SN_NN)
 * oraz wyposażenie pola z kroku „Pomiar i zabezpieczenia" (CT/VT/przekaźnik).
 */

import { LABEL_TYPOGRAPHY, liczbaRysunkuPl, measureTextWidth } from '../../../ui/sld/v3/core/text';
import { SYMBOL_DEFS, type SymbolId } from '../../../ui/sld/v3/symbols/defs';
import {
  FIELD_ROLE_LABELS,
  SOURCE_STATUS_LABEL_PL,
  type SnFieldRole,
  type StationSnFieldTemplate,
} from '../../../ui/network-build/forms/InsertStationFormHelpers';
import type { MVApparatusCatalogType, TransformerType } from '../../../ui/catalog/types';
import { ETYKIETY_RODZAJU_APARATU, etykietaRodzajuAparatu } from './stacjaModel';
import { STACJA_STRINGS as T } from './strings';

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

// --- Stałe rysunku (px świata; viewBox skaluje się do szerokości panelu) ---

/** Klasy typograficzne kanonu użyte w podglądzie (hierarchia: rola > aparat). */
export const KLASA_ROLI = 't3' as const;
export const KLASA_APARATU = 't4' as const;

const FONT_ROLI = LABEL_TYPOGRAPHY[KLASA_ROLI].fontSize;
const FONT_APARATU = LABEL_TYPOGRAPHY[KLASA_APARATU].fontSize;
export const WYS_WIERSZA_ROLI = FONT_ROLI + 4;
export const WYS_WIERSZA_APARATU = FONT_APARATU + 4;

/** Marginesy rysunku i szerokości slotu pola. */
const MARGINES = 10;
const MAKS_TEKST = 104;
const MIN_SLOT = 92;
const ODDECH_SLOTU = 16;

/**
 * POWIĘKSZENIE SYMBOLU względem gabarytu kanonicznego.
 *
 * Kanon v3 dobiera gabaryty (16/24/32 px świata) do kanwy CAŁEJ sieci, gdzie w
 * kadrze stoją dziesiątki stacji. Tu w kadrze stoi JEDNA rozdzielnica na całą
 * szerokość panelu, a szerokość slotu dyktuje TEKST (nazwa katalogowa aparatu
 * ma ~100 px świata) — przy skali 1:1 wyłącznik 16 px byłby plamką obok
 * własnego podpisu, czyli dokładnie tą proporcją, którą właściciel ocenił na
 * 0/10. Mnożnik 1,8 daje korpus wyłącznika ~29 px świata wobec slotu ~110 px:
 * symbol czyta się jako główny element pola, a nie jako ozdobnik podpisu.
 *
 * Skalowanie jest JEDNORODNE (rysunek i miejsce, które zajmuje, liczone przez
 * `wymiarSymbolu`) — glify zostają nietknięte, żadnej kopii geometrii kanonu.
 */
export const SKALA_SYMBOLU = 1.8;

/** Gabaryt symbolu W TYM rysunku (kanon × powiększenie) — jedna prawda. */
export function wymiarSymbolu(id: SymbolId): { szerokosc: number; wysokosc: number } {
  const def = SYMBOL_DEFS[id];
  return { szerokosc: def.width * SKALA_SYMBOLU, wysokosc: def.height * SKALA_SYMBOLU };
}

/** Pionowa budowa pola: zejście od szyny, odstępy między aparatami. */
const ZEJSCIE_OD_SZYNY = 18;
const ODSTEP_APARATOW = 10;
const ZEJSCIE_KONCOWE = 16;
/** Prześwit między dolną krawędzią tabeli pól a szyną (miejsce na opis szyny). */
export const ODSTEP_TABELA_SZYNA = 20;
/** Rozstaw nóg sprzęgła (przerwa szyny) — połowa szerokości „U" łącznika szyn. */
const POLOWA_SPRZEGLA = 22;
/** Odsunięcie odgałęzień bocznych (VT) i adnotacji (przekaźnik) od osi toru. */
const ODSUNIECIE_BOCZNE = 26;

/** Grubości kresek (hierarchia rysunku wykonawczego: szyna > tor > aparat). */
export const GRUBOSC_SZYNY = 3.2;
export const GRUBOSC_TORU = 1.4;

// --- Wejście / wyjście modelu -------------------------------------------

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
}

/** Symbol rysowany w polu wraz z pozycją (origin = lewy górny róg bboxa). */
export interface SymbolNaTorze {
  readonly id: SymbolId;
  readonly x: number;
  readonly y: number;
  /** `true` = symbol poza torem głównym (odgałęzienie VT, adnotacja przekaźnika). */
  readonly boczny: boolean;
}

export type OdcinekToru = readonly [number, number, number, number];

export interface SlotPodgladu {
  readonly klucz: string;
  readonly numer: number;
  readonly rola: SnFieldRole;
  /** Oś slotu [px świata]. */
  readonly x: number;
  readonly szerokosc: number;
  /** Wiersze nagłówka tabeli pól (nazwa roli, zawinięta). */
  readonly wierszeRoli: readonly string[];
  /** Wiersze opisu pod polem (aparat, transformator, status pakietu). */
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
  readonly symbole: readonly SymbolNaTorze[];
  /** Odcinki toru pola — rysowane pod symbolami. */
  readonly tor: readonly OdcinekToru[];
  /** Dolna krawędź rysunku pola [px świata]. */
  readonly dol: number;
  /** Przerwa szyny wymuszona przez pole sprzęgłowe (para x) albo `null`. */
  readonly przerwaSzyny: readonly [number, number] | null;
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
    (_m, liczba: string, jednostka: string) => `${liczba}\u00a0${jednostka}`,
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

/** Rysunek pola we współrzędnych WZGLĘDEM osi slotu (dx) — przed rozstawieniem. */
interface PlanPola {
  readonly symbole: readonly SymbolNaTorze[];
  readonly tor: readonly OdcinekToru[];
  readonly dol: number;
  readonly przerwa: readonly [number, number] | null;
  /** `true` = tor kończy się wyprowadzeniem (pole liniowe/odgałęźne) — podlega
   *  wyrównaniu zejść. Pole transformatorowe i sprzęgłowe mają zakończenie z
   *  topologii (transformator / powrót na szynę) i wyrównaniu NIE podlegają. */
  readonly zejscieOtwarte: boolean;
}

/**
 * Rysunek JEDNEGO pola względem jego osi. Jedno miejsce, w którym rozstrzyga
 * się, co w polu stoi — zasięg poziomy tego rysunku (`zasiegPlanu`) jest potem
 * WYPROWADZANY z niego, a nie liczony drugim wzorem.
 */
function zaplanujPole(
  pole: StationSnFieldTemplate,
  aparat: MVApparatusCatalogType | null,
  szynaY: number,
): PlanPola {
  const sprzeglo = pole.field_role === 'SPRZEGLO';
  const os = sprzeglo ? -POLOWA_SPRZEGLA : 0;
  const symbole: SymbolNaTorze[] = [];
  const tor: OdcinekToru[] = [];
  let y = szynaY;

  const dolacz = (id: SymbolId, dx: number, boczny = false): number => {
    const wym = wymiarSymbolu(id);
    symbole.push({ id, x: dx - wym.szerokosc / 2, y, boczny });
    return wym.wysokosc;
  };

  tor.push([os, y, os, y + ZEJSCIE_OD_SZYNY]);
  y += ZEJSCIE_OD_SZYNY;

  const symbolAparatu = symbolRodzajuAparatu(aparat?.device_kind);
  if (symbolAparatu) {
    y += dolacz(symbolAparatu, os);
  } else {
    // Brak wskazanego aparatu: sam tor przez wysokość aparatu — miejsce
    // zostaje puste, żeby brak był widoczny, a nie zamaskowany domysłem.
    const pustyOdcinek = wymiarSymbolu('breaker').wysokosc;
    tor.push([os, y, os, y + pustyOdcinek]);
    y += pustyOdcinek;
  }

  // Wyposażenie pola wskazane w kroku „Pomiar i zabezpieczenia" (B-3).
  const equipment = pole.equipment;
  if (refWyposazenia(equipment, 'ct')) {
    tor.push([os, y, os, y + ODSTEP_APARATOW]);
    y += ODSTEP_APARATOW;
    y += dolacz('currentTransformer', os);
  }
  if (refWyposazenia(equipment, 'vt')) {
    // Tor pomiarowy napięciowy = odgałęzienie BOCZNE (VT nie stoi w torze mocy).
    const dxVt = os + ODSUNIECIE_BOCZNE;
    tor.push([os, y + ODSTEP_APARATOW, dxVt, y + ODSTEP_APARATOW]);
    y += ODSTEP_APARATOW;
    const wysokoscVt = dolacz('voltageTransformer', dxVt, true);
    y += wysokoscVt;
  }
  if (refWyposazenia(equipment, 'relay')) {
    // Przekaźnik = ADNOTACJA obok toru (nie uczestniczy w ciągłości elektrycznej
    // — ta sama zasada, co w kanonie SLD v3 §17.1).
    const wym = wymiarSymbolu('protectionRelay');
    symbole.push({
      id: 'protectionRelay',
      x: os - ODSUNIECIE_BOCZNE - wym.szerokosc / 2,
      y: szynaY + ZEJSCIE_OD_SZYNY,
      boczny: true,
    });
  }

  if (pole.field_role === 'TRANSFORMATOROWE') {
    tor.push([os, y, os, y + ODSTEP_APARATOW]);
    y += ODSTEP_APARATOW;
    y += dolacz('transformer2W', os);
    tor.push([os, y, os, y + ZEJSCIE_KONCOWE]);
    y += ZEJSCIE_KONCOWE;
  } else if (sprzeglo) {
    // Sprzęgło = łącznik SZYN: tor schodzi z lewej sekcji, przechodzi przez
    // aparat i wraca do prawej sekcji. Przerwa szyny nad polem jest częścią
    // symbolu — bez niej sprzęgło rysowałoby się jak zwykły odpływ.
    const prawa = POLOWA_SPRZEGLA;
    tor.push([os, y, os, y + ZEJSCIE_KONCOWE]);
    tor.push([os, y + ZEJSCIE_KONCOWE, prawa, y + ZEJSCIE_KONCOWE]);
    tor.push([prawa, y + ZEJSCIE_KONCOWE, prawa, szynaY]);
    y += ZEJSCIE_KONCOWE;
  } else {
    tor.push([os, y, os, y + ZEJSCIE_KONCOWE]);
    y += ZEJSCIE_KONCOWE;
  }

  return {
    symbole,
    tor,
    dol: y,
    przerwa: sprzeglo ? [-POLOWA_SPRZEGLA, POLOWA_SPRZEGLA] : null,
    zejscieOtwarte: !sprzeglo && pole.field_role !== 'TRANSFORMATOROWE',
  };
}

/**
 * Wyrównanie ZEJŚĆ pól o torze zakończonym wyprowadzeniem (liniowe, odgałęźne)
 * do wspólnego poziomu.
 *
 * Symbole kanonu mają różne wysokości (wyłącznik 16, reklozer 24, rozłącznik
 * bezpiecznikowy 32 px), więc tory kończyły się na różnych poziomach — na
 * rysunku wykonawczym wyprowadzenia z rozdzielnicy leżą w jednej linii, a
 * „strzępiasty" dół czyta się jak błąd rysunku. Pola z własnym zakończeniem
 * (transformatorowe — zejście do transformatora; sprzęgłowe — powrót na szynę)
 * NIE są wyrównywane: ich dół wynika z topologii, nie z długości toru.
 */
function wyrownajZejscia(plany: readonly PlanPola[]): PlanPola[] {
  const doWyrownania = plany.filter((p) => p.zejscieOtwarte);
  if (doWyrownania.length === 0) return [...plany];
  const poziom = Math.max(...doWyrownania.map((p) => p.dol));
  return plany.map((plan) => {
    if (!plan.zejscieOtwarte || plan.dol === poziom) return plan;
    const tor = plan.tor.slice();
    const ostatni = tor[tor.length - 1];
    tor[tor.length - 1] = [ostatni[0], ostatni[1], ostatni[2], poziom] as OdcinekToru;
    return { ...plan, tor, dol: poziom };
  });
}

/** Zasięg poziomy rysunku pola [dxMin, dxMax] — liczony Z TEGO rysunku. */
function zasiegPlanu(plan: PlanPola): readonly [number, number] {
  let min = 0;
  let max = 0;
  for (const s of plan.symbole) {
    min = Math.min(min, s.x);
    max = Math.max(max, s.x + wymiarSymbolu(s.id).szerokosc);
  }
  for (const [x1, , x2] of plan.tor) {
    min = Math.min(min, x1, x2);
    max = Math.max(max, x1, x2);
  }
  if (plan.przerwa) {
    min = Math.min(min, plan.przerwa[0]);
    max = Math.max(max, plan.przerwa[1]);
  }
  return [min, max];
}

function przesunPlan(plan: PlanPola, x: number): Pick<PlanPola, 'symbole' | 'tor'> {
  return {
    symbole: plan.symbole.map((s) => ({ ...s, x: s.x + x })),
    tor: plan.tor.map(([x1, y1, x2, y2]) => [x1 + x, y1, x2 + x, y2] as OdcinekToru),
  };
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
  const { snFields, aparaty, transformatory, transformatorRef, snVoltageKv } = wejscie;
  const transformator = transformatorRef
    ? transformatory.find((t) => t.id === transformatorRef) ?? null
    : null;

  const wstepne = snFields.map((pole, index) => {
    const aparat = pole.apparatus_catalog_ref
      ? aparaty.find((a) => a.id === pole.apparatus_catalog_ref) ?? null
      : null;
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
    // Status pakietu szablonu — ten sam słownik, co w pickerze szablonu pola
    // (jedno źródło nazw statusów katalogowych).
    const status = pole.bay_template_ref
      ? SOURCE_STATUS_LABEL_PL[pole.source_status]
      : T.podgladBrakSzablonu;
    const wierszeOpisu = [...opisAparatu, ...opisTransformatora, status];
    return { pole, index, aparat, wierszeRoli, wierszeOpisu, wierszyNazwy: wierszeNazwy.length };
  });

  const naglowekY = MARGINES + FONT_ROLI;
  const wierszyNaglowka = Math.max(1, ...wstepne.map((w) => w.wierszeRoli.length));
  const szynaY = naglowekY + (wierszyNaglowka + 1) * WYS_WIERSZA_ROLI + ODSTEP_TABELA_SZYNA;

  // Rysunki pól powstają PRZED rozstawieniem — szerokość slotu wynika z nich.
  const plany = wyrownajZejscia(wstepne.map((w) => zaplanujPole(w.pole, w.aparat, szynaY)));

  let kursorX = MARGINES;
  const sloty: SlotPodgladu[] = wstepne.map((w, i) => {
    const plan = plany[i];
    const [dxMin, dxMax] = zasiegPlanu(plan);
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
    const przesuniety = przesunPlan(plan, x);
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
      symbole: przesuniety.symbole,
      tor: przesuniety.tor,
      dol: plan.dol,
      przerwaSzyny: plan.przerwa ? [plan.przerwa[0] + x, plan.przerwa[1] + x] : null,
    };
  });

  const szerokosc = Math.max(kursorX + MARGINES, MIN_SLOT + 2 * MARGINES);
  const opisyY = Math.max(szynaY + 60, ...sloty.map((s) => s.dol)) + 2 * WYS_WIERSZA_APARATU;
  const wierszyOpisu = Math.max(1, ...sloty.map((s) => s.wierszeOpisu.length));
  const wysokosc = opisyY + wierszyOpisu * WYS_WIERSZA_APARATU + MARGINES;

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
        y: podglad.naglowekY + (i + 1) * WYS_WIERSZA_ROLI,
      });
    });
    slot.wierszeOpisu.forEach((wiersz, i) => {
      const w = measureTextWidth(wiersz, FONT_APARATU);
      wynik.push({
        slot: slot.numer,
        wiersz,
        x1: slot.x - w / 2,
        x2: slot.x + w / 2,
        y: podglad.opisyY + i * WYS_WIERSZA_APARATU,
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
 * kolizja etykiet, tylko po stronie geometrii).
 */
export function wyjsciaPozaSlot(podglad: PodgladRozdzielnicy): string[] {
  const bledy: string[] = [];
  for (const slot of podglad.sloty) {
    const lewa = slot.x - slot.szerokosc / 2;
    const prawa = slot.x + slot.szerokosc / 2;
    for (const s of slot.symbole) {
      if (s.x < lewa || s.x + wymiarSymbolu(s.id).szerokosc > prawa) {
        bledy.push(`symbol ${s.id} pola ${slot.numer} poza slotem`);
      }
    }
    for (const [x1, , x2] of slot.tor) {
      if (Math.min(x1, x2) < lewa || Math.max(x1, x2) > prawa) {
        bledy.push(`tor pola ${slot.numer} poza slotem`);
      }
    }
  }
  return bledy;
}
