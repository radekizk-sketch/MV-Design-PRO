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
import { labelLineHeight, measureLabelWidth, type LabelClass, type LabelRole } from '../core/text';

/** Właściciel etykiety (spec §4, tabela slotów). */
export type OwnerKind =
  | 'segment-span'      // segment magistrali poziomy (slot podstawowy = primaryRect, poprawka F4)
  | 'segment-lateral'    // segment pionowy (lateral), etykieta rotowana 90°
  | 'station-name'       // wiersz pasma nazw stacji (B5)
  | 'port-caption'       // podpis kierunku pola (t3, spec §9/§19.2: „⟨nazwa linii⟩ · kier. Sxx"/„odg. Sxx")
  | 'field-role'         // F10.2: oznaczenie FUNKCYJNE pola (spec §19.1: „pole liniowe"/…, t3)
  | 'apparatus'          // F10.2: identyfikator PER-APARAT (Q1/QE1/T1, spec §19.1, t4) — NIE etykieta pola
  | 'der'                // rodzaj+moc DER (t2) pod symbolem
  | 'busbar-voltage'     // napięcie szyny (t2) nad lewym końcem
  | 'no-point'           // badge „NO" (t3) przy symbolu
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
  protection: 'dane',
  'port-caption': 'dane',
  'segment-span': 'dane',
  'segment-lateral': 'dane',
  'lv-load': 'dane',
};

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
    rect: owner.marginRect,
    leader: {
      from: {
        x: owner.marginRect.x + owner.marginRect.width / 2,
        y: owner.marginRect.y + owner.marginRect.height,
      },
      to: { x: spanCenterX, y: owner.busAxisY },
    },
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
    rect: owner.fallbackRect,
    leader: {
      from: {
        x: owner.fallbackRect.x + owner.fallbackRect.width / 2,
        y: owner.fallbackRect.y + owner.fallbackRect.height / 2,
      },
      to: { x: owner.lineX, y: centerY },
    },
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
      rect: { x: owner.nameSlot.x, y, width: owner.nameSlot.width, height },
      // KD-11: pasmo nazw wisi POD swoją kotwicą (symbolem/stacją) i rośnie w
      // dół — powiększone pismo tożsamości nie może wejść w symbol nad sobą.
      placement: 'below',
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
    rect: owner.fallbackRect,
    leader: {
      from: {
        x: owner.fallbackRect.x + owner.fallbackRect.width / 2,
        y: owner.fallbackRect.y + owner.fallbackRect.height / 2,
      },
      to: { x: owner.anchorX, y: owner.primaryRect.y + owner.primaryRect.height },
    },
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
  readonly ownerKind: 'apparatus' | 'field-role' | 'der' | 'busbar-voltage' | 'no-point' | 'protection' | 'lv-load';
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
