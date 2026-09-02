/**
 * ELECTRICAL CAD SYMBOL REGISTRY — biblioteka symboli SCHEMATU (nie
 * piktogramów aplikacji) dla SLD nN L2. Mandat właściciela R2 (2026-09-02):
 * „SLD L2 ma być zbudowany z LINII, ŁUKÓW, STYKÓW, UZWOJEŃ, ZACISKÓW,
 * POŁĄCZEŃ — jak dokumentacja techniczna". Zero bitmap, zero ikon czcionek,
 * zero gotowych ikonek React, zero wypełnienia jako nośnika stanu.
 *
 * PIERWOWZÓR GEOMETRII (R2.1, polecenie właściciela „przyjmij symbole ze
 * schematu z załącznika"): schemat ideowy zasilania instalacji PV
 * (dokumentacja polska w notacji IEC 60617 / IEC 81346, arkusz A2), z którego
 * odczytano WEKTOROWO (nie „na oko") geometrię aparatów: proporcje noża,
 * położenie kwalifikatorów, kierunek otwarcia, wkładkę na nożu, wyzwalacze
 * wyłącznika instalacyjnego, falownik, moduł PV, przekładnik, uziemienie.
 * Zapis pomiarów: `docs/sld/SLD_CAD_SYMBOL_REFERENCE_PACK_R2.md` §12.
 *
 * KANON GEOMETRII
 * - Jednostka: „u" — symbol aparatu ma 16 u szerokości i 24 u wysokości,
 *   oś toru w x = 8, zacisk górny (8,0), dolny (8,24). Wszystkie kotwice na
 *   siatce 1 u (grid CAD, R2 §16).
 * - Aparaty łączeniowe (IEC 60617: styk zwierny S00227 z kwalifikatorami
 *   funkcji S00219/S00220/S00221): STYK STAŁY u góry (koniec przewodu w
 *   y = 7), PRZEGUB noża u dołu (8,17), nóż 11,5 u obracany WOKÓŁ przegubu:
 *   0° = ZAMKNIĘTY (nóż w osi toru), −30° = OTWARTY (końcówka odchylona w
 *   GÓRĘ-LEWO, na wysokości styku stałego — jak w pierwowzorze: przesunięcie
 *   końcówki ≈ 0,47 długości noża), −15° = STAN NIEZNANY (kąt pośredni;
 *   renderer rysuje nóż kreską przerywaną). Stan wynika WYŁĄCZNIE z geometrii
 *   noża — ta sama rodzina geometryczna w każdym stanie (R2 §4/§14).
 * - Kwalifikatory funkcji IEC 60617 rysowane NA STYKU STAŁYM (nieruchome,
 *   w osi — jak w pierwowzorze): wyłącznik = krzyżyk „×" na końcu przewodu
 *   styku stałego (S00219); odłącznik = poprzeczka styku stałego (S00220);
 *   rozłącznik = poprzeczka + okrąg zawieszony pod poprzeczką (S00221);
 *   bezpiecznik = prostokąt z przewodem na wylot (S00362); wkładka jako nóż
 *   = rozłącznik bezpiecznikowy (S00370); wyłącznik instalacyjny = nóż z
 *   wyzwalaczem termicznym (bimetal, „hak") i elektromagnetycznym (strzałka)
 *   prostopadłymi do noża, obracanymi z nim.
 * - Elementy bez stanu łączeniowego mają jedną geometrię (`body`).
 * - Pole `w` prymitywu = MNOŻNIK grubości bazowej kreski symbolu (1 = kreska
 *   symbolu; 2.2 = płyta „gruba" ogniwa). Grubość bazową w px ekranu nadaje
 *   renderer (`CadSymbol`, kreska nieskalowana z kamerą).
 *
 * STATUS NORMATYWNY — patrz `docs/sld/SLD_SYMBOL_NORMATIVE_REGISTRY.md`.
 * Identyfikatory IEC 60617 (S00xxx) pochodzą z oficjalnego wykazu podglądowego
 * IEC (webstore, „IEC 60617 — Graphical symbols for diagrams", lista
 * identyfikatorów z tytułami). Geometria wg pierwowzoru właściciela i
 * konwencji IEC 60617; `verificationStatus` mówi uczciwie, co zostało
 * potwierdzone.
 */

import type { SymbolPort } from '../core/grid';

export type CadPrimitive =
  /** `nozStanu` = kreska NOŻA (styku ruchomego): w stanie NIEZNANYM renderer
   *  rysuje ją przerywaną; kwalifikatory obracane z nożem zostają ciągłe. */
  | { readonly k: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly w?: number; readonly nozStanu?: boolean }
  | { readonly k: 'circle'; readonly cx: number; readonly cy: number; readonly r: number; readonly fill?: 'ink' | 'none' | 'paper'; readonly w?: number }
  | { readonly k: 'arc'; readonly d: string; readonly w?: number }
  | { readonly k: 'path'; readonly d: string; readonly fill?: 'ink' | 'none' | 'paper'; readonly w?: number }
  /** Znak normatywny wewnątrz symbolu (kod literowy G maszyny, „3" fazy przy
   *  „~" przekształtnika) — część symbolu IEC, nie etykieta aplikacji. */
  | { readonly k: 'letter'; readonly x: number; readonly y: number; readonly t: string; readonly size: number }
  /** Grupa obracana wokół przegubu — nóż łącznika. */
  | { readonly k: 'pivot'; readonly cx: number; readonly cy: number; readonly deg: number; readonly prims: readonly CadPrimitive[] };

export type CadSwitchState = 'closed' | 'open' | 'unknown';

export type CadFunctionalClass =
  | 'wylacznik'
  | 'wylacznik_instalacyjny'
  | 'odlacznik'
  | 'rozlacznik'
  | 'lacznik_ogolny'
  | 'uziemnik'
  | 'bezpiecznik'
  | 'rozlacznik_bezpiecznikowy'
  | 'transformator_2u'
  | 'przekladnik_pradowy'
  | 'przekladnik_napieciowy'
  | 'przeksztaltnik'
  | 'zrodlo_pv'
  | 'magazyn_energii'
  | 'generator'
  | 'odbior_odplyw'
  | 'przewod'
  | 'szyna'
  | 'zacisk'
  | 'wezel'
  | 'zabezpieczenie';

export type CadVerificationStatus = 'DRAFT' | 'ENGINEERING_REVIEWED' | 'NORMATIVE_VERIFIED';

export type CadLodPolicy = 'zawsze' | 'od_sieci' | 'tylko_pelny';

export interface CadSymbolDef {
  readonly symbolId: CadSymbolId;
  /** Typ domenowy ENM / klasa elementu projekcji, dla której symbol jest rysowany. */
  readonly domainType: string;
  readonly functionalClass: CadFunctionalClass;
  readonly polishName: string;
  /** Odniesienie normatywne (identyfikator IEC 60617 albo konwencja rysunkowa). */
  readonly standardReference: string;
  readonly verificationStatus: CadVerificationStatus;
  /** Gabaryt nominalny [u]. */
  readonly nominalWidth: number;
  readonly nominalHeight: number;
  /** Zaciski elektryczne (na siatce, na krawędzi gabarytu). */
  readonly terminals: readonly SymbolPort[];
  /** Kotwice geometryczne (R2 §16). */
  readonly anchors: {
    readonly top: { x: number; y: number };
    readonly bottom: { x: number; y: number };
    readonly left: { x: number; y: number };
    readonly right: { x: number; y: number };
    readonly center: { x: number; y: number };
  };
  /** Geometria bez stanu. */
  readonly body: readonly CadPrimitive[];
  /** Geometria zależna od stanu łączeniowego (łączniki); brak = symbol bez stanu. */
  readonly states?: Readonly<Record<CadSwitchState, readonly CadPrimitive[]>>;
  /** Minimalny rozmiar EKRANOWY wysokości symbolu [px] (czytelność CAD). */
  readonly minimumSizePx: number;
  readonly lodPolicy: CadLodPolicy;
  readonly notes: string;
}

export type CadSymbolId =
  | 'cad.wylacznik'
  | 'cad.wylacznikInstalacyjny'
  | 'cad.odlacznik'
  | 'cad.rozlacznik'
  | 'cad.lacznik'
  | 'cad.uziemnik'
  | 'cad.bezpiecznik'
  | 'cad.rozlacznikBezpiecznikowy'
  | 'cad.transformator2u'
  | 'cad.przekladnikPradowy'
  | 'cad.przekladnikNapieciowy'
  | 'cad.przeksztaltnik'
  | 'cad.zrodloPvZPrzeksztaltnikiem'
  | 'cad.magazynZPrzeksztaltnikiem'
  | 'cad.generator'
  | 'cad.odplywOdbior'
  | 'cad.zacisk'
  | 'cad.wezel'
  | 'cad.zabezpieczenie';

// ---------------------------------------------------------------------------
// Klocki geometrii łączników (jedna rodzina: styk stały u góry + nóż na
// przegubie u dołu; kwalifikatory nieruchome na styku stałym).
// ---------------------------------------------------------------------------

const OS = 8;
/** Koniec przewodu górnego = styk stały. */
const STYK_STALY_Y = 7;
/** Przegub noża. */
const PRZEGUB_Y = 17;
/** Długość noża: końcówka OTWARTEGO noża (−30°) leży na wysokości styku
 *  stałego, przesunięta w lewo o ≈ 0,5 długości (pierwowzór: 7 / 14,8 pt). */
const DLUGOSC_NOZA = 11.5;
/** Kąt noża w stanie OTWARTYM (ujemny = końcówka w LEWO w układzie SVG, jak
 *  w pierwowzorze) i NIEZNANYM (pośredni). */
export const KAT_OTWARTY = -30;
export const KAT_NIEZNANY = -15;
/** Nóż z wkładką (rozłącznik bezpiecznikowy) jest dłuższy — mniejszy kąt
 *  daje tę samą wysokość końcówki (pierwowzór: 7,2 / 25,8 pt ≈ 16°). */
export const KAT_OTWARTY_WKLADKI = -20;
export const KAT_NIEZNANY_WKLADKI = -10;

function przewodGorny(doY: number = STYK_STALY_Y): CadPrimitive {
  return { k: 'line', x1: OS, y1: 0, x2: OS, y2: doY };
}

function przewodDolny(odY: number = PRZEGUB_Y, doY: number = 24): CadPrimitive {
  return { k: 'line', x1: OS, y1: odY, x2: OS, y2: doY };
}

/** Nóż: od przegubu w górę o `dlugosc` (pozycja ZAMKNIĘTA — w osi, końcówka
 *  zachodzi na przewód styku stałego), obracany wokół przegubu;
 *  `dodatkiNoza` obracają się razem z nim (wkładka, wyzwalacze). */
function noz(
  deg: number,
  przegubY: number = PRZEGUB_Y,
  dlugosc: number = DLUGOSC_NOZA,
  dodatkiNoza: readonly CadPrimitive[] = [],
): CadPrimitive {
  return {
    k: 'pivot',
    cx: OS,
    cy: przegubY,
    deg,
    prims: [{ k: 'line', x1: OS, y1: przegubY, x2: OS, y2: przegubY - dlugosc, nozStanu: true }, ...dodatkiNoza],
  };
}

/** Kwalifikator S00219 „funkcja wyłącznika": krzyżyk na KOŃCU przewodu
 *  styku stałego, w osi toru (pierwowzór: krzyżyk 4,4 pt przy nożu 14,8 pt). */
const KRZYZYK_WYLACZNIKA: readonly CadPrimitive[] = [
  { k: 'line', x1: OS - 2, y1: STYK_STALY_Y - 2, x2: OS + 2, y2: STYK_STALY_Y + 2 },
  { k: 'line', x1: OS + 2, y1: STYK_STALY_Y - 2, x2: OS - 2, y2: STYK_STALY_Y + 2 },
];

/** Kwalifikator S00220 „funkcja odłącznika": poprzeczka styku stałego
 *  (pierwowzór: 5,7 pt przy nożu 14,8 pt ≈ 0,4 długości noża). */
function poprzeczkaOdlacznika(y: number = STYK_STALY_Y): CadPrimitive {
  return { k: 'line', x1: OS - 2.5, y1: y, x2: OS + 2.5, y2: y };
}

/** Kwalifikator S00221 „funkcja rozłącznika": okrąg ZAWIESZONY POD poprzeczką
 *  styku stałego (pierwowzór: okrąg ∅ ≈ 0,22 długości noża pod poprzeczką;
 *  zamknięty nóż przechodzi przez okrąg — okrąg rysowany na wierzchu). */
const R_OKRAGU_ROZLACZNIKA = 1.4;
function okragRozlacznika(yPoprzeczki: number = STYK_STALY_Y): CadPrimitive {
  return { k: 'circle', cx: OS, cy: yPoprzeczki + R_OKRAGU_ROZLACZNIKA, r: R_OKRAGU_ROZLACZNIKA, fill: 'paper' };
}

/** Wyzwalacze wyłącznika instalacyjnego (IEC 60617: efekt termiczny — „hak"
 *  bimetalu, efekt elektromagnetyczny — strzałka), prostopadle do noża, po
 *  stronie zewnętrznej (lewej), obracane z nożem — jak w pierwowzorze (B16A). */
const WYZWALACZE_MCB: readonly CadPrimitive[] = [
  { k: 'line', x1: OS, y1: 11.25, x2: OS - 1.5, y2: 11.25 },
  { k: 'path', d: `M ${OS - 1.5} 11.25 V 9.75 H ${OS - 3} V 11.25`, fill: 'none' },
  { k: 'line', x1: OS - 3, y1: 11.25, x2: OS - 5, y2: 11.25 },
  { k: 'path', d: `M ${OS - 4.4} 10.4 L ${OS - 5.8} 11.25 L ${OS - 4.4} 12.1 Z`, fill: 'ink' },
];

function stanyLacznika(
  dodatki: readonly CadPrimitive[],
  nozZamkniety: (deg: number) => CadPrimitive,
  katy: { readonly open: number; readonly unknown: number } = { open: KAT_OTWARTY, unknown: KAT_NIEZNANY },
): Readonly<Record<CadSwitchState, readonly CadPrimitive[]>> {
  return {
    closed: [nozZamkniety(0), ...dodatki],
    open: [nozZamkniety(katy.open), ...dodatki],
    unknown: [nozZamkniety(katy.unknown), ...dodatki],
  };
}

const KOTWICE_16x24 = {
  top: { x: 8, y: 0 },
  bottom: { x: 8, y: 24 },
  left: { x: 0, y: 12 },
  right: { x: 16, y: 12 },
  center: { x: 8, y: 12 },
} as const;

const ZACISKI_16x24: readonly SymbolPort[] = [
  { name: 'a', x: 8, y: 0, dir: 'N' },
  { name: 'b', x: 8, y: 24, dir: 'S' },
];

function kotwice(w: number, h: number) {
  return {
    top: { x: w / 2, y: 0 },
    bottom: { x: w / 2, y: h },
    left: { x: 0, y: h / 2 },
    right: { x: w, y: h / 2 },
    center: { x: w / 2, y: h / 2 },
  } as const;
}

/** Znak „=" (prąd stały) i „~" (prąd przemienny) rysowane kreskami. */
function znakDc(cx: number, cy: number): readonly CadPrimitive[] {
  return [
    { k: 'line', x1: cx - 2, y1: cy - 1, x2: cx + 2, y2: cy - 1 },
    { k: 'line', x1: cx - 2, y1: cy + 1, x2: cx + 2, y2: cy + 1 },
  ];
}
function znakAc(cx: number, cy: number): readonly CadPrimitive[] {
  return [{ k: 'arc', d: `M ${cx - 2.4} ${cy} q 1.2 -2.2 2.4 0 t 2.4 0` }];
}

/** Przekształtnik (S00213/S00896) jak w pierwowzorze: kwadrat z przekątną od
 *  lewego DOLNEGO do prawego GÓRNEGO rogu, „3~" po stronie AC (górny lewy
 *  trójkąt — ku szynie), „=" po stronie DC (dolny prawy — ku źródłu).
 *  Kwadrat 12×12 w polu 16×16 od `y0`. */
function przeksztaltnik(y0: number): readonly CadPrimitive[] {
  const x0 = 2;
  const s = 12;
  return [
    { k: 'path', d: `M ${x0} ${y0} h ${s} v ${s} h ${-s} Z`, fill: 'none' },
    { k: 'line', x1: x0, y1: y0 + s, x2: x0 + s, y2: y0 },
    { k: 'letter', x: x0 + 2.6, y: y0 + 3.3, t: '3', size: 3.6 },
    ...znakAc(x0 + 6.6, y0 + 3.4),
    ...znakDc(x0 + 8.5, y0 + 9),
  ];
}

/** Moduł fotowoltaiczny jak w pierwowzorze: ramka pola DC z modułem
 *  (prostokąt z szewronem „V" u góry) — pierwowzór: ramka 45×68 pt, moduł
 *  18×32 pt z szewronem 17×11 pt. */
function modulPv(y0: number): readonly CadPrimitive[] {
  return [
    { k: 'path', d: `M 1 ${y0} h 14 v 18 h -14 Z`, fill: 'none' },
    { k: 'line', x1: OS, y1: y0, x2: OS, y2: y0 + 4 },
    { k: 'path', d: `M 5.5 ${y0 + 4} h 5 v 11 h -5 Z`, fill: 'none' },
    { k: 'path', d: `M 5.5 ${y0 + 4} L ${OS} ${y0 + 8} L 10.5 ${y0 + 4}`, fill: 'none' },
  ];
}

/** Bateria (S01342) jak w pierwowzorze (-G1): ogniwo (płyta długa cienka i
 *  krótka gruba) w ramce urządzenia, przewód od góry. */
function bateria(y0: number): readonly CadPrimitive[] {
  return [
    { k: 'path', d: `M 1 ${y0} h 14 v 18 h -14 Z`, fill: 'none' },
    { k: 'line', x1: OS, y1: y0, x2: OS, y2: y0 + 7 },
    { k: 'line', x1: 3.5, y1: y0 + 7, x2: 12.5, y2: y0 + 7 },
    { k: 'line', x1: 5.5, y1: y0 + 10, x2: 10.5, y2: y0 + 10, w: 2.2 },
    { k: 'line', x1: OS, y1: y0 + 10, x2: OS, y2: y0 + 14 },
  ];
}

// ---------------------------------------------------------------------------
// REJESTR.
// ---------------------------------------------------------------------------

export const ELECTRICAL_CAD_SYMBOL_REGISTRY: Readonly<Record<CadSymbolId, CadSymbolDef>> = {
  'cad.wylacznik': {
    symbolId: 'cad.wylacznik',
    domainType: 'branch.breaker (SwitchBranch type=breaker, katalog APARAT_NN — kompaktowy / powietrzny); bus_coupler z device_kind WYLACZNIK_*',
    functionalClass: 'wylacznik',
    polishName: 'Wyłącznik',
    standardReference: 'IEC 60617 S00287 (Circuit breaker) = S00227 styk zwierny + S00219 funkcja wyłącznika (krzyżyk na styku stałym); pierwowzór: -QPV1 400 A LSI',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: ZACISKI_16x24,
    anchors: KOTWICE_16x24,
    body: [przewodGorny(), przewodDolny()],
    states: stanyLacznika(KRZYZYK_WYLACZNIKA, (deg) => noz(deg)),
    minimumSizePx: 28,
    lodPolicy: 'zawsze',
    notes: 'Stan z geometrii noża (0° / −30° / −15°); krzyżyk nieruchomy na końcu styku stałego w osi (jak w pierwowzorze). Zakaz wypełnienia korpusu jako nośnika stanu.',
  },
  'cad.wylacznikInstalacyjny': {
    symbolId: 'cad.wylacznikInstalacyjny',
    domainType: 'branch.breaker z katalogu APARAT_NN_MCB (wyłącznik instalacyjny, charakterystyka B/C/D)',
    functionalClass: 'wylacznik_instalacyjny',
    polishName: 'Wyłącznik instalacyjny',
    standardReference: 'IEC 60617: S00227 styk zwierny + kwalifikatory wyzwalacza termicznego (efekt termiczny, bimetal) i elektromagnetycznego (strzałka) na nożu; pierwowzór: -F1 B10 6 kA, B16A',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: ZACISKI_16x24,
    anchors: KOTWICE_16x24,
    body: [przewodGorny(), przewodDolny()],
    states: stanyLacznika([], (deg) => noz(deg, PRZEGUB_Y, DLUGOSC_NOZA, WYZWALACZE_MCB)),
    minimumSizePx: 28,
    lodPolicy: 'zawsze',
    notes: 'Bez krzyżyka — funkcję wyłączania niosą wyzwalacze przy nożu (pierwowzór rysuje tak KAŻDY aparat modułowy B/C). Wybierany wyłącznie z danych katalogu (przestrzeń APARAT_NN_MCB).',
  },
  'cad.odlacznik': {
    symbolId: 'cad.odlacznik',
    domainType: 'branch.disconnector; bus_coupler z device_kind ODLACZNIK',
    functionalClass: 'odlacznik',
    polishName: 'Odłącznik',
    standardReference: 'IEC 60617 S00288 (Disconnector; Isolator) = S00227 + S00220 funkcja odłącznika (poprzeczka styku stałego)',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: ZACISKI_16x24,
    anchors: KOTWICE_16x24,
    body: [przewodGorny(), przewodDolny()],
    states: stanyLacznika([poprzeczkaOdlacznika()], (deg) => noz(deg)),
    minimumSizePx: 28,
    lodPolicy: 'zawsze',
    notes: 'Bez zdolności łączenia prądu obciążenia — brak okręgu pod poprzeczką.',
  },
  'cad.rozlacznik': {
    symbolId: 'cad.rozlacznik',
    domainType: 'branch.switch; bus_coupler z device_kind ROZLACZNIK',
    functionalClass: 'rozlacznik',
    polishName: 'Rozłącznik (rozłącznik izolacyjny)',
    standardReference: 'IEC 60617 S00290 (Switch-disconnector; On-load isolating switch) = S00227 + S00220 + S00221 funkcja rozłącznika (okrąg pod poprzeczką styku stałego); pierwowzór: -Q1/-Q2 400 A (bez wkładki: poprzeczka + okrąg u góry)',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: ZACISKI_16x24,
    anchors: KOTWICE_16x24,
    body: [przewodGorny(), przewodDolny()],
    states: stanyLacznika([poprzeczkaOdlacznika(), okragRozlacznika()], (deg) => noz(deg)),
    minimumSizePx: 28,
    lodPolicy: 'zawsze',
    notes: 'Okrąg zawieszony pod poprzeczką styku stałego (pierwowzór), rysowany na wierzchu — zamknięty nóż przechodzi przez okrąg.',
  },
  'cad.lacznik': {
    symbolId: 'cad.lacznik',
    domainType: 'branch.bus_coupler bez device_kind (funkcja łączeniowa nieokreślona w modelu)',
    functionalClass: 'lacznik_ogolny',
    polishName: 'Łącznik (symbol ogólny) — łącznik szyn o nieokreślonej funkcji',
    standardReference: 'IEC 60617 S00227 (Make contact, general symbol; Switch, general symbol)',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: ZACISKI_16x24,
    anchors: KOTWICE_16x24,
    body: [przewodGorny(), przewodDolny()],
    states: stanyLacznika([], (deg) => noz(deg)),
    minimumSizePx: 28,
    lodPolicy: 'zawsze',
    notes: 'Rysowany, gdy ENM mówi tylko „bus_coupler" bez klasy funkcjonalnej — audyt NN-AUD-18 nazywa brak danych; nie dorysowujemy wyłącznika, którego model nie deklaruje.',
  },
  'cad.uziemnik': {
    symbolId: 'cad.uziemnik',
    domainType: 'brak elementu ENM (rezerwacja rodziny; kompozycje pól SN)',
    functionalClass: 'uziemnik',
    polishName: 'Uziemnik',
    standardReference: 'IEC 60617: odłącznik (S00288) + uziemienie (S00200 Earth, general symbol) — złożenie; brak osobnego identyfikatora w wykazie podglądowym; uziemienie jak w pierwowzorze (trzy kreski 12 : 9 : 6)',
    verificationStatus: 'DRAFT',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: [{ name: 'a', x: 8, y: 0, dir: 'N' }],
    anchors: KOTWICE_16x24,
    body: [
      { k: 'line', x1: OS, y1: 0, x2: OS, y2: 4 },
      { k: 'line', x1: OS - 2.5, y1: 14, x2: OS + 2.5, y2: 14 },
      { k: 'line', x1: OS, y1: 14, x2: OS, y2: 17 },
      { k: 'line', x1: 2, y1: 17, x2: 14, y2: 17 },
      { k: 'line', x1: 3.5, y1: 20, x2: 12.5, y2: 20 },
      { k: 'line', x1: 5, y1: 23, x2: 11, y2: 23 },
    ],
    // Przegub u GÓRY (na przewodzie toru), nóż zamyka w dół na styk stały
    // strony uziemienia; kąt dodatni = końcówka dolna odchylona w LEWO (ta
    // sama strona odchylenia co w pozostałych łącznikach).
    states: {
      closed: [{ k: 'pivot', cx: OS, cy: 4, deg: 0, prims: [{ k: 'line', x1: OS, y1: 4, x2: OS, y2: 14, nozStanu: true }] }],
      open: [{ k: 'pivot', cx: OS, cy: 4, deg: -KAT_OTWARTY, prims: [{ k: 'line', x1: OS, y1: 4, x2: OS, y2: 14, nozStanu: true }] }],
      unknown: [{ k: 'pivot', cx: OS, cy: 4, deg: -KAT_NIEZNANY, prims: [{ k: 'line', x1: OS, y1: 4, x2: OS, y2: 14, nozStanu: true }] }],
    },
    minimumSizePx: 28,
    lodPolicy: 'zawsze',
    notes: 'Nóż osadzony na przewodzie, zamyka na styk stały strony uziemienia. Projekcja nN nie ma dziś elementu ENM tej klasy.',
  },
  'cad.bezpiecznik': {
    symbolId: 'cad.bezpiecznik',
    domainType: 'branch.fuse (FuseBranch; WKLADKA_NN)',
    functionalClass: 'bezpiecznik',
    polishName: 'Bezpiecznik (wkładka topikowa)',
    standardReference: 'IEC 60617 S00362 (Fuse, general symbol): prostokąt z przewodem przechodzącym na wylot; pierwowzór: 3× gG2A',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: ZACISKI_16x24,
    anchors: KOTWICE_16x24,
    body: [
      { k: 'line', x1: OS, y1: 0, x2: OS, y2: 24 },
      { k: 'path', d: 'M 5.5 7 h 5 v 10 h -5 Z', fill: 'none' },
    ],
    minimumSizePx: 24,
    lodPolicy: 'zawsze',
    notes: 'Bez stanu łączeniowego (przepalenie wkładki to zdarzenie, nie stan łącznika).',
  },
  'cad.rozlacznikBezpiecznikowy': {
    symbolId: 'cad.rozlacznikBezpiecznikowy',
    domainType: 'branch.switch z device_kind ROZLACZNIK_BEZPIECZNIKOWY (katalog APARAT_NN); bus_coupler z tym device_kind',
    functionalClass: 'rozlacznik_bezpiecznikowy',
    polishName: 'Rozłącznik bezpiecznikowy',
    standardReference: 'IEC 60617 S00370 (Fuse switch-disconnector; On-load isolating fuse switch): wkładka na nożu + S00220 + S00221; pierwowzór: -FPV1 160 A gG63A, -Q1/-Q2 400 A gG200A',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: ZACISKI_16x24,
    anchors: KOTWICE_16x24,
    body: [przewodGorny(4), przewodDolny(20, 24)],
    states: stanyLacznika(
      [poprzeczkaOdlacznika(4), okragRozlacznika(4)],
      (deg) => noz(deg, 20, 17, [{ k: 'path', d: `M ${OS - 2.2} 18 h 4.4 v -9 h -4.4 Z`, fill: 'none' }]),
      { open: KAT_OTWARTY_WKLADKI, unknown: KAT_NIEZNANY_WKLADKI },
    ),
    minimumSizePx: 28,
    lodPolicy: 'zawsze',
    notes: 'Wkładka (prostokąt na dolnej części noża, nóż przechodzi przez wkładkę) obraca się z nożem wokół przegubu u dołu; poprzeczka + okrąg na styku stałym u góry — geometria wprost z pierwowzoru. Rysowany wyłącznie, gdy model niesie klasę funkcjonalną (device_kind); goła wkładka WKLADKA_NN = cad.bezpiecznik.',
  },
  'cad.transformator2u': {
    symbolId: 'cad.transformator2u',
    domainType: 'transformer (Transformer2W SN/nN)',
    functionalClass: 'transformator_2u',
    polishName: 'Transformator dwuuzwojeniowy',
    standardReference: 'IEC 60617 S00841 (Transformer with two windings, general symbol — forma 1: dwa okręgi)',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 28,
    terminals: [
      { name: 'hv', x: 8, y: 0, dir: 'N' },
      { name: 'lv', x: 8, y: 28, dir: 'S' },
    ],
    anchors: kotwice(16, 28),
    body: [
      { k: 'line', x1: OS, y1: 0, x2: OS, y2: 2.5 },
      { k: 'circle', cx: OS, cy: 9, r: 6.5, fill: 'none' },
      { k: 'circle', cx: OS, cy: 19, r: 6.5, fill: 'none' },
      { k: 'line', x1: OS, y1: 25.5, x2: OS, y2: 28 },
    ],
    minimumSizePx: 40,
    lodPolicy: 'zawsze',
    notes: 'Strona SN u góry (zacisk hv), nN u dołu (lv). Tabliczka (Sn, przekładnia, grupa, uk) jest TEKSTEM obok — moc nie jest kodowana rozmiarem. Brak w pierwowzorze (instalacja nN bez transformatora).',
  },
  'cad.przekladnikPradowy': {
    symbolId: 'cad.przekladnikPradowy',
    domainType: 'measurement CT (Measurement.measurement_type=CT)',
    functionalClass: 'przekladnik_pradowy',
    polishName: 'Przekładnik prądowy',
    standardReference: 'IEC 60617 S00850 (Current transformer, general symbol — forma 1: okrąg na przewodzie pierwotnym); pierwowzór: -T11-T13 200/5 A/A — przewód pierwotny ukryty w okręgu, oznaczenia zacisków pierwotnych tekstem obok',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: ZACISKI_16x24,
    anchors: KOTWICE_16x24,
    body: [
      { k: 'line', x1: OS, y1: 0, x2: OS, y2: 5 },
      { k: 'circle', cx: OS, cy: 12, r: 7, fill: 'paper' },
      { k: 'line', x1: OS, y1: 19, x2: OS, y2: 24 },
    ],
    minimumSizePx: 22,
    lodPolicy: 'zawsze',
    notes: 'Element toru pierwotnego: przewód wchodzi i wychodzi na osi, wnętrze okręgu puste (jak w pierwowzorze). Przekładnia, klasa, rdzenie — tekstem obok, nigdy w plakietce.',
  },
  'cad.przekladnikNapieciowy': {
    symbolId: 'cad.przekladnikNapieciowy',
    domainType: 'measurement VT (Measurement.measurement_type=VT)',
    functionalClass: 'przekladnik_napieciowy',
    polishName: 'Przekładnik napięciowy',
    standardReference: 'IEC 60617 S00878 (Voltage transformer — forma 1: dwa uzwojenia jako okręgi na odgałęzieniu)',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: [{ name: 'a', x: 8, y: 0, dir: 'N' }],
    anchors: KOTWICE_16x24,
    body: [
      { k: 'line', x1: OS, y1: 0, x2: OS, y2: 4.5 },
      { k: 'circle', cx: OS, cy: 9, r: 4.5, fill: 'none' },
      { k: 'circle', cx: OS, cy: 15.5, r: 4.5, fill: 'none' },
      { k: 'line', x1: OS, y1: 20, x2: OS, y2: 23 },
    ],
    minimumSizePx: 22,
    lodPolicy: 'zawsze',
    notes: 'Odgałęzienie od toru (jeden zacisk), strona wtórna otwarta — jednoznacznie różny od CT (okrąg NA przewodzie) i od transformatora mocy (dwa zaciski, większy). Brak w pierwowzorze.',
  },
  'cad.przeksztaltnik': {
    symbolId: 'cad.przeksztaltnik',
    domainType: 'element przekształtnika (część złożeń PV/BESS)',
    functionalClass: 'przeksztaltnik',
    polishName: 'Falownik / przekształtnik',
    standardReference: 'IEC 60617 S00896 (Inverter) na bazie S00213 (Converter, general symbol): kwadrat z przekątną, „3~" strona AC (u góry, ku szynie), „=" strona DC (u dołu, ku źródłu); pierwowzór: -F1/-F2/-F3 SUN2000',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: [
      { name: 'ac', x: 8, y: 0, dir: 'N' },
      { name: 'dc', x: 8, y: 24, dir: 'S' },
    ],
    anchors: KOTWICE_16x24,
    body: [
      { k: 'line', x1: OS, y1: 0, x2: OS, y2: 6 },
      ...przeksztaltnik(6),
      { k: 'line', x1: OS, y1: 18, x2: OS, y2: 24 },
    ],
    minimumSizePx: 26,
    lodPolicy: 'zawsze',
    notes: 'Element ELEKTRYCZNY (nie technologia źródła). Zacisk AC u góry (tor do szyny), DC u dołu (do źródła) — jak w pierwowzorze, gdzie moduły PV wiszą pod falownikiem.',
  },
  'cad.zrodloPvZPrzeksztaltnikiem': {
    symbolId: 'cad.zrodloPvZPrzeksztaltnikiem',
    domainType: 'generator gen_type=pv_inverter (JEDEN element ENM: generator PV z falownikiem)',
    functionalClass: 'zrodlo_pv',
    polishName: 'Generator fotowoltaiczny z falownikiem',
    standardReference: 'złożenie: IEC 60617 S00896 (Inverter) + generator fotowoltaiczny w postaci z pierwowzoru (ramka pola DC z modułem z szewronem; S00908 w wykazie IEC)',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 40,
    terminals: [{ name: 'ac', x: 8, y: 0, dir: 'N' }],
    anchors: kotwice(16, 40),
    body: [
      { k: 'line', x1: OS, y1: 0, x2: OS, y2: 4 },
      ...przeksztaltnik(4),
      { k: 'line', x1: OS, y1: 16, x2: OS, y2: 22 },
      ...modulPv(22),
    ],
    minimumSizePx: 40,
    lodPolicy: 'zawsze',
    notes: 'Kolejność jak w pierwowzorze: kabel AC → falownik → tor DC → moduły PV. ENM modeluje PV+falownik jako jeden generator; symbol jest złożeniem obu ogniw tego elementu (nie dorysowuje osobnego urządzenia). Opis obok: nazwa, moc, technologia, zdolność.',
  },
  'cad.magazynZPrzeksztaltnikiem': {
    symbolId: 'cad.magazynZPrzeksztaltnikiem',
    domainType: 'generator gen_type=bess (JEDEN element ENM: magazyn z przekształtnikiem)',
    functionalClass: 'magazyn_energii',
    polishName: 'Magazyn energii z przekształtnikiem',
    standardReference: 'złożenie: IEC 60617 S00897 (Rectifier/inverter) + S01342 (Battery of primary or secondary cells) w ramce urządzenia jak w pierwowzorze (-G1 24 VDC)',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 40,
    terminals: [{ name: 'ac', x: 8, y: 0, dir: 'N' }],
    anchors: kotwice(16, 40),
    body: [
      { k: 'line', x1: OS, y1: 0, x2: OS, y2: 4 },
      ...przeksztaltnik(4),
      { k: 'line', x1: OS, y1: 16, x2: OS, y2: 22 },
      ...bateria(22),
    ],
    minimumSizePx: 40,
    lodPolicy: 'zawsze',
    notes: 'Kolejność jak w pierwowzorze: kabel AC → przekształtnik dwukierunkowy → tor DC → bateria; oba ogniwa jednego elementu ENM.',
  },
  'cad.generator': {
    symbolId: 'cad.generator',
    domainType: 'generator gen_type=synchronous / wind_inverter / fw_* (maszyna)',
    functionalClass: 'generator',
    polishName: 'Generator (maszyna wirująca)',
    standardReference: 'IEC 60617 S00819 (Machine, general symbol) z literą G i znakiem „~"',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 24,
    terminals: [{ name: 'ac', x: 8, y: 24, dir: 'S' }],
    anchors: KOTWICE_16x24,
    body: [
      { k: 'circle', cx: OS, cy: 9, r: 7.5, fill: 'none' },
      { k: 'letter', x: OS, y: 7.6, t: 'G', size: 7 },
      ...znakAc(OS, 13.2),
      { k: 'line', x1: OS, y1: 16.5, x2: OS, y2: 24 },
    ],
    minimumSizePx: 30,
    lodPolicy: 'zawsze',
    notes: 'Litera G i „~" są częścią symbolu IEC (kod literowy maszyny), nie etykietą. Brak w pierwowzorze.',
  },
  'cad.odplywOdbior': {
    symbolId: 'cad.odplywOdbior',
    domainType: 'load (Load ENM = odbiór zagregowany P/Q na końcu odpływu)',
    functionalClass: 'odbior_odplyw',
    polishName: 'Odpływ do odbioru (obciążenie zagregowane)',
    standardReference: 'IEC 60617 S00104 (Energy flow from the busbars — strzałka kierunku przepływu energii od szyn)',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 16,
    nominalHeight: 16,
    terminals: [{ name: 'a', x: 8, y: 0, dir: 'N' }],
    anchors: kotwice(16, 16),
    body: [
      { k: 'line', x1: OS, y1: 0, x2: OS, y2: 9 },
      { k: 'path', d: 'M 4 9 L 12 9 L 8 16 Z', fill: 'ink' },
    ],
    minimumSizePx: 18,
    lodPolicy: 'zawsze',
    notes: 'ENM Load jest obciążeniem zagregowanym (P, Q) — strzałka odpływu jest jego właściwym nośnikiem; jawny rodzaj odbiornika nie istnieje w modelu (pierwowzór rysuje odbiorniki jawne: gniazdo 1/N/PE — do rejestru po rozszerzeniu ENM).',
  },
  'cad.zacisk': {
    symbolId: 'cad.zacisk',
    domainType: 'bus poza rozdzielnicą (zacisk toru, stopień ≠ 2) / terminal granicy',
    functionalClass: 'zacisk',
    polishName: 'Zacisk',
    standardReference: 'IEC 60617 S00017 (Terminal): mały okrąg',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 8,
    nominalHeight: 8,
    terminals: [{ name: 'a', x: 4, y: 0, dir: 'N' }, { name: 'b', x: 4, y: 8, dir: 'S' }],
    anchors: kotwice(8, 8),
    body: [{ k: 'circle', cx: 4, cy: 4, r: 2, fill: 'paper' }],
    minimumSizePx: 7,
    lodPolicy: 'zawsze',
    notes: 'Punkt przyłączenia bez rozgałęzienia toru.',
  },
  'cad.wezel': {
    symbolId: 'cad.wezel',
    domainType: 'bus z rozgałęzieniem toru (stopień ≥ 3)',
    functionalClass: 'wezel',
    polishName: 'Węzeł (połączenie przewodów)',
    standardReference: 'IEC 60617 S00020 (T-connection) / S00021 (Double junction of conductors): kropka połączenia; pierwowzór: kropka ∅ ≈ 7× grubości kreski',
    verificationStatus: 'ENGINEERING_REVIEWED',
    nominalWidth: 8,
    nominalHeight: 8,
    terminals: [{ name: 'a', x: 4, y: 0, dir: 'N' }, { name: 'b', x: 4, y: 8, dir: 'S' }],
    anchors: kotwice(8, 8),
    body: [{ k: 'circle', cx: 4, cy: 4, r: 2.2, fill: 'ink' }],
    minimumSizePx: 6,
    lodPolicy: 'zawsze',
    notes: 'Kropka wypełniona = połączenie elektryczne przewodów.',
  },
  'cad.zabezpieczenie': {
    symbolId: 'cad.zabezpieczenie',
    domainType: 'protection_assignment (przekaźnik przypisany do aparatu)',
    functionalClass: 'zabezpieczenie',
    polishName: 'Zabezpieczenie (przekaźnik)',
    standardReference: 'konwencja dokumentacji zabezpieczeń (IEC 60617: prostokąt urządzenia + znaki wielkości charakterystycznej I>, I>>, I0>, U<, f<, df/dt wewnątrz; pierwowzór: blok wyzwalacza LSI z „I>" i „I>>" przy -QPV1)',
    verificationStatus: 'DRAFT',
    nominalWidth: 16,
    nominalHeight: 12,
    terminals: [{ name: 'link', x: 16, y: 6, dir: 'E' }],
    anchors: kotwice(16, 12),
    body: [{ k: 'path', d: 'M 0.5 0.5 h 15 v 11 h -15 Z', fill: 'paper' }],
    minimumSizePx: 14,
    lodPolicy: 'od_sieci',
    notes: 'Prostokąt urządzenia wtórnego połączony kreską kropkowaną z torem (przy przekładniku/aparacie) — jak blok wyzwalacza w pierwowzorze. WEWNĄTRZ znaki funkcji w notacji IEC (I>, I>>, I0>, U<, f<…) z danych przypisania — nanosi je renderer (`wnetrze`), maks. 2 wiersze, pełna lista w panelu odpływu.',
  },
};

export const CAD_SYMBOL_IDS: readonly CadSymbolId[] = Object.keys(ELECTRICAL_CAD_SYMBOL_REGISTRY) as CadSymbolId[];

/** Symbole ze stanem łączeniowym (nóż na przegubie). */
export function maStanLaczeniowy(id: CadSymbolId): boolean {
  return ELECTRICAL_CAD_SYMBOL_REGISTRY[id].states !== undefined;
}

/** Prymitywy do narysowania w danym stanie (bez stanu → `body`). */
export function prymitywy(id: CadSymbolId, state: CadSwitchState = 'closed'): readonly CadPrimitive[] {
  const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[id];
  return def.states ? [...def.body, ...def.states[state]] : def.body;
}

/** Orientacja symbolu na kanwie: pionowa = zacisk `a` u góry (tor pionowy);
 *  pozioma = obrót o +90° wokół środka gabarytu — zacisk `a` po PRAWEJ,
 *  `b` po LEWEJ, otwarty nóż odchyla się W GÓRĘ (łącznik szyn w osi szyny;
 *  ten sam kierunek otwarcia „od toru" co w pionie). */
export type CadOrientation = 'pionowa' | 'pozioma';

export interface GabarytU {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Punkt symbolu [u] po obrocie do zadanej orientacji (wokół `anchors.center`). */
export function punktPoObrocie(id: CadSymbolId, p: { readonly x: number; readonly y: number }, orientation: CadOrientation): { x: number; y: number } {
  if (orientation === 'pionowa') return { x: p.x, y: p.y };
  const c = ELECTRICAL_CAD_SYMBOL_REGISTRY[id].anchors.center;
  // rotate(+90°): x' = cx − (y − cy), y' = cy + (x − cx)
  return { x: c.x - (p.y - c.y), y: c.y + (p.x - c.x) };
}

/** Gabaryt symbolu [u] w układzie własnym (przed translacją) po obrocie. */
export function gabarytCad(id: CadSymbolId, orientation: CadOrientation = 'pionowa'): GabarytU {
  const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[id];
  if (orientation === 'pionowa') return { x: 0, y: 0, w: def.nominalWidth, h: def.nominalHeight };
  const a = punktPoObrocie(id, { x: 0, y: 0 }, orientation);
  const b = punktPoObrocie(id, { x: def.nominalWidth, y: def.nominalHeight }, orientation);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

const KIERUNEK_PO_OBROCIE: Readonly<Record<SymbolPort['dir'], SymbolPort['dir']>> = { N: 'E', S: 'W', E: 'S', W: 'N' };

/** Zacisk symbolu [u] po obrocie (pozycja i kierunek wyjścia przewodu). */
export function zaciskCad(id: CadSymbolId, name: string, orientation: CadOrientation = 'pionowa'): SymbolPort {
  const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[id];
  const port = def.terminals.find((t) => t.name === name);
  if (!port) throw new Error(`Symbol CAD ${id} nie ma zacisku „${name}"`);
  if (orientation === 'pionowa') return port;
  const p = punktPoObrocie(id, port, orientation);
  return { name: port.name, x: p.x, y: p.y, dir: KIERUNEK_PO_OBROCIE[port.dir] };
}
