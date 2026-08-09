/**
 * SLD V3 — DOLNY PAS CHROMU KANWY: jeden układ, rozłączność z konstrukcji.
 *
 * DLACZEGO (karta RAMKA-TNIE-PODPISY, drugi objaw). Przy dolnej krawędzi
 * kanwy stoją napisy DWÓCH właścicieli, pozycjonowane wobec DWÓCH różnych
 * odniesień i nieświadome siebie nawzajem:
 *
 *   · APARAT ARKUSZA — „Widok: …" (lewo) i „Skala …" (prawo) rysowane przez
 *     `sheet/Frame.tsx` w układzie ARKUSZA, `SHEET_CAPTION_OFFSET_SCREEN_PX`
 *     pod dolną krawędzią ramki. Należą do rysunku (idą do eksportu), więc
 *     jadą razem z arkuszem;
 *   · APARAT EKRANU — „Ukryto N opisów — przybliż, aby zobaczyć", kotwiczony
 *     w prawym-dolnym rogu WIDOKU (V12K-222: komunikat systemowy nie jest
 *     treścią rysunku technicznego).
 *
 * Przy kadrze „Dopasuj widok" dolna krawędź arkusza ląduje tuż nad dolną
 * krawędzią widoku — czyli oba pasma trafiają w to samo miejsce. POMIAR stanu
 * przed (`scripts/_sonda7`, fixtura 53 stacji): kolizja w **12 na 12**
 * sprawdzonych par {kadr 1400×900 · 1800×1100 · 1322×696 · 2000×1180} ×
 * {L0 · L1 · L2} — descendery „Skala wg ka**mery**" wchodziły w wersaliki
 * „**U**kryto 1 opis". To ta sama KLASA co defekt ramki: dwa źródła prawdy o
 * jednym obszarze, zgodne tylko przypadkiem.
 *
 * ROZSTRZYGNIĘCIE (wzorzec `canvas/toolbarLayout.ts`: „grupy są elementami
 * JEDNEGO rzędu, więc nachodzenie jest niemożliwe Z KONSTRUKCJI"): pozycje obu
 * rodzin liczy JEDNA czysta funkcja. Podpisy arkusza zostają tam, gdzie są
 * (są częścią rysunku i nie wolno ich odczepić od ramki), a wskaźnik ekranowy
 * USTĘPUJE — przenosi się nad nie. Ustępuje ten, kto jest oprawą, nie ten, kto
 * jest rysunkiem.
 *
 * Moduł jest CZYSTY (bez React/DOM): ten sam wynik w renderze, teście i
 * runnerze odbioru (P7).
 */

/** Prostokąt w PIKSELACH EKRANU, względem lewego-górnego rogu kanwy. */
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Odstęp podpisów dolnych arkusza (skala, poziom szczegółu) od ramki [px EKRANU]. */
export const SHEET_CAPTION_OFFSET_SCREEN_PX = 20;

/**
 * Odsunięcie wskaźnika „Ukryto N opisów" od dolnej krawędzi WIDOKU [px EKRANU].
 *
 * K11-B: wysokość pasa doków (dok prawy-dolny: `bottom-3` + przycisk `h-7`
 * ⇒ 40 px, plus odstęp). Dawne 12 px kotwiczyło komunikat DOKŁADNIE pod
 * przyciskiem „Warstwy" — na zrzucie odbiorczym połowa zdania była zasłonięta.
 * Komunikat o UKRYTEJ treści, który sam jest zasłonięty, nie informuje o niczym.
 */
export const HIDDEN_LABELS_HINT_BOTTOM_PX = 52;
/** Odsunięcie wskaźnika od prawej krawędzi widoku [px EKRANU]. */
export const HIDDEN_LABELS_HINT_RIGHT_PX = 12;
/** Rozmiar pisma wskaźnika [px EKRANU] — stały, niezależny od zoomu. */
export const HIDDEN_LABELS_HINT_FONT_PX = 12;
/** Prześwit między wskaźnikiem a aparatem arkusza, nad który ustępuje [px EKRANU]. */
export const CHROME_ROW_GAP_PX = 6;
/** Grubość kreski ramki arkusza [px EKRANU] — stała ekranowa (S9-7:
 *  `screenFixedLength(1.5, scale)`), więc ramka ma tę samą wagę przy każdym
 *  zoomie. Mieszka tu, bo czyta ją i `sheet/Frame.tsx` (rysuje), i układ
 *  chromu (traktuje krawędź jako przeszkodę). */
export const SHEET_BORDER_STROKE_SCREEN_PX = 1.5;
/** Wewnętrzny margines PODKŁADKI wskaźnika [px EKRANU] — poziomy i pionowy. */
export const HIDDEN_LABELS_HINT_PLATE_PADDING_X_PX = 8;
export const HIDDEN_LABELS_HINT_PLATE_PADDING_Y_PX = 3;

/** Treść podpisu skali arkusza — jedno źródło dla renderu ramki i dla układu. */
export function sheetScaleCaptionText(scaleLabel: string): string {
  return `Skala ${scaleLabel}`;
}

/** Treść podpisu poziomu szczegółu — jedno źródło (patrz wyżej). */
export function sheetLodCaptionText(lodLabel: string): string {
  return `Widok: ${lodLabel}`;
}

/** Treść wskaźnika ukrytych opisów — jedno źródło dla renderu i dla układu. */
export function hiddenLabelsHintText(count: number): string {
  return `Ukryto ${count} ${count === 1 ? 'opis' : 'opisów'} — przybliż, aby zobaczyć`;
}

/**
 * Szerokość napisu chromu [px EKRANU]. Ta sama formuła co cała typografia v3
 * (`core/text.ts` `measureTextWidth`, `AVG_GLYPH_WIDTH_FACTOR`) — chrom nie ma
 * prawa mierzyć się inaczej niż rysunek, bo wtedy „rozłączność" liczona tutaj
 * nie odpowiadałaby temu, co widać.
 *
 * Powielenie stałej byłoby drugą prawdą, więc funkcja przyjmuje ją z zewnątrz
 * (wołający podaje `measureTextWidth`) — patrz `sheetCaptionScreenRects`.
 */
export interface ChromeTextMetrics {
  /** Szerokość tekstu [px] przy zadanym rozmiarze pisma [px]. */
  readonly measure: (text: string, fontSizePx: number) => number;
}

/** Kamera potrzebna do przeliczenia punktu arkusza na ekran. */
export interface ChromeCamera {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

export interface SheetCaptionInput {
  /** Rozmiar obszaru rysunku [j.św.] — `sheet/outline.ts` `sheetSizeFor`. */
  readonly sheet: { readonly width: number; readonly height: number };
  /** Przesunięcie treści arkusza w świecie kamery (`sheet/Frame.tsx` FRAME_MARGIN). */
  readonly frameMargin: number;
  readonly camera: ChromeCamera;
  /** Rozmiar pisma podpisów arkusza [px EKRANU] — stały (`screenFixedFontSize`). */
  readonly captionFontPx: number;
  readonly scaleLabel: string;
  /** `undefined` ⇒ ramka nie rysuje podpisu poziomu szczegółu. */
  readonly lodLabel?: string;
}

/** Element dolnego aparatu arkusza z tożsamością — do raportów i wyroczni. */
export type SheetApparatusId = 'ramka' | 'skala' | 'widok';
export type SheetApparatusRect = ScreenRect & { readonly id: SheetApparatusId };

/**
 * Prostokąty EKRANOWE DOLNEGO APARATU ARKUSZA — dokładnie tam, gdzie rysuje je
 * `sheet/Frame.tsx`:
 *   · `ramka` — DOLNA KRAWĘDŹ prostokąta `sld-sheet-border` (pas o grubości
 *     kreski). Jest częścią aparatu, nie tłem: napis, przez który przechodzi
 *     linia ramki, jest tak samo nieczytelny jak napis pod drugim napisem —
 *     i dokładnie to zobaczyłem na zrzucie po pierwszym podejściu do tej karty,
 *     gdzie wskaźnik ustąpił podpisom i wylądował NA krawędzi;
 *   · `skala`/`widok` — podpisy `SHEET_CAPTION_OFFSET_SCREEN_PX` pod ramką,
 *     „Skala" wyrównana do PRAWEJ krawędzi arkusza, „Widok" do LEWEJ.
 *
 * Wysokość prostokąta napisu = wiersz pisma (pismo + interlinia 6), liczona
 * wokół linii bazowej tak, żeby obejmowała wydłużenia górne i dolne.
 */
export function sheetCaptionScreenRects(
  input: SheetCaptionInput,
  metrics: ChromeTextMetrics,
): readonly SheetApparatusRect[] {
  const { sheet, frameMargin, camera, captionFontPx } = input;
  if (!Number.isFinite(camera.scale) || camera.scale <= 0) return [];
  const krawedzY = (frameMargin + sheet.height) * camera.scale + camera.translateY;
  const baseline = krawedzY + SHEET_CAPTION_OFFSET_SCREEN_PX;
  const prawa = (frameMargin + sheet.width) * camera.scale + camera.translateX;
  const lewa = frameMargin * camera.scale + camera.translateX;
  const wysokosc = captionFontPx + 6;
  const y = baseline - captionFontPx;

  const rects: SheetApparatusRect[] = [
    {
      id: 'ramka',
      x: lewa,
      y: krawedzY - SHEET_BORDER_STROKE_SCREEN_PX / 2,
      width: Math.max(0, prawa - lewa),
      height: SHEET_BORDER_STROKE_SCREEN_PX,
    },
  ];
  const skala = sheetScaleCaptionText(input.scaleLabel);
  const szerSkali = metrics.measure(skala, captionFontPx);
  rects.push({ id: 'skala', x: prawa - szerSkali, y, width: szerSkali, height: wysokosc });
  if (input.lodLabel !== undefined) {
    const widok = sheetLodCaptionText(input.lodLabel);
    rects.push({ id: 'widok', x: lewa, y, width: metrics.measure(widok, captionFontPx), height: wysokosc });
  }
  return rects;
}

function zachodza(a: ScreenRect, b: ScreenRect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

/**
 * Prostokąt EKRANOWY wskaźnika „Ukryto N opisów", USTĘPUJĄCY podpisom arkusza.
 *
 * Slot bazowy: prawy-dolny róg widoku, nad pasem doków. Gdy zachodzi na
 * którykolwiek element dolnego aparatu arkusza (krawędź ramki albo podpis),
 * wskaźnik przenosi się NAD najwyższy z tych, z którymi koliduje (z prześwitem
 * `CHROME_ROW_GAP_PX`). Pętla jest ograniczona jawnie: rozłączność ma wynikać
 * z warunku, a nie z założenia o liczbie elementów aparatu.
 *
 * Wskaźnik wypchnięty ponad górną krawędź widoku zostaje przy `y = 0` — napis
 * poza kadrem nie informuje o niczym, a napis przy górnej krawędzi jest nadal
 * czytelny (przypadek nieosiągalny na kadrach produkcyjnych: wymagałby widoku
 * niższego niż ~90 px).
 */
export function hiddenLabelsHintScreenRect(
  viewport: { readonly width: number; readonly height: number },
  text: string,
  sheetApparatus: readonly ScreenRect[],
  metrics: ChromeTextMetrics,
): ScreenRect {
  const width = metrics.measure(text, HIDDEN_LABELS_HINT_FONT_PX);
  const height = HIDDEN_LABELS_HINT_FONT_PX + 6;
  let rect: ScreenRect = {
    // Margines od krawędzi widoku dotyczy PODKŁADKI (to ona jest widoczną
    // granicą komunikatu), więc slot napisu cofa się o jej wewnętrzny margines.
    x: viewport.width - HIDDEN_LABELS_HINT_RIGHT_PX - HIDDEN_LABELS_HINT_PLATE_PADDING_X_PX - width,
    y: viewport.height - HIDDEN_LABELS_HINT_BOTTOM_PX - HIDDEN_LABELS_HINT_FONT_PX,
    width,
    height,
  };
  for (let krok = 0; krok < 4; krok++) {
    // Ustępowanie liczone dla PODKŁADKI, nie dla samego napisu: podkładka jest
    // nieprzezroczysta, więc jej nachodzenie na podpis arkusza ZASŁANIAŁOBY go
    // — a to ta sama utrata informacji, tylko w drugą stronę.
    const kolidujace = sheetApparatus.filter((c) => zachodza(hiddenLabelsHintPlateRect(rect), c));
    if (kolidujace.length === 0) break;
    const najwyzszy = Math.min(...kolidujace.map((c) => c.y));
    rect = { ...rect, y: najwyzszy - CHROME_ROW_GAP_PX - height };
  }
  return rect.y < 0 ? { ...rect, y: 0 } : rect;
}

/**
 * PODKŁADKA wskaźnika — prostokąt tła pod napisem [px EKRANU].
 *
 * DLACZEGO JEST KONIECZNA (oględziny zrzutu po pierwszym podejściu do karty).
 * Wskaźnik jest nakładką EKRANU nad rysunkiem, więc po ustąpieniu aparatowi
 * arkusza ląduje nad TREŚCIĄ rysunku — i na zrzucie prawa krawędź ramki
 * przechodziła przez środek napisu dokładnie tak, jak dolna krawędź przez
 * nazwy stacji. Samo przesuwanie tego nie zamknie: rysunek jest wszędzie, więc
 * „miejsce, gdzie nic nie ma" nie istnieje. Komunikat systemowy dostaje więc
 * własne tło — ten sam wzorzec, co tabliczka pochodzenia wyniku na tej kanwie.
 */
export function hiddenLabelsHintPlateRect(hint: ScreenRect): ScreenRect {
  return {
    x: hint.x - HIDDEN_LABELS_HINT_PLATE_PADDING_X_PX,
    y: hint.y - HIDDEN_LABELS_HINT_PLATE_PADDING_Y_PX,
    width: hint.width + HIDDEN_LABELS_HINT_PLATE_PADDING_X_PX * 2,
    height: hint.height + HIDDEN_LABELS_HINT_PLATE_PADDING_Y_PX * 2,
  };
}

/**
 * WYROCZNIA (reguła KLASA §4): pary napisów dolnego pasa chromu, które na
 * siebie nachodzą. Na poprawnym układzie ZAWSZE pusta.
 */
export function chromeCaptionCollisions(
  rects: readonly (ScreenRect & { readonly id: string })[],
): readonly { readonly a: string; readonly b: string }[] {
  const kolizje: { a: string; b: string }[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (zachodza(rects[i], rects[j])) kolizje.push({ a: rects[i].id, b: rects[j].id });
    }
  }
  return kolizje;
}
