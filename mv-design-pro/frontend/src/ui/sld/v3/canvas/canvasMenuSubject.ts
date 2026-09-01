/**
 * SLD V3 — TEMAT MENU KONTEKSTOWEGO KANWY (karta S9-5, znaleziska audytu
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §3.3 P-7 i §5 B-4).
 *
 * ---------------------------------------------------------------------------
 * PO CO (diagnoza pomiarowa, sieć referencyjna 52 stacji, LOD 0/1/2)
 * ---------------------------------------------------------------------------
 * Menu kanwy dobierało pozycje po KATEGORII RYSUNKOWEJ trafionego obiektu
 * (`PreviewElementMeta.elementKind`), a nie po obiekcie MODELU, który ten
 * rysunek przedstawia. Zmierzone skutki — jedna klasa defektu w czterech
 * odsłonach:
 *
 *  (a) 350 z 468 odcinków rysowanych jako „tor SN" NIE MA odpowiednika w
 *      modelu (zejścia pól, wyprowadzenia boczne, łączniki wiersza arkusza).
 *      Każdy z nich pokazywał „Zakończ odcinek stacją SN/nN", „Wstaw łącznik
 *      sekcyjny", „Usuń odcinek" — a `element_ref` wysyłany do operacji
 *      domenowej (`gpz/…/bay/001/001#lateral-0`) NIE ISTNIEJE w modelu.
 *  (b) etykieta transformatora (`…/transformer/001/wn_sn#label#name-row-0`,
 *      `ownerKind: 'station-name'`) otwierała menu STACJI — z pozycją
 *      „Usuń stację" i „Kontynuuj ciąg główny" NAD TRANSFORMATOREM.
 *  (c) wszystkie 8 linii napowietrznych sieci referencyjnej dostawało menu
 *      KABLA („Zmień katalog kabla", „Wstaw mufę kablową"), bo kategoria menu
 *      była zaszyta na `cable_segment_sn` niezależnie od `Branch.type`.
 *  (d) ten sam obiekt dawał DWA RÓŻNE menu w zależności od tego, czy trafiono
 *      w jego symbol, czy w jego etykietę: symbol stacji blokował „Dodaj
 *      agregat nN" (brak szyny nN), etykieta tej samej stacji — nie, bo jej
 *      `ownerRef` (`…#name-row-0`) nie rozwiązywał się do stacji w kontekście
 *      dostępności akcji (reguła KLASA pkt 3: dwa niezależne predykaty na
 *      TEN SAM obiekt).
 *
 * ---------------------------------------------------------------------------
 * ROZSTRZYGNIĘCIE — JEDNO ŹRÓDŁO PRAWDY O TEMACIE MENU
 * ---------------------------------------------------------------------------
 * Trafienie (warstwa `sld-v3-trafienia`, karta S9-4) niesie `ownerRef` i klasę
 * obiektu. Ten moduł zamienia je na TEMAT MENU:
 *
 *     temat = { kotwica modelu (ZWERYFIKOWANA), ref kanoniczny, kategoria menu }
 *
 * Zasady (wszystkie sprawdzalne, żadna nie zgaduje):
 *  1. KOTWICA MUSI ISTNIEĆ W MODELU. Kandydaci refu powstają przez odcinanie
 *     sufiksów rysunkowych (`a#label#name-row-0` → `a#label` → `a`), a
 *     przyjmowany jest PIERWSZY, który znajduje się w snapshocie. Ref, którego
 *     nie ma w modelu, NIE JEST tematem — menu się nie otwiera (uczciwa odmowa
 *     zamiast operacji na refie rysunkowym).
 *  2. KATEGORIA MENU WYNIKA Z KOTWICY, nie z kreski. Gałąź `line_overhead`
 *     dostaje menu linii napowietrznej, `cable` — kabla; etykieta
 *     transformatora dostaje menu aparatu, bo jej kotwicą jest transformator.
 *  3. JEDEN PREDYKAT NA OBIEKT. Kategoria menu, ref operacji i kontekst
 *     dostępności akcji pochodzą z TEGO SAMEGO tematu — symbol i etykieta tego
 *     samego obiektu nie mogą się już rozjechać.
 *
 * ---------------------------------------------------------------------------
 * KARTA KLIK-ETYKIETA-KOTWICA (2026-08-08) — TEMAT JEST JEDYNYM ORZECZENIEM
 * O RODZAJU KLIKNIĘTEGO OBIEKTU
 * ---------------------------------------------------------------------------
 * Zasada 3 wyżej („jeden predykat na obiekt") obowiązywała WYŁĄCZNIE menu.
 * Szuflada szczegółów i selekcja lewym klikiem czytały rodzaj obiektu z DRUGIEJ,
 * niezależnej tabeli — `hitAreas.LABEL_OWNER_ELEMENT_KIND` (`OwnerKind`
 * etykiety → `PreviewElementKind`). Pomiar (sieć referencyjna 52 stacji,
 * `buildCanvasHitAreas` × `resolveCanvasMenuSubject`, LOD 0/1/2) wykazał, że oba
 * orzeczenia rozjeżdżają się na 62 z 1084 etykiet LOD2:
 *
 *   54 × `busbar-voltage`   dekl=bus       kotwica=stacja   (menu STACJI z
 *                           pozycją „Usuń stację" NAD NAPISEM NAPIĘCIA SZYNY)
 *    4 × `station-name`     dekl=station   kotwica=transformator
 *    3 × `station-name`     dekl=station   kotwica=zrodlo
 *    1 × `busbar-voltage`   dekl=bus       kotwica=BRAK (sekcja GPZ)
 *
 * `OwnerKind` etykiety jest STRUKTURALNIE NIEZDOLNY do niesienia rodzaju obiektu:
 * jeden rodzaj `'station-name'` obsługuje wiersz nazwy STACJI, TRANSFORMATORA i
 * ŹRÓDŁA (pomiar: 266 / 4 / 3 etykiety). Dlatego rodzaj obiektu dla WSZYSTKICH
 * konsumentów (menu, szuflada, selekcja) pochodzi TERAZ z kotwicy modelu, a
 * `LABEL_OWNER_ELEMENT_KIND` jest wyłącznie tym, czym uczciwie jest —
 * KATEGORIĄ RYSUNKOWĄ trafienia (patrz jej nagłówek po zmianie).
 *
 * Dwa końce pary z JEDNEGO źródła (reguła KLASA pkt 3): bijekcja
 * `ELEMENT_KIND_KOTWICY` (niżej) rozstrzyga OBA kierunki — bramkę przejścia
 * stacja→szyna na WEJŚCIU i kategorię elementu na WYJŚCIU. Do tej karty wejście
 * brało klasę trafienia (`klasa === 'szyna'`, czyli KRESKĘ), a wyjście miało
 * własną, ręcznie pisaną tabelę w `SldCanvasV3Workspace`.
 *
 * Moduł jest CZYSTY (zero DOM, zero Reacta, zero fizyki) — testowalny bez
 * renderu i uruchamialny w skrypcie odbioru `scripts/sld_v3_acceptance.mjs`.
 */
import type { EnergyNetworkModel } from '../../../../types/enm';
import type { DerSourceKind } from '../compose/sourceKind';
import type { PreviewElementKind } from '../compose/preview';
import type { SldElementKindForMenu } from '../../v2/command/SldCommandService';
import { STATION_LV_VOLTAGE_LIMIT_KV } from '../../shared/stationBusResolution';
import { LABEL_OWNER_ELEMENT_KIND, type HitObjectClass } from './hitAreas';
import type { OwnerKind } from '../layout/labels';

/**
 * Rodzaj obiektu MODELU, do którego zakotwiczony jest trafiony rysunek.
 * Lista ZAMKNIĘTA — dopisanie rodzaju bez decyzji w `MENU_KIND_DLA_KOTWICY`
 * nie skompiluje się (`satisfies Record<MenuAnchorKind, …>`).
 */
export type MenuAnchorKind =
  | 'stacja'
  | 'szyna'
  | 'galaz'
  | 'pole'
  | 'zrodlo'
  | 'generator'
  | 'transformator';

/**
 * KARTA KLIK-ETYKIETA-KOTWICA — BIJEKCJA `MenuAnchorKind ↔ PreviewElementKind`.
 *
 * JEDNO źródło prawdy o odpowiedniości „rodzaj obiektu modelu ↔ kategoria
 * elementu rysunku". Czytają ją OBA końce pary (reguła KLASA pkt 3):
 *  - WEJŚCIE — bramka przejścia stacja→szyna w `resolveCanvasMenuSubject`
 *    (`input.elementKind === ELEMENT_KIND_KOTWICY.szyna`);
 *  - WYJŚCIE — kategoria elementu podawana budowniczym szuflady i selekcji
 *    (`SldCanvasV3Workspace`, dawna lokalna tabela `ELEMENT_KIND_KOTWICY`).
 *
 * Tabela ZAMKNIĘTA (`satisfies`) i ODWRACALNA — jej injektywność jest
 * PRZYPIĘTA testem (`__tests__/kotwicaJednoZrodlo.contract.test.ts`), bo od niej
 * zależy poprawność `kotwicaDlaElementKind` niżej.
 */
export const ELEMENT_KIND_KOTWICY = {
  stacja: 'station',
  szyna: 'bus',
  galaz: 'segment',
  pole: 'apparatus',
  zrodlo: 'source',
  generator: 'der',
  transformator: 'transformer',
} satisfies Record<MenuAnchorKind, PreviewElementKind>;

/** Odwrotność `ELEMENT_KIND_KOTWICY` — WYPROWADZONA, nie pisana ręcznie (druga
 *  ręczna tabela byłaby dokładnie tym drugim, niezależnym orzeczeniem, które ta
 *  karta usuwa). `undefined` dla kategorii rysunkowych bez obiektu modelu
 *  (`protectionAnnotation`, `branchPoint`). */
const KOTWICA_WG_ELEMENT_KIND: ReadonlyMap<PreviewElementKind, MenuAnchorKind> = new Map(
  (Object.entries(ELEMENT_KIND_KOTWICY) as readonly [MenuAnchorKind, PreviewElementKind][]).map(
    ([kotwica, kind]) => [kind, kotwica],
  ),
);

export function kotwicaDlaElementKind(kind: PreviewElementKind | undefined): MenuAnchorKind | undefined {
  return kind === undefined ? undefined : KOTWICA_WG_ELEMENT_KIND.get(kind);
}

/**
 * KLASY UCHWYTU — obiekty kanwy, które są UCHWYTEM CUDZEGO obiektu, a nie
 * rysunkiem obiektu własnego (etykieta nazwy/napięcia, znacznik wynikowy).
 *
 * Dla nich kategoria rysunkowa trafienia (`CanvasHitArea.elementKind`) opisuje
 * NAJWYŻEJ to, co napis przedstawia — i dla `OwnerKind:'station-name'` jest po
 * prostu FAŁSZEM (jeden rodzaj obsługuje nazwę stacji, transformatora i źródła).
 * Dlatego rodzaj obiektu dla uchwytu bierze się z KOTWICY MODELU. Lista
 * ZAMKNIĘTA — nowa klasa uchwytu bez decyzji tutaj jest naruszeniem tej karty i
 * wychodzi w teście wyroczni (`kotwicaJednoZrodlo.contract.test.ts`).
 */
export const KLASY_UCHWYTU: ReadonlySet<HitObjectClass> = new Set<HitObjectClass>([
  'etykieta',
  'znacznik-wyniku',
]);

// ---------------------------------------------------------------------------
// KANONICZNY REF SZYNY DLA UCHWYTU (karta KLIK-ETYKIETA-KOTWICA)
// ---------------------------------------------------------------------------

/** Baza refu — część przed pierwszym `#`. Ta sama konwencja własności, co
 *  `baseRefOf` w `SldCanvasV3Workspace` i `ownerScope` w `scene/crossings.ts`:
 *  kompozyt rysunkowy `${cośRealnego}#rola` należy do `cośRealnego`. */
function bazaRefu(ref: string): string | null {
  const kreska = ref.indexOf('#');
  return kreska > 0 ? ref.slice(0, kreska) : null;
}

/**
 * Mapa `baza refu → kanoniczny Bus.ref_id` zbudowana z ODCINKÓW SZYN sceny.
 *
 * PO CO: uchwyt (napis napięcia szyny) musi rozstrzygać się na TEN SAM obiekt
 * modelu, co szyna, którą opisuje. Sam z siebie tego nie potrafi — jego
 * `ownerRef` jest kompozytem rysunkowym (`…#hv-bus-label`, `…#busbar-voltage`,
 * `…#label`), a odcinanie sufiksów prowadzi W GÓRĘ, do KONTENERA (stacji), nie
 * do szyny. Zmierzone na sieci referencyjnej: 54 z 1084 etykiet LOD2 kotwiczyło
 * się tak na STACJI (menu z pozycją „Usuń stację" nad napisem napięcia szyny),
 * a napis sekcji GPZ nie kotwiczył się na niczym.
 *
 * Uchwyt PYTA WIĘC SWÓJ OBIEKT: kanoniczny ref bierze z odcinka o TEJ SAMEJ
 * BAZIE refu. To nie jest nowy predykat o sufiksach, tylko odczyt z jedynego
 * kanału, który taki ref niesie (`PreviewElementMeta.busResultRef` — ADAPTER-BUSREF).
 * Pomiar (`sldSubstrate52s`, `gpzFeeder`, LOD 1/2): tyle samo unikalnych baz co
 * odcinków szyn, ZERO kolizji.
 *
 * Baza niejednoznaczna (dwa różne refy kanoniczne) ⇒ `null` ⇒ BRAK dziedziczenia:
 * wzorzec uczciwej odmowy z `resultRefBridge` („znalazłem dwa różne — nie wiem,
 * który"), nigdy wybór pierwszego z brzegu.
 */
export function buildKanonicznyRefSzynyWgBazy(
  segments: readonly { readonly meta?: { readonly ownerRef?: string; readonly busResultRef?: string } }[],
): ReadonlyMap<string, string | null> {
  const wgBazy = new Map<string, string | null>();
  for (const segment of segments) {
    const ownerRef = segment.meta?.ownerRef;
    const kanoniczny = segment.meta?.busResultRef;
    if (!ownerRef || !kanoniczny) continue;
    const baza = bazaRefu(ownerRef) ?? ownerRef;
    if (!baza) continue;
    const dotychczas = wgBazy.get(baza);
    if (dotychczas === undefined) wgBazy.set(baza, kanoniczny);
    else if (dotychczas !== kanoniczny) wgBazy.set(baza, null);
  }
  return wgBazy;
}

/**
 * Kanoniczny `Bus.ref_id` dla UCHWYTU (napisu), albo `undefined`.
 *
 * ZAKRES ŚCIŚLE ZWIĄZANY Z KANAŁEM: mapa niesie ref SZYNY, więc dziedziczy z niej
 * WYŁĄCZNIE napis, który o szynie mówi (`ELEMENT_KIND_KOTWICY.szyna` — ten sam
 * jeden konstans, którym bramkuje się przejście stacja→szyna niżej).
 *
 * Bez tego zawężenia (pułapka wykryta pomiarem w trakcie karty) napisy pasma nazw
 * GPZ `gpz/…/substation#name-row-N` odziedziczyłyby ref szyny 110 kV po kresce
 * `gpz/…/substation#hv-bus` — TA SAMA baza refu — i klik w nazwę GPZ otwierałby
 * menu SEKCJI na szynie 110 kV zamiast menu stacji.
 *
 * Deklaracja rodzaju napisu (`LABEL_OWNER_ELEMENT_KIND`) jest tu użyta jako FILTR
 * („czy ten napis mówi o szynie"), a NIE jako orzeczenie o obiekcie: `busbar-voltage`
 * opisuje szynę zawsze, a jedyny strukturalnie niezdolny wpis tabeli
 * (`station-name`, wspólny dla stacji/transformatora/źródła) odpowiada `'station'`
 * — czyli jest tym filtrem odrzucany NIEZALEŻNIE od swojej niezdolności.
 */
export function kanonicznyRefSzynyUchwytu(
  label: { readonly ownerRef: string; readonly ownerKind: OwnerKind },
  wgBazy: ReadonlyMap<string, string | null>,
): string | undefined {
  if (LABEL_OWNER_ELEMENT_KIND[label.ownerKind] !== ELEMENT_KIND_KOTWICY.szyna) return undefined;
  const baza = bazaRefu(label.ownerRef);
  return baza === null ? undefined : wgBazy.get(baza) ?? undefined;
}

/** Powód braku tematu — kod maszynowy dla sondy odbioru + zdanie po polsku. */
export type MenuSubjectRefusalCode = 'adnotacja' | 'brak-refu' | 'poza-modelem';

export interface CanvasMenuSubject {
  /** Kategoria menu (`SLD_MENU_REGISTRY`) — WYNIKA z kotwicy, nie z kreski. */
  readonly menuKind: SldElementKindForMenu;
  /** Ref KANONICZNY obiektu modelu — to on jedzie do operacji domenowej. */
  readonly modelRef: string;
  readonly kotwica: MenuAnchorKind;
  /** Rodzina gałęzi (`Branch.type`) — tylko dla kotwicy `galaz`. */
  readonly rodzinaGalezi?: string;
}

export type CanvasMenuSubjectResult =
  | { readonly stan: 'temat'; readonly temat: CanvasMenuSubject }
  | { readonly stan: 'brak'; readonly kod: MenuSubjectRefusalCode; readonly powodPl: string };

/** Dane trafionego obiektu potrzebne do rozstrzygnięcia tematu. */
export interface CanvasMenuSubjectInput {
  /** Klasa obiektu kanwy z warstwy trafień (S9-4). */
  readonly klasa?: HitObjectClass;
  readonly ownerRef?: string;
  readonly elementKind?: PreviewElementKind;
  readonly derKind?: DerSourceKind;
  /** Kanoniczny `Bus.ref_id` podany wprost przez adapter (szyny GPZ). */
  readonly busRef?: string;
}

// ---------------------------------------------------------------------------
// Indeks modelu — jedno przejście po snapshocie zamiast skanu na każdy klik
// ---------------------------------------------------------------------------

export interface CanvasModelIndex {
  readonly stacje: ReadonlyMap<string, EnergyNetworkModel['substations'][number]>;
  readonly szyny: ReadonlyMap<string, EnergyNetworkModel['buses'][number]>;
  readonly galezie: ReadonlyMap<string, EnergyNetworkModel['branches'][number]>;
  readonly generatory: ReadonlySet<string>;
  readonly zrodla: ReadonlySet<string>;
  readonly transformatory: ReadonlySet<string>;
  /** `field_ref` pola SN → ref stacji-właścicielki (`substation.meta.field_specs`). */
  readonly pola: ReadonlyMap<string, string>;
}

function dodajRefy(cel: Set<string>, element: { readonly ref_id?: string; readonly id?: string }): void {
  if (element.ref_id) cel.add(element.ref_id);
  if (element.id) cel.add(element.id);
}

function fieldRefSpecu(spec: unknown): string | null {
  if (!spec || typeof spec !== 'object') return null;
  const rekord = spec as Record<string, unknown>;
  const meta = rekord.meta && typeof rekord.meta === 'object' ? (rekord.meta as Record<string, unknown>) : null;
  const szablon = meta?.sn_field_template && typeof meta.sn_field_template === 'object'
    ? (meta.sn_field_template as Record<string, unknown>)
    : null;
  for (const kandydat of [rekord.field_ref, szablon?.field_ref, meta?.field_ref]) {
    if (typeof kandydat === 'string' && kandydat.trim()) return kandydat.trim();
  }
  return null;
}

/**
 * Indeks refów modelu. Kolejność kolekcji w `kotwicaRefu` jest STAŁA i
 * przypięta testem — ref występujący w dwóch kolekcjach (kolizja przestrzeni
 * nazw) rozstrzyga się deterministycznie, a nie „jak wypadnie".
 */
export function buildCanvasModelIndex(snapshot: EnergyNetworkModel | null): CanvasModelIndex {
  const stacje = new Map<string, EnergyNetworkModel['substations'][number]>();
  const szyny = new Map<string, EnergyNetworkModel['buses'][number]>();
  const galezie = new Map<string, EnergyNetworkModel['branches'][number]>();
  const generatory = new Set<string>();
  const zrodla = new Set<string>();
  const transformatory = new Set<string>();
  const pola = new Map<string, string>();

  for (const stacja of snapshot?.substations ?? []) {
    if (stacja.ref_id) stacje.set(stacja.ref_id, stacja);
    if (stacja.id) stacje.set(stacja.id, stacja);
    const meta = stacja.meta && typeof stacja.meta === 'object' ? (stacja.meta as Record<string, unknown>) : null;
    const specyfikacje = Array.isArray(meta?.field_specs) ? (meta!.field_specs as unknown[]) : [];
    for (const spec of specyfikacje) {
      const ref = fieldRefSpecu(spec);
      if (ref) pola.set(ref, stacja.ref_id ?? stacja.id ?? '');
    }
  }
  for (const szyna of snapshot?.buses ?? []) {
    if (szyna.ref_id) szyny.set(szyna.ref_id, szyna);
    if (szyna.id) szyny.set(szyna.id, szyna);
  }
  for (const galaz of snapshot?.branches ?? []) {
    if (galaz.ref_id) galezie.set(galaz.ref_id, galaz);
    if (galaz.id) galezie.set(galaz.id, galaz);
  }
  for (const generator of snapshot?.generators ?? []) dodajRefy(generatory, generator);
  for (const zrodlo of snapshot?.sources ?? []) dodajRefy(zrodla, zrodlo);
  for (const transformator of snapshot?.transformers ?? []) dodajRefy(transformatory, transformator);

  return { stacje, szyny, galezie, generatory, zrodla, transformatory, pola };
}

// ---------------------------------------------------------------------------
// Rozstrzyganie tematu
// ---------------------------------------------------------------------------

/**
 * Kandydaci refu MODELU dla trafionego obiektu — w kolejności malejącej
 * pewności: ref kanoniczny podany wprost przez adapter, potem `ownerRef`, a
 * potem `ownerRef` bez kolejnych sufiksów rysunkowych (odcinane od PRAWEJ:
 * `a#label#name-row-0` → `a#label` → `a`). Sufiks jest konwencją kompozycji
 * (`compose/station.ts`, `compose/gpz.ts`, `layout/labels.ts`), więc jego
 * odcięcie nie jest domysłem — ale przyjęcie kandydata już wymaga DOWODU
 * istnienia w modelu (patrz `kotwicaRefu`).
 */
export function menuRefCandidates(input: CanvasMenuSubjectInput): readonly string[] {
  const kandydaci: string[] = [];
  const dopisz = (ref: string | undefined): void => {
    const przyciety = ref?.trim();
    if (przyciety && !kandydaci.includes(przyciety)) kandydaci.push(przyciety);
  };
  dopisz(input.busRef);
  let ref = input.ownerRef?.trim();
  dopisz(ref);
  while (ref && ref.includes('#')) {
    ref = ref.slice(0, ref.lastIndexOf('#'));
    dopisz(ref);
  }
  return kandydaci;
}

interface Kotwica {
  readonly kotwica: MenuAnchorKind;
  readonly modelRef: string;
  readonly rodzinaGalezi?: string;
}

/**
 * KOTWICE DOPUSZCZALNE DLA KLASY TRAFIONEGO OBIEKTU — bramka odcinania
 * sufiksów. Bez niej odcinanie „w górę" jest niebezpieczne: kompozyt zejścia
 * pola `…/stacja#coś` skraca się do refu STACJI, a wtedy klik w kreskę
 * wewnątrz stacji otwierałby menu stacji z pozycją „Usuń stację" (zmierzone:
 * 159 odcinków sceny na LOD1/2 trafiało tak w kategorię `station`, a jeden —
 * w `gpz`). Reguła: kotwicą kreski może być gałąź albo pole, którego ta kreska
 * jest przewodem — NIGDY cały obiekt nadrzędny.
 *
 * `etykieta` i `znacznik-wyniku` są UCHWYTAMI swojego właściciela (karta S9-4:
 * „etykieta jest uchwytem właściciela"), więc przyjmują KAŻDĄ kotwicę — to ich
 * rola. Klasa nieznana (`undefined`, wołający sprzed karty S9-5) też nie jest
 * ograniczana: brak pomiaru nie jest dowodem niezgodności.
 *
 * KARTA KLIK-ETYKIETA-KOTWICA: właśnie dlatego, że uchwyt przyjmuje KAŻDĄ
 * kotwicę, rodzaj obiektu dla uchwytu MUSI być odczytany z tej kotwicy, a nie z
 * kategorii rysunkowej napisu — inaczej wynik odcinania sufiksów („w górę", więc
 * potencjalnie do KONTENERA) i deklaracja napisu opisują dwa różne obiekty.
 * Zbiór klas uchwytu jest jeden: `KLASY_UCHWYTU` wyżej.
 */
const KOTWICE_DOZWOLONE_DLA_KLASY = {
  stacja: ['stacja'],
  aparat: ['pole', 'galaz', 'transformator'],
  transformator: ['transformator', 'pole'],
  zrodlo: ['zrodlo'],
  'uklad-der': ['generator'],
  adnotacja: [],
  szyna: ['szyna', 'stacja'],
  tor: ['galaz', 'pole'],
  'lacznik-wiersza': ['galaz'],
  // ODG-RYSUNEK × S9-5: punkt odgałęźny (ZKSN/słup) jest obiektem MODELU
  // (`BranchPointSN`), ale ŚWIADOMIE bez menu w tej fazie — żadna operacja
  // domenowa punktu nie została tu zweryfikowana, a pozycja bez pokrycia
  // byłaby fantomem (zakaz). Kandydat na kartę: menu punktu odgałęźnego
  // (poprowadź gałąź z punktu / usuń punkt) po zweryfikowaniu operacji.
  'punkt-odgalezny': [],
  // PORTAL nN (LV Domain Projection po B-02): przejście do projekcji nN — NIE
  // obiekt modelu; klik OTWIERA projekcję nN (`SldCanvasV3Workspace`), menu
  // budowy nie ma tu żadnej operacji (zero fantomów).
  'portal-nn': [],
  etykieta: ['stacja', 'szyna', 'galaz', 'pole', 'zrodlo', 'generator', 'transformator'],
  'znacznik-wyniku': ['stacja', 'szyna', 'galaz', 'pole', 'zrodlo', 'generator', 'transformator'],
} satisfies Record<HitObjectClass, readonly MenuAnchorKind[]>;

function kotwicaDopuszczalna(klasa: HitObjectClass | undefined, kotwica: MenuAnchorKind): boolean {
  if (!klasa) return true;
  return (KOTWICE_DOZWOLONE_DLA_KLASY[klasa] as readonly MenuAnchorKind[]).includes(kotwica);
}

/** Kolejność kolekcji jest częścią kontraktu (przypięta testem kolizji). */
function kotwicaRefu(index: CanvasModelIndex, ref: string): Kotwica | null {
  if (index.stacje.has(ref)) return { kotwica: 'stacja', modelRef: ref };
  if (index.szyny.has(ref)) return { kotwica: 'szyna', modelRef: ref };
  const galaz = index.galezie.get(ref);
  if (galaz) return { kotwica: 'galaz', modelRef: ref, rodzinaGalezi: galaz.type };
  if (index.generatory.has(ref)) return { kotwica: 'generator', modelRef: ref };
  if (index.zrodla.has(ref)) return { kotwica: 'zrodlo', modelRef: ref };
  if (index.transformatory.has(ref)) return { kotwica: 'transformator', modelRef: ref };
  if (index.pola.has(ref)) return { kotwica: 'pole', modelRef: ref };
  return null;
}

/**
 * Szyna nad-nN stacji — kompozyt rysunku `${stacja}#sn-bus` (`compose/station.ts`)
 * kotwiczy się na STACJI, a operacje szynowe potrzebują `Bus.ref_id`. Realne FK:
 * `substation.bus_refs`.
 *
 * KRYTERIUM: stacja ma DOKŁADNIE JEDNĄ szynę powyżej granicy nN
 * (`STATION_LV_VOLTAGE_LIMIT_KV`, jedna reguła stron stacji z karty S9-2) —
 * wtedy i tylko wtedy wiadomo, KTÓRĄ szynę przedstawia jeden odcinek szyny
 * rysunku. Więcej niż jedna ⇒ BRAK ZAMIANY (temat zostaje stacją i zostaje
 * odrzucony wyżej) — uczciwa odmowa zamiast podmiany obiektu.
 *
 * KARTA KLIK-ETYKIETA-KOTWICA — POMIAR, KTÓRY WYMUSIŁ TO KRYTERIUM. Dawny
 * predykat brzmiał „pierwsza szyna o `voltage_kv > 1`" i był poprawny WYŁĄCZNIE
 * PRZEZ KOLEJNOŚĆ `bus_refs`. Zmierzone na sieci referencyjnej:
 * GPZ `bus_refs = [section/001/bus_sn = 15 kV, transformer/001/bus_110 = 110 kV]`
 * — dawny predykat zwracał szynę 15 kV RÓWNIEŻ dla napisu „Szyna WN · 110 kV",
 * czyli PODMIENIAŁBY obiekt (menu sekcji operujące na szynie 15 kV pod napisem
 * o szynie 110 kV) w chwili, gdy uchwyt napisu zaczął odpalać to przejście.
 * Odwrócona kolejność `bus_refs` dawała ten sam błąd dla KAŻDEJ szyny SN.
 * Kryterium „dokładnie jedna" jest niezależne od kolejności listy i odmawia
 * tam, gdzie rysunek nie rozstrzyga (GPZ: WN + SN) — więc bezpieczeństwo nie
 * zależy od tego, czy inny mechanizm (kanoniczny `busRef` uchwytu) zadziałał
 * PIERWSZY. Predykaty zgadzają się Z KONSTRUKCJI, nie „dziś".
 */
function szynaSnStacji(index: CanvasModelIndex, stacjaRef: string): string | null {
  const stacja = index.stacje.get(stacjaRef);
  let znaleziona: string | null = null;
  for (const busRef of stacja?.bus_refs ?? []) {
    const szyna = index.szyny.get(busRef);
    if (!szyna || !(szyna.voltage_kv > STATION_LV_VOLTAGE_LIMIT_KV)) continue;
    const ref = szyna.ref_id ?? busRef;
    if (znaleziona !== null && znaleziona !== ref) return null;
    znaleziona = ref;
  }
  return znaleziona;
}

/**
 * Kategoria menu dla kotwicy — JAWNA, ZAMKNIĘTA tabela. Rodziny gałęzi
 * rozstrzyga `menuKindGalezi` (kabel / linia napowietrzna / aparat łącznikowy).
 */
const MENU_KIND_DLA_KOTWICY = {
  stacja: 'station',
  szyna: 'section',
  galaz: 'cable_segment_sn',
  pole: 'apparatus',
  zrodlo: 'gpz',
  generator: 'der',
  transformator: 'apparatus',
} satisfies Record<MenuAnchorKind, SldElementKindForMenu>;

/**
 * Rodzina gałęzi → kategoria menu. `Branch.type` jest REALNYM polem modelu
 * (`cable` / `line_overhead` / `breaker` / `switch` / `disconnector` /
 * `bus_coupler` / `fuse`), więc wybór menu nie jest domysłem. Gałęzie
 * łącznikowe to APARATY, nie odcinki — menu odcinka („Zmień katalog kabla",
 * „Zakończ odcinek stacją") na wyłączniku byłoby fabrykacją.
 */
export function menuKindGalezi(rodzina: string | undefined): SldElementKindForMenu {
  switch (rodzina) {
    case 'line_overhead':
      return 'overhead_line_sn';
    case 'cable':
      return 'cable_segment_sn';
    default:
      return 'apparatus';
  }
}

/**
 * Podtyp DER → kategoria menu. WYŁĄCZNIE `pv`/`bess`/`wind` mają osobne
 * kategorie; `generator`/`unknown`/brak danych degradują do generycznego
 * `der` (uczciwa degradacja, `domain_no_guessing_guard` — nigdy domysł
 * podtypu). Ta sama tabela, co dawne `derSubtypeMenuKind` w
 * `SldCanvasV3Workspace` — przeniesiona tu, żeby kategoria menu miała JEDNO
 * miejsce rozstrzygania.
 */
export function menuKindDer(derKind: DerSourceKind | undefined): SldElementKindForMenu {
  switch (derKind) {
    case 'pv':
      return 'der_pv';
    case 'bess':
      return 'der_bess';
    case 'wind':
      return 'der_fw';
    default:
      return 'der';
  }
}

const POWOD_ADNOTACJA =
  'Adnotacja graficzna zabezpieczeń nie jest obiektem modelu sieci — nie ma operacji do wykonania.';
const POWOD_BRAK_REFU =
  'Element rysunku bez tożsamości w modelu sieci (znacznik pomocniczy) — nie ma obiektu do zmiany.';
const POWOD_POZA_MODELEM =
  'Ten fragment rysunku nie ma odpowiednika w modelu sieci — operacje domenowe działają na obiektach modelu.';

/**
 * TEMAT MENU dla trafionego obiektu. `stan: 'brak'` = menu się NIE otwiera, z
 * podanym powodem (kod maszynowy dla sondy odbioru + zdanie po polsku dla
 * dziennika). Nigdy nie zwraca tematu o refie, którego nie ma w modelu.
 */
export function resolveCanvasMenuSubject(
  input: CanvasMenuSubjectInput,
  index: CanvasModelIndex,
): CanvasMenuSubjectResult {
  if (input.elementKind === 'protectionAnnotation' || input.klasa === 'adnotacja') {
    return { stan: 'brak', kod: 'adnotacja', powodPl: POWOD_ADNOTACJA };
  }
  const kandydaci = menuRefCandidates(input);
  if (kandydaci.length === 0) {
    return { stan: 'brak', kod: 'brak-refu', powodPl: POWOD_BRAK_REFU };
  }
  let znaleziona: Kotwica | null = null;
  for (const kandydat of kandydaci) {
    const kotwica = kotwicaRefu(index, kandydat);
    if (kotwica && kotwicaDopuszczalna(input.klasa, kotwica.kotwica)) {
      znaleziona = kotwica;
      break;
    }
  }
  if (!znaleziona) {
    return { stan: 'brak', kod: 'poza-modelem', powodPl: POWOD_POZA_MODELEM };
  }

  // Szyna narysowana jako kompozyt stacji (`${stacja}#sn-bus`, `…#busbar-voltage`)
  // kotwiczy się na stacji — sprowadzamy ją do KANONICZNEJ szyny tej stacji, żeby
  // operacje szynowe (pole SN, kompensator, ogranicznik) dostały `Bus.ref_id`.
  // Stacja BEZ jednoznacznej szyny nie daje tematu: menu STACJI na szynie (z
  // pozycją „Usuń stację") byłoby podmianą obiektu, a nie uczciwą degradacją.
  //
  // KARTA KLIK-ETYKIETA-KOTWICA — BRAMKA Z DEKLAROWANEGO RODZAJU, NIE Z KLASY
  // TRAFIENIA. Do tej karty warunkiem było `input.klasa === 'szyna'`, czyli
  // KRESKA szyny. Klasa `'szyna'` powstaje WYŁĄCZNIE dla odcinków
  // (`hitAreas.klasaOdcinka`), więc przejście NIGDY nie odpalało dla UCHWYTU tej
  // samej szyny — napisu napięcia (`klasa: 'etykieta'`). Zmierzone: 54 z 1084
  // etykiet LOD2 dostawało w ten sposób menu STACJI z pozycją „Usuń stację" nad
  // napisem „S08 · 15 kV" / „Szyna WN · 110 kV". Naprawiono wtedy INSTANCJĘ
  // (kreska), nie KLASĘ (wszystko, co przedstawia szynę).
  //
  // Warunek pochodzi teraz z DEKLAROWANEGO rodzaju obiektu, czytanego z bijekcji
  // `ELEMENT_KIND_KOTWICY` — TEGO SAMEGO źródła, z którego konsumenci biorą
  // kategorię na WYJŚCIU (reguła KLASA pkt 3: oba końce pary z jednego źródła).
  // Kreska szyny i jej napis deklarują tę samą kategorię `'bus'`, więc odpalają
  // to samo przejście; żadna przyszła klasa uchwytu nie wymaga tu dopisku.
  if (znaleziona.kotwica === 'stacja' && input.elementKind === ELEMENT_KIND_KOTWICY.szyna) {
    const busRef = szynaSnStacji(index, znaleziona.modelRef);
    if (!busRef) {
      return { stan: 'brak', kod: 'poza-modelem', powodPl: POWOD_POZA_MODELEM };
    }
    znaleziona = { kotwica: 'szyna', modelRef: busRef };
  }

  const menuKind = znaleziona.kotwica === 'galaz'
    ? menuKindGalezi(znaleziona.rodzinaGalezi)
    : znaleziona.kotwica === 'generator'
      ? menuKindDer(input.derKind)
      : MENU_KIND_DLA_KOTWICY[znaleziona.kotwica];

  return {
    stan: 'temat',
    temat: {
      menuKind,
      modelRef: znaleziona.modelRef,
      kotwica: znaleziona.kotwica,
      ...(znaleziona.rodzinaGalezi === undefined ? {} : { rodzinaGalezi: znaleziona.rodzinaGalezi }),
    },
  };
}
