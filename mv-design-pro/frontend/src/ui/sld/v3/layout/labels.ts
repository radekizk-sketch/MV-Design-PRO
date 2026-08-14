/**
 * SLD V3 — label resolver (SLD_CAD_SPEC_V3 §4 "Model etykiet — sloty
 * właściciela" i §5.5 "Label resolve", potok measure → bands → columns →
 * route → label, ostatni krok). Czysta funkcja: wejściem są WYNIKI
 * poprzednich kroków potoku (columns.ts/bands.ts/route.ts — konkretne
 * prostokąty/współrzędne, nie surowe modele domenowe) + teksty właścicieli.
 * Zero DOM-measure/losowości/Date (P7) — pomiar tekstu WYŁĄCZNIE przez
 * `core/text.ts` (ta sama formuła co measure.ts/F2, jedna prawda).
 *
 * DECYZJA WIĄŻĄCA NADZORCY (poprawka F4 po recenzji REQUEST-CHANGES; pełne
 * centrowanie tap-do-tap to r7b — AUTORYZOWANE w F5, plan REBUILD_PLAN_V3):
 * slot PODSTAWOWY (1, bez leadera) etykiety segmentu poziomego
 * magistrali to `primaryRect` — rezerwacja `SegmentLabelSlotResult.rect` z
 * `columns.ts` w pasmie B1, NAD kolumną stacji docelowej. Oś magistrali (B2)
 * biegnie POZIOMO PRZEZ CAŁĄ szerokość rysunku, więc ten prostokąt leży
 * fizycznie NAD odcinkiem szyny, do którego etykieta się odnosi — to NIE jest
 * "kolumna zamiast przęsła", to ten sam odcinek osi widziany z góry.
 * `columns.ts` GWARANTUJE `primaryRect.width >= szerokość etykiety`
 * (`width_j = snapUp(max(blok stacji, requiredSegmentLabelWidth))`,
 * `requiredSegmentLabelWidth = measureLabelWidth(text,'t2') + 2×GRID` —
 * ściśle większe niż sama etykieta) — więc etykieta W WIDOKU SIECI Z
 * KONSTRUKCJI ZAWSZE mieści się w `primaryRect`, slot 1 bez leadera.
 *
 * BŁĄD POPRZEDNIEJ WERSJI (błędna IMPLEMENTACJA intencji r7 — sama intencja
 * „etykieta wizualnie na odcinku" pozostaje w mocy jako r7b/F5): traktował "przęsło" jako samą
 * szczelinę `COLUMN_GAP` (3×GRID = 24px) MIĘDZY kolumnami — etykieta kabla
 * (100-160px) nigdy się tam nie mieściła, więc KAŻDY segment lądował w slocie
 * 2 z obowiązkowym leaderem ("las leaderów"), co odwraca konwencję CAD
 * (leader = wyjątek, nie norma).
 *
 * Dwa pod-przypadki slotu 1 (bez leadera), rozróżnione geometrią:
 *  - etykieta mieści się CZYSTO między `spanStart`..`spanEnd` (dziś: rzadkie,
 *    bo `spanStart/spanEnd` to dziś krawędzie kolumn sąsiadów, nie
 *    tap-do-tap; docelowo — gdy F5 dostarczy prawdziwe punkty zaczepienia
 *    kabla — będzie to przypadek typowy) ⇒ WYŚRODKOWANA na przęśle, bez
 *    clampa do `primaryRect` (może swobodnie wystawać poza kolumnę, bo
 *    przęsło jest fizycznie szersze).
 *  - w przeciwnym razie (dziś: NORMA, bo `spanWidth` = `COLUMN_GAP` = 24px)
 *    ⇒ etykieta w `primaryRect`, z `x` biasowanym ku środkowi przęsła i
 *    dosuniętym (clamp) do granic `primaryRect` — w praktyce dosuwa etykietę
 *    do lewego skraju kolumny stacji docelowej ("kabel wchodzący do stacji
 *    j"), zgodnie z geometrią B1 z `columns.ts`.
 *
 * Slot 2 (z OBOWIĄZKOWYM leaderem do środka przęsła) istnieje TYLKO jako
 * ścieżka awaryjna — etykieta szersza niż `primaryRect` NIE WYSTĘPUJE z
 * KONSTRUKCJI w widoku sieci (patrz gwarancja `columns.ts` wyżej), ale
 * ścieżka musi istnieć i mieć pokrycie testowe (syntetyczne `primaryRect`
 * celowo za wąskie) — analogicznie do slotu 3 w `resolveSegmentLateralLabel`
 * niżej. Wymaga pola `marginRect` (throw z czytelnym komunikatem, gdy
 * potrzebny a nieobecny).
 */

import { GRID, rectsOverlap, snapDown, snapToGrid, type V3Rect } from '../core/grid';
import { labelLineHeight, measureLabelWidth, type LabelClass, type LabelRole, type LodClass } from '../core/text';

/** Właściciel etykiety (spec §4, tabela slotów). */
export type OwnerKind =
  | 'segment-span'      // segment magistrali poziomy (slot podstawowy = primaryRect, poprawka F4)
  | 'segment-lateral'    // segment pionowy (lateral), etykieta rotowana 90°
  // BLOK-LATERAL-WLASNOSC (runda poprawkowa 2026-08-08): adnotacja KOŃCA
  // ODCINKA — „koniec otwarty" (§16-v3) i odsyłacze ciągu dalszego na złamaniu
  // arkusza „dalej wiersz n"/„z wiersza n" (S9-1). Dotąd pożyczały
  // `'port-caption'`, czyli rodzaj PODPISU PORTU APARATU, przez co
  // `hitAreas.LABEL_OWNER_ELEMENT_KIND` deklarowało dla nich trafienie w
  // APARAT, podczas gdy ich `ownerRef` jest refem ODCINKA (zmierzone: 15
  // etykiet na fiksturze referencyjnej — 13 „koniec otwarty" + 2 odsyłacze).
  // To ta sama pomyłka własności co `#lateral-label` pod refem stacji, tylko
  // o piętro dalej: deklaracja celu kliknięcia rozjeżdżała się z refem.
  // WŁASNY rodzaj, a nie przestawienie `'port-caption'` — ten dzielą PRAWDZIWE
  // podpisy kierunku pola (`#direction`, `#caption`) i zakończenia toru
  // (`#termination`, ref POLA, zweryfikowane pomiarem), które celują w aparat
  // słusznie i zepsułoby je jedno wspólne przestawienie.
  | 'segment-endpoint'   // adnotacja KOŃCA odcinka (koniec otwarty, odsyłacz ciągu dalszego)
  | 'station-name'       // wiersz pasma nazw stacji (B5)
  | 'port-caption'       // podpis kierunku pola (t3, spec §9/§19.2: „⟨nazwa linii⟩ · kier. Sxx"/„odg. Sxx")
  | 'field-role'         // F10.2: oznaczenie FUNKCYJNE pola (spec §19.1: „pole liniowe"/…, t3)
  | 'apparatus'          // F10.2: identyfikator PER-APARAT (Q1/QE1/T1, spec §19.1, t4) — NIE etykieta pola
  | 'der'                // rodzaj+moc DER (t2) pod symbolem
  | 'busbar-voltage'     // napięcie szyny (t2) nad lewym końcem
  | 'no-point'           // badge „NO" (t3) przy symbolu
  | 'branch-point'       // ODG-RYSUNEK: nazwa punktu odgałęźnego (ZKSN / słup rozgałęźny) z danych
  | 'protection'         // F9.9: numer urządzenia „52" (spec §17.1/§17.3, ANSI/IEEE C37.2)
  | 'lv-load';           // recenzja NO-GO pkt 6: odbiór zagregowany / granica modelu (t4) pod szyną nN

/**
 * KD-11: KLASA ZNACZENIOWA etykiety wyprowadzona z RODZAJU WŁAŚCICIELA — dana
 * sceny, nie heurystyka po treści tekstu (`core/text.ts` `LabelRole`).
 *
 * TOŻSAMOŚĆ (co się rysuje):
 *  - `busbar-voltage` — napięcie szyny/sekcji („Sekcja 1 · 15 kV") — wprost z
 *    rozstrzygnięcia karty;
 *  - `apparatus` — oznaczenie pola/aparatu (numer pola WN „Pole liniowe GPZ",
 *    identyfikatory Q1/QE1/T1);
 *  - `field-role` — oznaczenie FUNKCYJNE pola („pole liniowe");
 *  - `der` — rodzaj i moc źródła rozproszonego, czyli JEGO nazwa na rysunku
 *    (symbol DER bez tej etykiety nie mówi, jakim jest źródłem);
 *  - `no-point` — badge „NO": punkt podziału sieci jest CECHĄ elementu (co to
 *    za łącznik), nie jego parametrem; dwa znaki, a jego brak zmienia odczyt
 *    układu pracy sieci na FAŁSZYWY. Spójne z `LABEL_PRIORITY` (90 — wyżej niż
 *    `der`/`apparatus`/`field-role`), gdzie już dziś jest chroniony jako
 *    „mały, krytyczny semantycznie".
 *  - `station-name` — pasmo MIESZANE (nazwa/kod stacji obok kVA i typu), więc
 *    klasy NIE da się wyprowadzić z rodzaju właściciela: rozstrzyga ją
 *    WIERSZ (`StationNameBandRow.role`, deklarowany przez `compose/*`).
 *    Wpis w tej tabeli jest DOMYŚLNY (tożsamość) i używany tylko wtedy, gdy
 *    wołający nie poda roli wiersza.
 *
 * DANE SZCZEGÓŁOWE (parametry i adnotacje — podlegają progowi czytelności):
 *  - `segment-span`/`segment-lateral` — typ·przekrój·długość (wprost
 *    „przekroje, długości" z rozstrzygnięcia karty);
 *  - `protection` — adnotacje warstwy zabezpieczeń (numer urządzenia C37.2,
 *    przekładnie CT, montaż VT, lista funkcji) — spec §17 nazywa je
 *    ADNOTACJAMI toru, a karta zalicza nastawy do danych szczegółowych;
 *  - `port-caption` — podpis kierunku pola („⟨linia⟩ · kier. S03") i
 *    zakończenia toru;
 *  - `lv-load` — odbiór zagregowany nN / granica modelu.
 */
export const LABEL_ROLE_BY_OWNER_KIND: Readonly<Record<OwnerKind, LabelRole>> = {
  'station-name': 'tozsamosc',
  'busbar-voltage': 'tozsamosc',
  apparatus: 'tozsamosc',
  'field-role': 'tozsamosc',
  der: 'tozsamosc',
  'no-point': 'tozsamosc',
  'branch-point': 'tozsamosc',
  protection: 'dane',
  'port-caption': 'dane',
  'segment-span': 'dane',
  'segment-lateral': 'dane',
  // BLOK-LATERAL-WLASNOSC: „koniec otwarty" i odsyłacze ciągu dalszego to
  // ADNOTACJE toru — ta sama klasa znaczeniowa co `port-caption`, którą dotąd
  // pożyczały, więc warstwa czytelności widzi DOKŁADNIE to samo co przed
  // zmianą (rozdział dotyczy CELU KLIKNIĘCIA, nie widoczności).
  'segment-endpoint': 'dane',
  'lv-load': 'dane',
};

/**
 * T2-LOD (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §„POLITYKA LOD nN") —
 * KLASA LOD z RODZAJU WŁAŚCICIELA: jedno źródło prawdy OBOK
 * `LABEL_ROLE_BY_OWNER_KIND` powyżej, ta sama zasada wyprowadzenia (dana
 * sceny, nigdy treść tekstu). `'station-name'` jest DOMYŚLNE — pasmo jest
 * MIESZANE (jak dla `LabelRole`), więc rozstrzyga WIERSZ; patrz `lodClassOf`.
 *
 * REGUŁA WYPROWADZENIA (KLASA §1/§3 — jedno kryterium, JEDNO ŹRÓDŁO, nie
 * druga tabela, która „dziś się zgadza" z pierwszą): `role==='tozsamosc'` ⇒
 * zawsze `'L0'` — wyprowadzone STRUKTURALNIE Z `LABEL_ROLE_BY_OWNER_KIND`
 * powyżej (nie przepisane ręcznie drugi raz), więc te dwie tabele fizycznie
 * NIE MOGĄ się rozjechać — BEZ ŻADNEJ zmiany istniejącej gwarancji KD-11
 * „tożsamość nigdy nie znika" (`canvas/labelLegibility.ts`). `role==='dane'`
 * dzieli się na `'L1'`/`'L2'` wg KLASY TYPOGRAFICZNEJ (`DANE_LOD_TIER_BY_
 * OWNER_KIND` niżej): `t2` (typ·przekrój·długość przęsła — dosłowny przykład
 * L1 z planu: „przekroje/długości kabli") = `'L1'`; `t3`/`t4` (adnotacje
 * drugorzędne: kierunek pola, koniec odcinka, nastawy zabezpieczeń, odbiór
 * zagregowany nN) = `'L2'`. Podział NIE zmienia ŻADNEGO progu zoomu
 * (`isLabelHiddenAtScale` w `core/text.ts` bez zmian) — `lodClass` jest dziś
 * WYŁĄCZNIE klasyfikacją (dowód wyroczniami w `canvas/__tests__/
 * politykaLodNn.contract.test.ts`), nie nowym mechanizmem ukrywania: zero
 * regresji na pinach bajtowych sceny/planu (`scene/__tests__/kosztSceny.test.ts`).
 */
const DANE_LOD_TIER_BY_OWNER_KIND: Partial<Record<OwnerKind, 'L1' | 'L2'>> = {
  'segment-span': 'L1',
  'segment-lateral': 'L1',
  'segment-endpoint': 'L2',
  'port-caption': 'L2',
  protection: 'L2',
  'lv-load': 'L2',
};

export const LOD_CLASS_BY_OWNER_KIND: Readonly<Record<OwnerKind, LodClass>> = Object.fromEntries(
  (Object.keys(LABEL_ROLE_BY_OWNER_KIND) as OwnerKind[]).map((kind) => [
    kind,
    LABEL_ROLE_BY_OWNER_KIND[kind] === 'tozsamosc' ? 'L0' : (DANE_LOD_TIER_BY_OWNER_KIND[kind] ?? 'L2'),
  ]),
) as Readonly<Record<OwnerKind, LodClass>>;

export interface LabelPoint {
  readonly x: number;
  readonly y: number;
}

/** Wynikowa etykieta z właścicielem, slotem i (gdy zapasowy) leader-line
 *  (spec §4 P2: „Przeniesienie do slotu zapasowego ⇒ obowiązkowy leader-line"). */
export interface OwnedLabel {
  readonly ownerRef: string;
  readonly ownerKind: OwnerKind;
  readonly labelClass: LabelClass;
  /** KD-11: klasa ZNACZENIOWA (tożsamość vs dane szczegółowe) — steruje
   *  widocznością w warstwie renderu (`canvas/labelLegibility.ts`). Dana
   *  sceny: dla pasma nazw z wiersza (`StationNameBandRow.role`), dla
   *  pozostałych z rodzaju właściciela (`LABEL_ROLE_BY_OWNER_KIND`).
   *  Geometrycznie NEUTRALNA — nie wchodzi do `rect`, więc nie rusza
   *  goldenów geometrii ani wyroczni sceny. */
  readonly labelRole: LabelRole;
  readonly text: string;
  /** 1 = idealny (bez leadera), 2/3 = zapasowy (leader OBOWIĄZKOWY). */
  readonly slotIndex: 1 | 2 | 3;
  /**
   * Prostokąt TUSZU — dokładnie tyle, ile zajmuje NARYSOWANY tekst w rozmiarze
   * swojej klasy (`measureLabelWidth` × `labelLineHeight`), NIE rezerwacja
   * slotu, w którym stoi.
   *
   * BLOK-PUSTY (zgłoszenie właściciela 2026-08-07 pkt 6 „wnętrze ramy stacji w
   * większości puste"): do tej karty wiersze pasma nazw dostawały tu CAŁĄ
   * szerokość kolumny stacji. Zmierzone na fixturze 53 stacji: prostokąt był
   * średnio **7,57×** szerszy od tekstu, który niesie (716 wobec 95 j.św.), i
   * ustawiał LEWĄ i PRAWĄ krawędź ramy bloku w **100%** bloków (`viewAnchor.
   * prostokatElementuWScenie` bierze prostokąty etykiet). Rama szła więc za
   * REZERWACJĄ, a nie za treścią — dokładnie to widać na zrzucie właściciela.
   * Reszta klas etykiet miała już wtedy 1,00× na obu osiach; wiersz pasma nazw
   * był jedynym wyjątkiem (pomiar w `scripts/pomiar_bloku.tsx`).
   *
   * REZERWACJA nie znikła — przeniosła się do `rezerwacjaSzerokosci` niżej,
   * bo jest realnie ZUŻYWANA (sufit powiększania pisma). Środek prostokąta
   * pozostaje ten sam co środek slotu, więc tekst (rysowany `textAnchor=
   * middle` w środku `rect`) NIE ZMIENIA POŁOŻENIA.
   */
  readonly rect: V3Rect;
  /** Segment pionowy (lateral): etykieta czytana z dołu, obrócona 90°. */
  readonly rotated?: boolean;
  readonly leader?: { readonly from: LabelPoint; readonly to: LabelPoint };
  /** Z3 (spec §12.1/§19.1): pochodzenie identyfikatora aparatu przeniesione na
   *  etykietę, żeby wyrocznia sceny (`apparatusIdentifierGaps`, `scene/
   *  buildScene.ts`) mogła rozróżnić DANĄ producencką (dowolny tekst
   *  identyfikowalny, np. „F1"/„TR") od fallbacku KONWENCJI (wzorzec Q\d+/QE\d+/
   *  T\d+) bez korelowania label↔symbol. `undefined` dla etykiet niebędących
   *  identyfikatorem aparatu (nazwa stacji, kierunek, DER, …). */
  readonly designationSource?: 'dane' | 'konwencja';
  /** W5 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §12–15/uwaga 7): przeznaczenie CT
   *  z danych (`Measurement.purpose`) — WYŁĄCZNIE dla etykiet adnotacji CT
   *  (`ownerKind:'protection'`, `#ct-rating-…`). Kanał audytu (atrybut DOM
   *  `data-ct-purpose`), geometrycznie neutralny (NIE wpływa na `text`/`rect`).
   *  `undefined` dla pozostałych etykiet. */
  readonly ctPurpose?: 'protection' | 'metering' | 'combined';
  /** KD-11: STRONA, po której slot leży względem swojej kotwicy (symbolu,
   *  toru, pasma). Potrzebna WYŁĄCZNIE etykietom klasy `'tozsamosc'`: gdy
   *  render powiększa pismo do rozmiaru minimalnego czytelnego, prostokąt
   *  rośnie OD kotwicy (etykieta nad szyną rośnie w GÓRĘ), więc prześwit od
   *  toru (`BUSBAR_LABEL_PATH_CLEARANCE`) i odstęp od symbolu zostają
   *  zachowane. Każda etykieta tożsamości ją niesie (kontrakt sprawdzany
   *  testem); etykiety klasy `'dane'` nigdy nie są powiększane, więc mogą jej
   *  nie mieć. Geometrycznie neutralna — `rect` bez zmian. */
  readonly placement?: SimpleAnchorPlacement;
  /**
   * BLOK-PUSTY: SZEROKOŚĆ REZERWACJI, w której napis wolno POWIĘKSZYĆ
   * (`canvas/labelLegibility.ts`, tryb ratunkowy KD-11: przy oddaleniu pismo
   * tożsamości rośnie do rozmiaru minimalnego czytelnego). Dla wiersza pasma
   * nazw to szerokość KOLUMNY stacji — powiększony wiersz nie ma prawa wyjść
   * poza własną kolumnę.
   *
   * DWA KOŃCE PARY, JEDNO ŹRÓDŁO (reguła KLASA §3): `rect` mówi, ILE TUSZU
   * jest narysowane (rama bloku, kolizje, trafienie kursorem), a to pole — DO
   * ILU wolno urosnąć. Do karty BLOK-PUSTY obie role niosło jedno pole `rect`,
   * więc rama bloku płaciła pełną szerokość kolumny (716 j.św.) za napis
   * szerokości 95 j.św.
   *
   * `undefined` = etykieta zakotwiczona punktowo (oznacznik aparatu, DER,
   * napięcie szyny) — nie ma rezerwacji z zapasem, jej granicą jest dopiero
   * rozstrzyganie kolizji.
   */
  readonly rezerwacjaSzerokosci?: number;
  /**
   * T2-LOD (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §„POLITYKA LOD nN",
   * wyjątek bezwzględny) — element w stanie błędu/UNRESOLVED (walidacja grafu
   * elektrycznego T0/T1: aparat nierozwiązywalny na model, status SLD
   * INVALID/MODEL INCOMPLETE). `true` wymusza `lodClassOf(label) === 'L0'`
   * niezależnie od `ownerKind`/`labelRole` — etykieta NIGDY nie trafia do
   * `hiddenDetail` (`canvas/labelLegibility.ts`), więc licznik „Ukryto N
   * opisów" jej nie policzy jako zwykłej danej ukrytej progiem zoomu.
   * Geometrycznie NEUTRALNE (nie wchodzi do `rect`).
   *
   * `undefined`/`false` = zachowanie BEZ ZMIANY. Domyślnie `undefined` — dziś
   * ŻADEN wytwórca etykiety go nie ustawia (wykrywanie UNRESOLVED to zakres
   * walidacji grafu T0/T1, poza tą kartą), więc pole jest gotowe na
   * podłączenie bez zmiany istniejących wytwórców/testów.
   */
  readonly unresolved?: boolean;
}

/**
 * T2-LOD — KLASA LOD EFEKTYWNA etykiety (jedno źródło prawdy dla warstwy
 * renderu i dla wyroczni; patrz `LodClass` w `core/text.ts`). Kolejność
 * rozstrzygania:
 *  1. `unresolved === true` ⇒ zawsze `'L0'` (wyjątek bezwzględny planu —
 *     nadpisuje WSZYSTKO poniżej);
 *  2. `ownerKind === 'station-name'` ⇒ pasmo MIESZANE, rozstrzyga WIERSZ
 *     (`label.labelRole`): `'tozsamosc'` → `'L0'`, `'dane'` → `'L1'`/`'L2'`
 *     wg tej samej reguły klasy typograficznej co `LOD_CLASS_BY_OWNER_KIND`
 *     (dokumentacja tam);
 *  3. w pozostałych przypadkach — `LOD_CLASS_BY_OWNER_KIND[ownerKind]`.
 */
export function lodClassOf(label: OwnedLabel): LodClass {
  if (label.unresolved === true) return 'L0';
  if (label.ownerKind === 'station-name') {
    if (label.labelRole === 'tozsamosc') return 'L0';
    return label.labelClass === 't2' ? 'L1' : 'L2';
  }
  return LOD_CLASS_BY_OWNER_KIND[label.ownerKind];
}

/**
 * BLOK-PUSTY: prostokąt TUSZU wpisany w slot — szerokość z REALNEGO pomiaru
 * tekstu, środek slotu NIETKNIĘTY (tekst rysowany `textAnchor=middle` w środku
 * prostokąta nie drga, więc obraz się nie przesuwa), wysokość slotu zachowana
 * (jest już równa wysokości wiersza we WSZYSTKICH klasach — pomiar
 * `scripts/pomiar_bloku.tsx`: 1,00× na osi pionowej dla każdej klasy).
 *
 * `rotated` (etykieta lateralu, czytana z dołu): rozciągłość tekstu leży wzdłuż
 * osi PIONOWEJ prostokąta, więc zwężamy `height`, nie `width`.
 *
 * Prostokąt NIGDY nie rośnie — slot węższy od tekstu zostaje bez zmian, żeby
 * „zwężenie" nie mogło przypadkiem POSZERZYĆ rezerwacji policzonej przez
 * wołającego.
 */
function tuszWSlocie(slot: V3Rect, text: string, cls: LabelClass, rotated = false): V3Rect {
  const tusz = measureLabelWidth(text, cls);
  if (rotated) {
    if (tusz >= slot.height) return slot;
    return { x: slot.x, y: slot.y + (slot.height - tusz) / 2, width: slot.width, height: tusz };
  }
  if (tusz >= slot.width) return slot;
  return { x: slot.x + (slot.width - tusz) / 2, y: slot.y, width: tusz, height: slot.height };
}

// ---------------------------------------------------------------------------
// Segment poziomy magistrali — slot podstawowy = primaryRect (poprawka F4, patrz
// DECYZJA WIĄŻĄCA NADZORCY w nagłówku pliku).
// ---------------------------------------------------------------------------

export interface SegmentSpanOwnerInput {
  readonly ownerRef: string;
  readonly text: string;
  /** Prawa krawędź kolumny j-1 (lub krawędź bloku GPZ dla pierwszego segmentu). */
  readonly spanStart: number;
  /** Lewa krawędź kolumny j (stacji, do której wchodzi segment). */
  readonly spanEnd: number;
  /** Y osi magistrali (B2) — cel leadera w pionie, gdy slot zapasowy. */
  readonly busAxisY: number;
  /** Prostokąt zarezerwowany przez `columns.ts` (`SegmentLabelSlotResult.rect`)
   *  w kolumnie stacji docelowej, w wierszu wskazanym przez stagger — z
   *  KONSTRUKCJI wystarczająco szeroki dla etykiety (patrz DECYZJA w
   *  nagłówku pliku: `columns.ts` gwarantuje `width >= szerokość etykiety`).
   *  To jest slot PODSTAWOWY (1), nie zapasowy — etykieta ląduje tu w
   *  normalnym przypadku, bez leadera. */
  readonly primaryRect: V3Rect;
  /** Slot zapasowy (2, z OBOWIĄZKOWYM leaderem) — WYMAGANY tylko, gdy
   *  etykieta nie mieści się nawet w `primaryRect` (nie występuje z
   *  KONSTRUKCJI w widoku sieci — patrz DECYZJA w nagłówku pliku — ale
   *  ścieżka musi istnieć; funkcja rzuca, gdy potrzebny a nieobecny, tak jak
   *  `fallbackRect` w `resolveSegmentLateralLabel`). */
  readonly marginRect?: V3Rect;
  /** T2-LOD passthrough 1:1 na `OwnedLabel.unresolved` — wyjątek bezwzględny
   *  LOD dla odcinka w stanie błędu/UNRESOLVED. `undefined` = bez zmiany. */
  readonly unresolved?: boolean;
}

function resolveSegmentSpanLabel(owner: SegmentSpanOwnerInput): OwnedLabel {
  const labelClass: LabelClass = 't2';
  const labelWidth = measureLabelWidth(owner.text, labelClass);
  const spanWidth = owner.spanEnd - owner.spanStart;
  const spanCenterX = (owner.spanStart + owner.spanEnd) / 2;
  const fitsSpan = spanWidth > 0 && labelWidth <= spanWidth;

  if (fitsSpan) {
    // Etykieta mieści się CZYSTO na przęśle (docelowo: tap-do-tap z F5) —
    // wyśrodkowana na przęśle, ale ZAWSZE dosunięta (clamp) do granic
    // `primaryRect`. F10.1 (korekta nadzorcy): kolorowanie wierszy
    // (`colorSegmentLabelRows`, columns.ts) dowodzi ROZŁĄCZNOŚCI wyłącznie
    // rezerwacji `primaryRect` — etykieta wystająca poza swoją rezerwację
    // unieważnia ten dowód (wykryte na fixturze po poszerzeniu kolumn §18.1:
    // etykieta przęsła S01 wycentrowana na przęśle weszła w rezerwację S02,
    // kolizja w overlap_probe). `columns.ts` GWARANTUJE
    // `primaryRect.width >= labelWidth` (nagłówek pliku), więc clamp jest
    // zawsze wykonalny i nie zmienia szerokości.
    const rawX = snapToGrid(spanCenterX - labelWidth / 2);
    const maxFitX = owner.primaryRect.x + owner.primaryRect.width - labelWidth;
    const x = Math.min(Math.max(rawX, owner.primaryRect.x), Math.max(maxFitX, owner.primaryRect.x));
    return {
      ownerRef: owner.ownerRef,
      ownerKind: 'segment-span',
      labelClass,
      labelRole: LABEL_ROLE_BY_OWNER_KIND['segment-span'],
      text: owner.text,
      slotIndex: 1,
      rect: { x, y: owner.primaryRect.y, width: labelWidth, height: owner.primaryRect.height },
      ...(owner.unresolved !== undefined ? { unresolved: owner.unresolved } : {}),
    };
  }

  if (labelWidth <= owner.primaryRect.width) {
    // Norma dzisiejsza: przęsło (krawędzie kolumn, COLUMN_GAP=24px) za wąskie,
    // ale primaryRect (rezerwacja columns.ts) z KONSTRUKCJI mieści etykietę.
    // x biasowany ku środkowi przęsła, dosunięty (clamp) do granic
    // primaryRect — w praktyce dosuwa etykietę do lewego skraju kolumny
    // stacji docelowej ("kabel wchodzący do stacji j").
    const rawX = snapToGrid(spanCenterX - labelWidth / 2);
    const maxX = owner.primaryRect.x + owner.primaryRect.width - labelWidth;
    const x = Math.min(Math.max(rawX, owner.primaryRect.x), Math.max(maxX, owner.primaryRect.x));
    return {
      ownerRef: owner.ownerRef,
      ownerKind: 'segment-span',
      labelClass,
      labelRole: LABEL_ROLE_BY_OWNER_KIND['segment-span'],
      text: owner.text,
      slotIndex: 1,
      rect: { x, y: owner.primaryRect.y, width: labelWidth, height: owner.primaryRect.height },
      ...(owner.unresolved !== undefined ? { unresolved: owner.unresolved } : {}),
    };
  }

  if (!owner.marginRect) {
    throw new Error(
      `Segment „${owner.ownerRef}": etykieta nie mieści się ani na przęśle, ani w primaryRect (rezerwacji columns.ts), a marginRect (slot zapasowy, spec §4) nie został dostarczony.`,
    );
  }
  return {
    ownerRef: owner.ownerRef,
    ownerKind: 'segment-span',
    labelClass,
    labelRole: LABEL_ROLE_BY_OWNER_KIND['segment-span'],
    text: owner.text,
    slotIndex: 2,
    // BLOK-PUSTY (ta sama reguła co pasmo nazw — KLASA §5, uczciwość w obrębie
    // pliku): prostokąt niesie TUSZ, slot marginesu zostaje REZERWACJĄ. Środek
    // nietknięty, więc kotwica leadera (liczona ze środka/dna prostokąta) się
    // nie rusza. Na sieci referencyjnej ta ścieżka nie występuje (0/37 etykiet
    // przęseł na fixturze idzie do slotu 2 — pomiar `scripts/pomiar_bloku.tsx`),
    // ale reguła nie może mieć wyjątku „bo tam i tak nikt nie wchodzi".
    rect: tuszWSlocie(owner.marginRect, owner.text, labelClass),
    rezerwacjaSzerokosci: owner.marginRect.width,
    leader: {
      from: {
        x: owner.marginRect.x + owner.marginRect.width / 2,
        y: owner.marginRect.y + owner.marginRect.height,
      },
      to: { x: spanCenterX, y: owner.busAxisY },
    },
    ...(owner.unresolved !== undefined ? { unresolved: owner.unresolved } : {}),
  };
}

// ---------------------------------------------------------------------------
// Segment pionowy (lateral) — spec §4: slot 1 PO LEWEJ linii, slot 2 PO
// PRAWEJ, slot 3 margines + leader. Etykieta rotowana 90°, czytana z dołu —
// więc jej "szerokość" (measureLabelWidth) zajmuje przestrzeń PIONOWĄ wzdłuż
// linii, a wysokość wiersza (labelLineHeight) przestrzeń POZIOMĄ (grubość
// bloku tekstu odsuniętą od linii).
// ---------------------------------------------------------------------------

export interface SegmentLateralOwnerInput {
  readonly ownerRef: string;
  readonly text: string;
  readonly lineX: number;
  readonly lineYStart: number;
  readonly lineYEnd: number;
  /** Dostępny prześwit PO LEWEJ linii (do sąsiedniej przeszkody/korytarza).
   *  Brak = brak ograniczenia (`Infinity`). */
  readonly leftClearance?: number;
  /** Dostępny prześwit PO PRAWEJ linii. Brak = brak ograniczenia. */
  readonly rightClearance?: number;
  /** Slot 3 (margines + leader) — WYMAGANY, gdy ani lewo, ani prawo się nie
   *  mieszczą (funkcja rzuca, gdy potrzebny, a nieobecny — wołający musi
   *  policzyć margines korytarza z layoutu, tak jak `columns.ts` dla segmentu
   *  poziomego). */
  readonly fallbackRect?: V3Rect;
  /** T2-LOD passthrough 1:1 na `OwnedLabel.unresolved` — wyjątek bezwzględny
   *  LOD dla odcinka w stanie błędu/UNRESOLVED. `undefined` = bez zmiany. */
  readonly unresolved?: boolean;
}

function resolveSegmentLateralLabel(owner: SegmentLateralOwnerInput): OwnedLabel {
  const labelClass: LabelClass = 't2';
  const alongLine = measureLabelWidth(owner.text, labelClass); // rozciągłość WZDŁUŻ linii (po rotacji)
  const acrossLine = labelLineHeight(labelClass); // grubość bloku tekstu PROSTOPADLE do linii
  const lineLength = Math.abs(owner.lineYEnd - owner.lineYStart);
  const centerY = (owner.lineYStart + owner.lineYEnd) / 2;
  const fitsLength = alongLine <= lineLength;

  const leftClearance = owner.leftClearance ?? Infinity;
  const rightClearance = owner.rightClearance ?? Infinity;
  const required = acrossLine + GRID; // prześwit GRID między tekstem a linią

  if (fitsLength && leftClearance >= required) {
    const x = snapToGrid(owner.lineX - GRID - acrossLine);
    return {
      ownerRef: owner.ownerRef,
      ownerKind: 'segment-lateral',
      labelClass,
      labelRole: LABEL_ROLE_BY_OWNER_KIND['segment-lateral'],
      text: owner.text,
      slotIndex: 1,
      rotated: true,
      rect: { x, y: centerY - alongLine / 2, width: acrossLine, height: alongLine },
      ...(owner.unresolved !== undefined ? { unresolved: owner.unresolved } : {}),
    };
  }

  if (fitsLength && rightClearance >= required) {
    const x = snapToGrid(owner.lineX + GRID);
    return {
      ownerRef: owner.ownerRef,
      ownerKind: 'segment-lateral',
      labelClass,
      labelRole: LABEL_ROLE_BY_OWNER_KIND['segment-lateral'],
      text: owner.text,
      slotIndex: 2,
      rotated: true,
      rect: { x, y: centerY - alongLine / 2, width: acrossLine, height: alongLine },
      ...(owner.unresolved !== undefined ? { unresolved: owner.unresolved } : {}),
    };
  }

  if (!owner.fallbackRect) {
    throw new Error(
      `Lateral „${owner.ownerRef}": etykieta nie mieści się ani po lewej, ani po prawej linii, a fallbackRect (slot 3, spec §4) nie został dostarczony.`,
    );
  }
  return {
    ownerRef: owner.ownerRef,
    ownerKind: 'segment-lateral',
    labelClass,
    labelRole: LABEL_ROLE_BY_OWNER_KIND['segment-lateral'],
    text: owner.text,
    slotIndex: 3,
    rotated: true,
    // BLOK-PUSTY (jak wyżej): tusz zamiast slotu. Etykieta lateralu jest
    // OBRÓCONA, więc rozciągłość tekstu leży na osi pionowej prostokąta —
    // zwężamy `height`. Środek nietknięty ⇒ kotwica leadera bez zmian.
    rect: tuszWSlocie(owner.fallbackRect, owner.text, labelClass, true),
    rezerwacjaSzerokosci: owner.fallbackRect.height,
    leader: {
      from: {
        x: owner.fallbackRect.x + owner.fallbackRect.width / 2,
        y: owner.fallbackRect.y + owner.fallbackRect.height / 2,
      },
      to: { x: owner.lineX, y: centerY },
    },
    ...(owner.unresolved !== undefined ? { unresolved: owner.unresolved } : {}),
  };
}

// ---------------------------------------------------------------------------
// Pasmo nazw stacji (B5, spec §4: „kolejność pionowa stała"). Wiersze
// dostarczone przez wołającego JUŻ w kolejności i TYLKO obecne (ta sama
// zasada co `measure.ts` `stationNameBandHeight` — pusty wiersz nie rezerwuje
// miejsca na nic, więc go tu po prostu nie ma na wejściu).
// ---------------------------------------------------------------------------

export interface StationNameBandRow {
  readonly text: string;
  readonly labelClass: LabelClass;
  /** KD-11: klasa ZNACZENIOWA wiersza — WYMAGANA, bo pasmo nazw jest
   *  MIESZANE: nazwa/kod stacji, oznaczenie transformatora, nazwa źródła i
   *  podpis szyny nN to TOŻSAMOŚĆ, a moc znamionowa, typ stacji, Yd11/uk%/Pk,
   *  zaczepy czy odbiór zagregowany to DANE SZCZEGÓŁOWE. Klasa typograficzna
   *  tego nie rozstrzyga (nazwa źródła jest `t2`, tak jak „Yd11 · 25 MVA"),
   *  a treść tekstu nie jest dowodem — deklaruje wytwórca wiersza. */
  readonly role: LabelRole;
  /** T2-LOD passthrough 1:1 na `OwnedLabel.unresolved` — wyjątek bezwzględny
   *  LOD dla wiersza pasma opisującego element w stanie błędu/UNRESOLVED
   *  (np. transformator nierozwiązywalny na model). `undefined` = bez zmiany
   *  (klasa LOD wiersza wynika wtedy z `role`, patrz `lodClassOf`). */
  readonly unresolved?: boolean;
}

export interface StationNameBandOwnerInput {
  readonly ownerRef: string;
  /** Slot pasma nazw (B5) spod tej stacji — `ColumnResult.nameSlot` z `columns.ts`. */
  readonly nameSlot: V3Rect;
  readonly rows: readonly StationNameBandRow[];
}

function resolveStationNameBand(owner: StationNameBandOwnerInput): OwnedLabel[] {
  let y = owner.nameSlot.y;
  return owner.rows.map((row, index) => {
    const height = labelLineHeight(row.labelClass);
    const label: OwnedLabel = {
      ownerRef: `${owner.ownerRef}#name-row-${index}`,
      ownerKind: 'station-name',
      labelClass: row.labelClass,
      labelRole: row.role,
      text: row.text,
      slotIndex: 1,
      // BLOK-PUSTY: TUSZ, nie slot. Wiersz jest wyśrodkowany w kolumnie tak
      // samo jak dotąd (środek prostokąta = środek slotu), ale rama bloku,
      // kolizje i trafienie kursorem widzą już tylko napis. Rezerwacja
      // (szerokość kolumny) idzie do `rezerwacjaSzerokosci` niżej.
      rect: tuszWSlocie({ x: owner.nameSlot.x, y, width: owner.nameSlot.width, height }, row.text, row.labelClass),
      rezerwacjaSzerokosci: owner.nameSlot.width,
      // KD-11: pasmo nazw wisi POD swoją kotwicą (symbolem/stacją) i rośnie w
      // dół — powiększone pismo tożsamości nie może wejść w symbol nad sobą.
      placement: 'below',
      ...(row.unresolved !== undefined ? { unresolved: row.unresolved } : {}),
    };
    y += height;
    return label;
  });
}

// ---------------------------------------------------------------------------
// Podpis kierunku pola (spec §9/§4): slot 1 nad portem (własny wycinek B2
// zarezerwowany dla tego pola), slot 2 obok z leaderem.
// ---------------------------------------------------------------------------

export interface PortCaptionOwnerInput {
  readonly ownerRef: string;
  /** „kier. S03" / „odg. S15" (spec §9) — tekst gotowy, bez formatowania tu. */
  readonly text: string;
  /** Pozycja portu (środek wycinka pola) w świecie. */
  readonly anchorX: number;
  /** Własny wycinek B2 zarezerwowany dla tego pola (nie nachodzi na sąsiednie
   *  pola tej samej stacji — odpowiedzialność wołającego, analogicznie do
   *  rezerwacji `bayColumnRequiredWidth` w `measure.ts`). */
  readonly primaryRect: V3Rect;
  /** Slot 2 (obok, z leaderem) — wymagany, gdy podpis nie mieści się w `primaryRect`. */
  readonly fallbackRect?: V3Rect;
  /** T2-LOD passthrough 1:1 na `OwnedLabel.unresolved` — wyjątek bezwzględny
   *  LOD dla podpisu portu w stanie błędu/UNRESOLVED. `undefined` = bez zmiany. */
  readonly unresolved?: boolean;
}

function resolvePortCaption(owner: PortCaptionOwnerInput): OwnedLabel {
  const labelClass: LabelClass = 't3';
  const labelWidth = measureLabelWidth(owner.text, labelClass);
  const fitsPrimary = labelWidth <= owner.primaryRect.width;

  if (fitsPrimary) {
    const rawX = snapToGrid(owner.anchorX - labelWidth / 2);
    const maxX = owner.primaryRect.x + owner.primaryRect.width - labelWidth;
    const x = Math.min(Math.max(rawX, owner.primaryRect.x), Math.max(maxX, owner.primaryRect.x));
    return {
      ownerRef: owner.ownerRef,
      ownerKind: 'port-caption',
      labelClass,
      labelRole: LABEL_ROLE_BY_OWNER_KIND['port-caption'],
      text: owner.text,
      slotIndex: 1,
      rect: { x, y: owner.primaryRect.y, width: labelWidth, height: owner.primaryRect.height },
      ...(owner.unresolved !== undefined ? { unresolved: owner.unresolved } : {}),
    };
  }

  if (!owner.fallbackRect) {
    throw new Error(
      `Podpis portu „${owner.ownerRef}": nie mieści się w primaryRect, a fallbackRect (slot 2, spec §4) nie został dostarczony.`,
    );
  }
  return {
    ownerRef: owner.ownerRef,
    ownerKind: 'port-caption',
    labelClass,
    labelRole: LABEL_ROLE_BY_OWNER_KIND['port-caption'],
    text: owner.text,
    slotIndex: 2,
    // BLOK-PUSTY (jak wyżej): tusz zamiast slotu, środek nietknięty.
    rect: tuszWSlocie(owner.fallbackRect, owner.text, labelClass),
    rezerwacjaSzerokosci: owner.fallbackRect.width,
    leader: {
      from: {
        x: owner.fallbackRect.x + owner.fallbackRect.width / 2,
        y: owner.fallbackRect.y + owner.fallbackRect.height / 2,
      },
      to: { x: owner.anchorX, y: owner.primaryRect.y + owner.primaryRect.height },
    },
    ...(owner.unresolved !== undefined ? { unresolved: owner.unresolved } : {}),
  };
}

// ---------------------------------------------------------------------------
// Etykiety z JEDNYM slotem wg tabeli §4 (bez alternatywy w spec): oznacznik
// aparatu (obok aparatu), DER (pod symbolem), napięcie szyny (nad lewym
// końcem), badge „NO" (przy symbolu). Wspólna geometria: prostokąt
// zaczepiony o punkt kotwiczenia, przesunięty w stronę `placement` o GRID.
// ---------------------------------------------------------------------------

export type SimpleAnchorPlacement = 'above' | 'below' | 'left' | 'right';

export interface SimpleAnchoredOwnerInput {
  readonly ownerRef: string;
  readonly ownerKind: 'apparatus' | 'field-role' | 'der' | 'busbar-voltage' | 'no-point' | 'protection' | 'lv-load' | 'branch-point';
  readonly text: string;
  readonly labelClass: LabelClass;
  readonly anchor: LabelPoint;
  readonly placement: SimpleAnchorPlacement;
  /** Z3 (spec §12.1): pochodzenie identyfikatora aparatu (`'dane'`/`'konwencja'`)
   *  — przenoszone 1:1 na `OwnedLabel.designationSource`. `undefined` dla
   *  właścicieli innych niż identyfikator aparatu. */
  readonly designationSource?: 'dane' | 'konwencja';
  /** W5 (§12–15/uwaga 7): przeznaczenie CT (`Measurement.purpose`) —
   *  przenoszone 1:1 na `OwnedLabel.ctPurpose`. WYŁĄCZNIE dla adnotacji CT
   *  (`ownerKind:'protection'`); `undefined` dla reszty. */
  readonly ctPurpose?: 'protection' | 'metering' | 'combined';
  /** KD-8 poz. 5: PRZEŚWIT slotu od kotwicy [px świata]. Domyślnie `GRID` (8) —
   *  tyle wystarcza etykiecie zakotwiczonej na SYMBOLU (symbol ma własny bbox,
   *  a wyrocznia etykieta↔symbol pilnuje rozłączności). Etykieta zakotwiczona
   *  na TORZE (napięcie szyny) potrzebuje więcej: 8 px świata przy skali
   *  przeglądowej to ~4 px ekranu, więc podpis „Sekcja 1 · 15 kV" siadał na
   *  szynie (pomiar zrzutu odbiorczego KD-5: prześwit 7 px świata). */
  readonly clearance?: number;
  /** T2-LOD passthrough 1:1 na `OwnedLabel.unresolved` — wyjątek bezwzględny
   *  LOD dla etykiety opisującej element w stanie błędu/UNRESOLVED.
   *  `undefined` = bez zmiany. */
  readonly unresolved?: boolean;
}

function resolveSimpleAnchoredLabel(owner: SimpleAnchoredOwnerInput): OwnedLabel {
  const width = measureLabelWidth(owner.text, owner.labelClass);
  const height = labelLineHeight(owner.labelClass);
  const przeswit = owner.clearance ?? GRID;
  let x: number;
  let y: number;
  switch (owner.placement) {
    case 'above':
      x = owner.anchor.x - width / 2;
      y = owner.anchor.y - przeswit - height;
      break;
    case 'below':
      x = owner.anchor.x - width / 2;
      y = owner.anchor.y + przeswit;
      break;
    case 'left':
      x = owner.anchor.x - przeswit - width;
      y = owner.anchor.y - height / 2;
      break;
    case 'right':
      x = owner.anchor.x + przeswit;
      y = owner.anchor.y - height / 2;
      break;
  }
  // KD-8 poz. 5: przy JAWNIE zadeklarowanym prześwicie przyciąganie do siatki
  // idzie ZAWSZE OD kotwicy (w górę dla „above", w lewo dla „left" itd.), a nie
  // do najbliższego węzła — inaczej zaokrąglenie zjada do połowy oczka i slot
  // ląduje bliżej toru, niż deklaruje kontrakt (pomiar: 16 zadeklarowane → 15
  // po `snapToGrid`). Bez deklaracji prześwitu zachowanie jest DOKŁADNIE takie
  // jak dotąd (`snapToGrid` w obu osiach), więc geometria pozostałych etykiet
  // się nie rusza.
  const jawnyPrzeswit = owner.clearance !== undefined;
  const snapX = jawnyPrzeswit && owner.placement === 'left' ? snapDown : snapToGrid;
  const snapY = jawnyPrzeswit && owner.placement === 'above' ? snapDown : snapToGrid;
  return {
    ownerRef: owner.ownerRef,
    ownerKind: owner.ownerKind,
    labelClass: owner.labelClass,
    labelRole: LABEL_ROLE_BY_OWNER_KIND[owner.ownerKind],
    text: owner.text,
    slotIndex: 1,
    rect: { x: snapX(x), y: snapY(y), width, height },
    // KD-11: strona slotu względem kotwicy — kierunek, w którym prostokąt
    // rośnie, gdy render powiększa pismo tożsamości do rozmiaru minimalnego
    // (etykieta „above" rośnie w górę, więc prześwit od toru zostaje).
    placement: owner.placement,
    // Z3 (spec §12.1): passthrough pochodzenia identyfikatora aparatu (tylko
    // etykiety `ownerKind:'apparatus'` niosą wartość; reszta `undefined`).
    ...(owner.designationSource !== undefined ? { designationSource: owner.designationSource } : {}),
    // W5 (§12–15/uwaga 7): passthrough przeznaczenia CT (tylko adnotacje CT
    // `ownerKind:'protection'` niosą wartość) — geometrycznie neutralny.
    ...(owner.ctPurpose !== undefined ? { ctPurpose: owner.ctPurpose } : {}),
    // T2-LOD: passthrough wyjątku bezwzględnego LOD (błąd/UNRESOLVED).
    ...(owner.unresolved !== undefined ? { unresolved: owner.unresolved } : {}),
  };
}

// ---------------------------------------------------------------------------
// Wejście/wyjście resolvera.
// ---------------------------------------------------------------------------

export interface ResolveLabelsInput {
  readonly segmentSpans?: readonly SegmentSpanOwnerInput[];
  readonly segmentLaterals?: readonly SegmentLateralOwnerInput[];
  readonly stationNameBands?: readonly StationNameBandOwnerInput[];
  readonly portCaptions?: readonly PortCaptionOwnerInput[];
  /** Aparat/DER/napięcie szyny/badge NO — jeden slot wg tabeli §4. */
  readonly simpleAnchored?: readonly SimpleAnchoredOwnerInput[];
}

/**
 * Rozwiązuje wszystkich właścicieli etykiet na konkretne prostokąty (spec
 * §5.5). Czysta funkcja: kolejność wejścia determinuje kolejność wyjścia
 * (P7) — każdy właściciel jest rozwiązywany NIEZALEŻNIE od pozostałych
 * (brak stanu współdzielonego, brak globalnego przeszukiwania wolnego
 * miejsca) — kolizje są niemożliwe Z KONSTRUKCJI dzięki temu, że sloty
 * wejściowe (rects z `columns.ts`/`bands.ts`) są już wzajemnie rozłączne
 * (spec §11.1, wyrocznia F2/F3); `overlapProbe` niżej to siatka
 * bezpieczeństwa (spec §4: „Wyrocznia kolizji = siatka bezpieczeństwa, nie
 * mechanizm"), nie mechanizm rozstrzygający.
 */
export function resolveLabels(input: ResolveLabelsInput): readonly OwnedLabel[] {
  const out: OwnedLabel[] = [];
  for (const owner of input.segmentSpans ?? []) out.push(resolveSegmentSpanLabel(owner));
  for (const owner of input.segmentLaterals ?? []) out.push(resolveSegmentLateralLabel(owner));
  for (const owner of input.stationNameBands ?? []) out.push(...resolveStationNameBand(owner));
  for (const owner of input.portCaptions ?? []) out.push(resolvePortCaption(owner));
  for (const owner of input.simpleAnchored ?? []) out.push(resolveSimpleAnchoredLabel(owner));
  return out;
}

// ---------------------------------------------------------------------------
// Wyrocznie (spec §11.1, rozszerzone o bbox symboli).
// ---------------------------------------------------------------------------

export interface OverlapProbeResult {
  readonly overlapCount: number;
  /** Pary `ownerRef` (etykieta↔etykieta) lub `ownerRef`↔`symbol#<index>`
   *  (etykieta↔symbol) w kolizji — do diagnostyki w testach/CI. */
  readonly pairs: readonly (readonly [string, string])[];
}

/**
 * overlap_probe (spec §11.1): zero kolizji tekst↔tekst i tekst↔symbol.
 * Czysta geometria (`rectsOverlap`, `core/grid.ts`) — bez znajomości typów
 * domenowych. `symbolRects` to bboxy symboli (F5+) — opcjonalne, bo F4 nie
 * komponuje jeszcze pełnej sceny.
 */
export function overlapProbe(
  labels: readonly OwnedLabel[],
  symbolRects: readonly V3Rect[] = [],
): OverlapProbeResult {
  const pairs: (readonly [string, string])[] = [];

  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (rectsOverlap(labels[i].rect, labels[j].rect)) {
        pairs.push([labels[i].ownerRef, labels[j].ownerRef]);
      }
    }
  }

  labels.forEach((label) => {
    symbolRects.forEach((rect, symbolIndex) => {
      if (rectsOverlap(label.rect, rect)) {
        pairs.push([label.ownerRef, `symbol#${symbolIndex}`]);
      }
    });
  });

  return { overlapCount: pairs.length, pairs };
}

/** Wyrocznia pomocnicza (P2 hard rule): slot zapasowy (`slotIndex >= 2`) MUSI
 *  mieć leader-line. Używana w testach jako kontrola negatywna (etykieta
 *  ręcznie skonstruowana bez leadera przy slocie zapasowym MUSI dać `false`). */
export function leaderInvariantHolds(labels: readonly OwnedLabel[]): boolean {
  return labels.every((label) => label.slotIndex < 2 || label.leader != null);
}

/**
 * BLOK-PUSTY: prostokąt REZERWACJI etykiety — `rect` rozciągnięty (wokół
 * WŁASNEGO środka, więc bez przesunięcia) do `rezerwacjaSzerokosci`. Bez
 * rezerwacji zwraca `rect` bez zmian.
 *
 * KIEDY REZERWACJA, A KIEDY TUSZ (rozstrzygnięcie karty; dwa pytania, dwie
 * odpowiedzi, jedno źródło):
 *  - TUSZ (`rect`) — wszystko, co odpowiada na pytanie „co widzi oko":
 *    rama bloku stacji i kotwica kamery (`canvas/viewAnchor.ts`), trafienie
 *    kursorem (`canvas/hitAreas.ts`), kolizje etykieta↔etykieta/etykieta↔tor;
 *  - REZERWACJA (ta funkcja) — wszystko, co odpowiada na pytanie „jak szeroki
 *    jest UKŁAD": bbox sceny (rozmiar arkusza), cel dopasowania kamery,
 *    światła bbox-do-bbox między kolumnami pasa górnego.
 *
 * DLACZEGO UKŁAD NIE MOŻE IŚĆ ZA TUSZEM. Rezerwacja jest liczona z geometrii
 * PEŁNEGO SZCZEGÓŁU (SCHEMAT-10 S1 „jedna kotwica": `scene/buildScene.ts`
 * `buildRowLayout` liczy kolumny zawsze przy L2), a tusz zależy od TREŚCI
 * rysowanej na danym poziomie — na L0 wiersz pasma nazw niesie kod stacji
 * („S01", 25 j.św.), na L2 nazwę („Stacja T1", 73 j.św.). Gdyby arkusz szedł
 * za tuszem, jego szerokość zmieniałaby się przy zoomie (pomiar: 8200 na L0
 * wobec 8326 na L2), więc skala dopasowania i minimapa skakałyby przy każdej
 * zmianie poziomu szczegółu — dokładnie to, czego zakazują KD-5 i S1.
 */
export function labelReservationRect(label: OwnedLabel): V3Rect {
  const rezerwacja = label.rezerwacjaSzerokosci;
  if (rezerwacja == null) return label.rect;
  if (label.rotated) {
    if (rezerwacja <= label.rect.height) return label.rect;
    const cy = label.rect.y + label.rect.height / 2;
    return { x: label.rect.x, y: cy - rezerwacja / 2, width: label.rect.width, height: rezerwacja };
  }
  if (rezerwacja <= label.rect.width) return label.rect;
  const cx = label.rect.x + label.rect.width / 2;
  return { x: cx - rezerwacja / 2, y: label.rect.y, width: rezerwacja, height: label.rect.height };
}

/** BLOK-PUSTY: etykieta, której PROSTOKĄT jest szerszy niż narysowany tekst. */
export interface LabelInkGap {
  readonly ownerRef: string;
  /** Rozciągłość prostokąta wzdłuż tekstu [j.św.] (dla `rotated` — `height`). */
  readonly rectExtent: number;
  /** Realna szerokość tekstu w rozmiarze swojej klasy [j.św.]. */
  readonly inkExtent: number;
}

/**
 * WYROCZNIA KLASY (BLOK-PUSTY, reguła KLASA §2/§4 — „deklaracja bez testu =
 * fałszywa pewność"): prostokąt KAŻDEJ etykiety niesie TUSZ, nie rezerwację.
 *
 * Mierzy WSZYSTKIE klasy właściciela i WSZYSTKIE sloty (1 i zapasowe), nie
 * przykład z karty: defekt polegał na tym, że JEDNA klasa (wiersz pasma nazw)
 * brała wymiar ze slotu, a rama bloku stacji szła za nią. Wyrocznia jest
 * ZAMKNIĘTA — nie ma listy wyjątków, więc nowy resolver, który znów wpisze do
 * `rect` cudzą rezerwację, zapala ją natychmiast.
 *
 * Tolerancja `0,5 j.św.` bierze się z arytmetyki zmiennoprzecinkowej
 * centrowania (`(slot.width − tusz)/2`), nie z ustępstwa — pół jednostki świata
 * to poniżej 1/16 modułu siatki.
 *
 * NIE jest to wyrocznia „rezerwacja ≥ tusz" (tamta stoi osobno,
 * `labelGrowthReservationGaps` niżej) — te dwa zdania są DWOMA KOŃCAMI pary i
 * muszą upaść niezależnie.
 */
export function labelRectsWiderThanInk(labels: readonly OwnedLabel[]): readonly LabelInkGap[] {
  const gaps: LabelInkGap[] = [];
  for (const label of labels) {
    const rectExtent = label.rotated ? label.rect.height : label.rect.width;
    const inkExtent = measureLabelWidth(label.text, label.labelClass);
    if (rectExtent - inkExtent > 0.5) {
      gaps.push({ ownerRef: label.ownerRef, rectExtent, inkExtent });
    }
  }
  return gaps;
}

/**
 * DRUGI KONIEC PARY (BLOK-PUSTY, reguła KLASA §3): etykieta, której REZERWACJA
 * jest MNIEJSZA niż narysowany tusz — czyli napis wystaje poza obszar, w
 * którym wolno mu było stanąć (dla wiersza pasma nazw: poza własną kolumnę
 * stacji). Na poprawnym rysunku ZAWSZE pusta.
 *
 * Bez tej wyroczni zwężenie prostokąta z karty BLOK-PUSTY dałoby fałszywą
 * zieleń: `labelRectsWiderThanInk` przechodziłoby też wtedy, gdyby rezerwacja
 * została policzona ZA WĄSKO, bo prostokąt tusz-w-tusz nigdy nie jest szerszy
 * od tekstu. Etykiety bez rezerwacji (kotwiczone punktowo) są poza zakresem —
 * ich granicą jest rozstrzyganie kolizji, nie slot.
 */
export function labelGrowthReservationGaps(labels: readonly OwnedLabel[]): readonly LabelInkGap[] {
  const gaps: LabelInkGap[] = [];
  for (const label of labels) {
    if (label.rezerwacjaSzerokosci == null) continue;
    const inkExtent = measureLabelWidth(label.text, label.labelClass);
    if (inkExtent - label.rezerwacjaSzerokosci > 0.5) {
      gaps.push({ ownerRef: label.ownerRef, rectExtent: label.rezerwacjaSzerokosci, inkExtent });
    }
  }
  return gaps;
}
