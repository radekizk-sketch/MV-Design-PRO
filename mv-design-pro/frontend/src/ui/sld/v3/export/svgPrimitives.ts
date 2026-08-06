/**
 * S9-6 — JEDNO źródło geometrii dla eksportów nie-SVG (DXF, PDF).
 *
 * DLACZEGO tak, a nie „druga implementacja rysunku": scena v3 rysuje się
 * WYŁĄCZNIE przez React/SVG (`SldCanvasV3.tsx`, `sheet/Frame.tsx`,
 * `symbols/glyphs.tsx`). Gdyby DXF i PDF budowały geometrię z `SceneV3`
 * niezależnie, powstałyby TRZY równoległe definicje tego samego rysunku
 * (glify aparatów są zdefiniowane WYŁĄCZNIE jako markup) — i pierwsza zmiana
 * glifu rozjechałaby pliki CAD z rysunkiem na ekranie. Dlatego tor
 * nie-SVG czyta DOKŁADNIE ten sam markup, który idzie do pliku .svg (już po
 * kadrze fit-do-treści, legendzie, tabliczce i podmianie na paletę
 * dokumentową) i tłumaczy go na neutralne prymitywy. Jedno źródło, trzy
 * serializacje.
 *
 * SŁOWNIK WEJŚCIA JEST ZMIERZONY, NIE ZGADYWANY (reguła KLASA, NIE INSTANCJA):
 * pomiar realnego markupu eksportu fixtury goldenowej (53 stacje) na L0/L1/L2
 * dał komplet znaczników `svg,g,line,rect,circle,path,polygon,text,animate`,
 * komendy ścieżek `M L Z h q` i wyłącznie `transform="translate(x, y)"`.
 * Obsługiwany jest ten zbiór POSZERZONY o warianty tej samej klasy
 * (`m l h v H V Z Q q C c`, `polygon`) — a wszystko poza nim RZUCA WYJĄTEK z
 * nazwą nieobsłużonej konstrukcji. Ciche pominięcie byłoby dokładnie tym
 * defektem, który karta zamyka (plik „udany", a w CAD-zie pusty arkusz).
 *
 * ZAKRES ŚWIADOMIE POMINIĘTY (jawny, nie ukryty):
 *  - `rx` prostokąta (zaokrąglenie narożnika) — narożnik ostry w DXF/PDF;
 *  - przezroczystość (`opacity`/`fill-opacity`) NIE jest odwzorowywana jako
 *    kanał alfa; element o wypadkowej przezroczystości ≤ 1% jest POMIJANY
 *    (nie widać go na ekranie ⇒ nie ma go w pliku), pozostałe rysowane pełnym
 *    kryciem;
 *  - `<animate>` (SMIL) — dokument statyczny nie animuje.
 */

export interface ExportPoint {
  readonly x: number;
  readonly y: number;
}

interface PrimitiveBase {
  readonly stroke: string | null;
  readonly fill: string | null;
  readonly strokeWidth: number;
  /** Wzór kreski w jednostkach rysunku (`stroke-dasharray`), `null` = ciągła. */
  readonly dash: readonly number[] | null;
}

export interface ExportPolyline extends PrimitiveBase {
  readonly kind: 'polyline';
  readonly points: readonly ExportPoint[];
  readonly closed: boolean;
}

export interface ExportCircle extends PrimitiveBase {
  readonly kind: 'circle';
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

export interface ExportText {
  readonly kind: 'text';
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly anchor: 'start' | 'middle' | 'end';
  /** `middle` = `dominant-baseline="middle"` (wyśrodkowanie pionowe). */
  readonly baseline: 'alphabetic' | 'middle';
  readonly fill: string;
}

export type ExportPrimitive = ExportPolyline | ExportCircle | ExportText;

export interface ExportDrawing {
  /** Wymiary kadru arkusza (jednostki rysunku = px świata). */
  readonly width: number;
  readonly height: number;
  readonly primitives: readonly ExportPrimitive[];
}

/** Liczba odcinków, na które dzielona jest krzywa Béziera (Q/C) przy
 *  spłaszczaniu. Stała ⇒ wynik deterministyczny. 8 wystarcza dla glifów
 *  wielkości 16–40 px (`symbols/defs.ts`) — błąd cięciwy < 0,1 px. */
const BEZIER_SEGMENTS = 8;

/** Domyślne wypełnienie SVG, gdy atrybut `fill` nie jest podany i nie
 *  dziedziczy się z przodka (zgodnie ze specyfikacją SVG — ta sama
 *  interpretacja, którą stosuje przeglądarka do pliku .svg). */
const SVG_DEFAULT_FILL = '#000000';

interface InheritedState {
  readonly tx: number;
  readonly ty: number;
  /** Rozmiar bieżącego viewportu — baza dla wartości PROCENTOWYCH. Tor
   *  eksportu spotyka je realnie: `injectExportBackground` (`exportPalette.ts`)
   *  wstrzykuje tło jako `<rect width="100%" height="100%">`. Bez rozwiązania
   *  procentu ten prostokąt miałby 100×100 jednostek i zamalowałby róg
   *  rysunku (defekt wykryty pomiarem PDF przed odbiorem karty). */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly fill: string | null;
  readonly stroke: string | null;
  readonly strokeWidth: number;
  readonly opacity: number;
  /** Wartość `color` z `style` przodka — rozwiązuje `currentColor`. */
  readonly currentColor: string | null;
  readonly fontSize: number;
  readonly fontWeight: number;
}

const ROOT_STATE: InheritedState = {
  tx: 0,
  ty: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  fill: null,
  stroke: null,
  strokeWidth: 1,
  opacity: 1,
  currentColor: null,
  fontSize: 12,
  fontWeight: 400,
};

/** Znaczniki bez geometrii RYSOWANEJ, pomijane ŚWIADOMIE (lista zamknięta).
 *  `defs` trzyma definicje do referencji (`use`/marker) — jego treść NIE jest
 *  rysowana wprost, więc wejście do środka byłoby błędem; samo `use` nie jest
 *  obsługiwane i rzuca wyjątek w gałęzi domyślnej, więc pominięcie `defs` nie
 *  może cicho zgubić rysunku. */
const IGNORED_TAGS: ReadonlySet<string> = new Set([
  'animate',
  'animatetransform',
  'title',
  'desc',
  'metadata',
  'defs',
]);

function num(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Długość SVG z obsługą PROCENTU względem viewportu (patrz `InheritedState`).
 *  Jednostka inna niż liczba i procent (px/mm/em) nie występuje w scenie v3 i
 *  RZUCA wyjątek — cicha reinterpretacja przesunęłaby geometrię. */
function length(value: string | null, fallback: number, viewport: number): number {
  if (value === null || value.trim() === '') return fallback;
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) {
    const percent = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(percent) ? (percent / 100) * viewport : fallback;
  }
  if (!/^-?[\d.]+$/.test(trimmed)) {
    throw new Error(`Eksport schematu: nieobsługiwana jednostka długości „${trimmed}" w markupie rysunku.`);
  }
  return num(trimmed, fallback);
}

function parseTranslate(transform: string | null): { readonly tx: number; readonly ty: number } {
  if (!transform || transform.trim() === '') return { tx: 0, ty: 0 };
  const match = /^\s*translate\(\s*(-?[\d.]+)\s*[, ]\s*(-?[\d.]+)\s*\)\s*$/.exec(transform);
  if (!match) {
    throw new Error(
      `Eksport schematu: nieobsługiwana transformacja „${transform}". Tor eksportu zna wyłącznie translate(x, y) — ` +
        'rozszerzenie słownika wymaga świadomej zmiany konwertera, nie cichego pominięcia.',
    );
  }
  return { tx: Number.parseFloat(match[1]), ty: Number.parseFloat(match[2]) };
}

function parseStyleColor(style: string | null): string | null {
  if (!style) return null;
  const match = /(?:^|;)\s*color\s*:\s*([^;]+)/.exec(style);
  return match ? match[1].trim() : null;
}

function resolveColor(raw: string | null, inherited: string | null, currentColor: string | null): string | null {
  const value = raw ?? inherited;
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'none' || trimmed === 'transparent') return null;
  if (trimmed === 'currentColor') return currentColor;
  return trimmed;
}

function parseDash(raw: string | null): readonly number[] | null {
  if (!raw || raw.trim() === '' || raw.trim() === 'none') return null;
  const parts = raw
    .split(/[\s,]+/)
    .map((p) => Number.parseFloat(p))
    .filter((p) => Number.isFinite(p) && p >= 0);
  return parts.length > 0 ? parts : null;
}

/** Parser `d` — zwraca listę PODŚCIEŻEK (każda: punkty + czy zamknięta). */
export function parsePathData(d: string): readonly { readonly points: readonly ExportPoint[]; readonly closed: boolean }[] {
  const tokens = d.match(/[MmLlHhVvZzQqCc]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const subpaths: { points: ExportPoint[]; closed: boolean }[] = [];
  let current: { points: ExportPoint[]; closed: boolean } | null = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let index = 0;
  let command = '';

  const nextNumber = (): number => {
    const token = tokens[index++];
    const parsed = Number.parseFloat(token);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Eksport schematu: uszkodzona ścieżka — oczekiwano liczby, jest „${token}" w „${d}".`);
    }
    return parsed;
  };
  const push = (): void => {
    if (!current) {
      current = { points: [{ x, y }], closed: false };
      subpaths.push(current);
    } else {
      current.points.push({ x, y });
    }
  };
  const flattenBezier = (control: readonly ExportPoint[], end: ExportPoint): void => {
    const p0 = { x, y };
    for (let step = 1; step <= BEZIER_SEGMENTS; step += 1) {
      const t = step / BEZIER_SEGMENTS;
      const u = 1 - t;
      const point =
        control.length === 1
          ? {
              x: u * u * p0.x + 2 * u * t * control[0].x + t * t * end.x,
              y: u * u * p0.y + 2 * u * t * control[0].y + t * t * end.y,
            }
          : {
              x: u ** 3 * p0.x + 3 * u * u * t * control[0].x + 3 * u * t * t * control[1].x + t ** 3 * end.x,
              y: u ** 3 * p0.y + 3 * u * u * t * control[0].y + 3 * u * t * t * control[1].y + t ** 3 * end.y,
            };
      x = point.x;
      y = point.y;
      push();
    }
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[MmLlHhVvZzQqCc]$/.test(token)) {
      command = token;
      index += 1;
    } else if (command === '') {
      throw new Error(`Eksport schematu: ścieżka bez komendy początkowej („${d}").`);
    } else if (command === 'M') {
      command = 'L';
    } else if (command === 'm') {
      command = 'l';
    }

    switch (command) {
      case 'M':
      case 'm': {
        const dx = nextNumber();
        const dy = nextNumber();
        x = command === 'M' ? dx : x + dx;
        y = command === 'M' ? dy : y + dy;
        startX = x;
        startY = y;
        current = { points: [{ x, y }], closed: false };
        subpaths.push(current);
        break;
      }
      case 'L':
      case 'l': {
        const dx = nextNumber();
        const dy = nextNumber();
        x = command === 'L' ? dx : x + dx;
        y = command === 'L' ? dy : y + dy;
        push();
        break;
      }
      case 'H':
      case 'h': {
        const dx = nextNumber();
        x = command === 'H' ? dx : x + dx;
        push();
        break;
      }
      case 'V':
      case 'v': {
        const dy = nextNumber();
        y = command === 'V' ? dy : y + dy;
        push();
        break;
      }
      case 'Q':
      case 'q': {
        const cx = nextNumber();
        const cy = nextNumber();
        const ex = nextNumber();
        const ey = nextNumber();
        const control = command === 'Q' ? { x: cx, y: cy } : { x: x + cx, y: y + cy };
        const end = command === 'Q' ? { x: ex, y: ey } : { x: x + ex, y: y + ey };
        flattenBezier([control], end);
        break;
      }
      case 'C':
      case 'c': {
        const c1x = nextNumber();
        const c1y = nextNumber();
        const c2x = nextNumber();
        const c2y = nextNumber();
        const ex = nextNumber();
        const ey = nextNumber();
        const rel = command === 'c';
        const c1 = rel ? { x: x + c1x, y: y + c1y } : { x: c1x, y: c1y };
        const c2 = rel ? { x: x + c2x, y: y + c2y } : { x: c2x, y: c2y };
        const end = rel ? { x: x + ex, y: y + ey } : { x: ex, y: ey };
        flattenBezier([c1, c2], end);
        break;
      }
      case 'Z':
      case 'z': {
        if (current) current.closed = true;
        x = startX;
        y = startY;
        break;
      }
      default:
        throw new Error(`Eksport schematu: nieobsługiwana komenda ścieżki „${command}" w „${d}".`);
    }
  }

  return subpaths.filter((sub) => sub.points.length >= 2);
}

function pointsAttribute(raw: string | null): readonly ExportPoint[] {
  const numbers = (raw ?? '')
    .split(/[\s,]+/)
    .map((p) => Number.parseFloat(p))
    .filter((p) => Number.isFinite(p));
  const out: ExportPoint[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) out.push({ x: numbers[i], y: numbers[i + 1] });
  return out;
}

function childState(el: Element, parent: InheritedState): InheritedState {
  const { tx, ty } = parseTranslate(el.getAttribute('transform'));
  const styleColor = parseStyleColor(el.getAttribute('style'));
  const fillRaw = el.getAttribute('fill');
  const strokeRaw = el.getAttribute('stroke');
  return {
    tx: parent.tx + tx,
    ty: parent.ty + ty,
    // Viewport dziedziczy się nienaruszony — zmienia go WYŁĄCZNIE wejście w
    // element `<svg>` (gałąź `case 'svg'`).
    viewportWidth: parent.viewportWidth,
    viewportHeight: parent.viewportHeight,
    fill: fillRaw ?? parent.fill,
    stroke: strokeRaw ?? parent.stroke,
    strokeWidth: num(el.getAttribute('stroke-width'), parent.strokeWidth),
    opacity: parent.opacity * num(el.getAttribute('opacity'), 1),
    currentColor: styleColor ?? parent.currentColor,
    fontSize: num(el.getAttribute('font-size'), parent.fontSize),
    fontWeight: num(el.getAttribute('font-weight'), parent.fontWeight),
  };
}

function paint(el: Element, state: InheritedState): PrimitiveBase {
  return {
    stroke: resolveColor(el.getAttribute('stroke'), state.stroke, state.currentColor),
    fill: resolveColor(el.getAttribute('fill'), state.fill ?? SVG_DEFAULT_FILL, state.currentColor),
    strokeWidth: num(el.getAttribute('stroke-width'), state.strokeWidth),
    dash: parseDash(el.getAttribute('stroke-dasharray')),
  };
}

/** Wypadkowa przezroczystość, poniżej której element jest POMIJANY (patrz
 *  „zakres świadomie pominięty" w nagłówku). */
const OPACITY_EPSILON = 0.01;

function collect(el: Element, parent: InheritedState, out: ExportPrimitive[]): void {
  const tag = el.tagName.toLowerCase();
  if (IGNORED_TAGS.has(tag)) return;

  const state = childState(el, parent);
  if (state.opacity <= OPACITY_EPSILON) return;
  const shift = (p: ExportPoint): ExportPoint => ({ x: p.x + state.tx, y: p.y + state.ty });

  switch (tag) {
    case 'svg': {
      // Arkusz v3 zagnieżdża `<svg>` (`sheet/Frame.tsx` renderuje własny
      // korzeń wewnątrz kanwy). Tor eksportu traktuje go jak grupę — WOLNO
      // tak WYŁĄCZNIE przy odwzorowaniu tożsamościowym; skalujący `viewBox`
      // zmieniłby układ współrzędnych dzieci i po cichu rozjechał geometrię.
      const vb = (el.getAttribute('viewBox') ?? '').trim();
      const w = num(el.getAttribute('width'), state.viewportWidth);
      const h = num(el.getAttribute('height'), state.viewportHeight);
      if (vb !== '' && vb.replace(/[\s,]+/g, ' ') !== `0 0 ${w} ${h}`) {
        throw new Error(
          `Eksport schematu: zagnieżdżony <svg> ma skalujący viewBox „${vb}" przy rozmiarze ${w}×${h} — ` +
            'tor DXF/PDF nie odwzorowuje skalowania układu współrzędnych.',
        );
      }
      const viewportState: InheritedState = { ...state, viewportWidth: w, viewportHeight: h };
      for (const child of Array.from(el.children)) collect(child, viewportState, out);
      return;
    }
    case 'g':
      for (const child of Array.from(el.children)) collect(child, state, out);
      return;
    case 'line': {
      const p = paint(el, state);
      out.push({
        kind: 'polyline',
        closed: false,
        points: [
          shift({ x: num(el.getAttribute('x1'), 0), y: num(el.getAttribute('y1'), 0) }),
          shift({ x: num(el.getAttribute('x2'), 0), y: num(el.getAttribute('y2'), 0) }),
        ],
        ...p,
        fill: null, // linia nie ma wnętrza
      });
      return;
    }
    case 'rect': {
      const x = length(el.getAttribute('x'), 0, state.viewportWidth);
      const y = length(el.getAttribute('y'), 0, state.viewportHeight);
      const w = length(el.getAttribute('width'), 0, state.viewportWidth);
      const h = length(el.getAttribute('height'), 0, state.viewportHeight);
      if (w <= 0 || h <= 0) return;
      out.push({
        kind: 'polyline',
        closed: true,
        points: [
          shift({ x, y }),
          shift({ x: x + w, y }),
          shift({ x: x + w, y: y + h }),
          shift({ x, y: y + h }),
        ],
        ...paint(el, state),
      });
      return;
    }
    case 'circle': {
      const r = num(el.getAttribute('r'), 0);
      if (r <= 0) return;
      const c = shift({ x: num(el.getAttribute('cx'), 0), y: num(el.getAttribute('cy'), 0) });
      out.push({ kind: 'circle', cx: c.x, cy: c.y, r, ...paint(el, state) });
      return;
    }
    case 'path': {
      const p = paint(el, state);
      for (const sub of parsePathData(el.getAttribute('d') ?? '')) {
        out.push({ kind: 'polyline', points: sub.points.map(shift), closed: sub.closed, ...p });
      }
      return;
    }
    case 'polygon':
    case 'polyline': {
      const points = pointsAttribute(el.getAttribute('points'));
      if (points.length < 2) return;
      out.push({ kind: 'polyline', points: points.map(shift), closed: tag === 'polygon', ...paint(el, state) });
      return;
    }
    case 'text': {
      const text = (el.textContent ?? '').trim();
      if (text === '') return;
      const anchorRaw = el.getAttribute('text-anchor');
      const anchor = anchorRaw === 'middle' || anchorRaw === 'end' ? anchorRaw : 'start';
      const p = shift({ x: num(el.getAttribute('x'), 0), y: num(el.getAttribute('y'), 0) });
      out.push({
        kind: 'text',
        x: p.x,
        y: p.y,
        text,
        fontSize: num(el.getAttribute('font-size'), state.fontSize),
        fontWeight: num(el.getAttribute('font-weight'), state.fontWeight),
        anchor,
        baseline: el.getAttribute('dominant-baseline') === 'middle' ? 'middle' : 'alphabetic',
        fill: resolveColor(el.getAttribute('fill'), state.fill ?? SVG_DEFAULT_FILL, state.currentColor) ?? SVG_DEFAULT_FILL,
      });
      return;
    }
    default:
      throw new Error(
        `Eksport schematu: nieobsługiwany element „<${tag}>" w markupie rysunku. Tor DXF/PDF musi znać KAŻDY ` +
          'element sceny — ciche pominięcie dałoby plik bez części rysunku.',
      );
  }
}

/**
 * Markup arkusza (już przygotowany do zapisu .svg) → neutralne prymitywy.
 * Rzuca wyjątek na nieznanej konstrukcji (patrz nagłówek) oraz gdy markup nie
 * jest poprawnym SVG.
 */
export function svgMarkupToDrawing(markup: string): ExportDrawing {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror') !== null) {
    throw new Error('Eksport schematu: markup rysunku nie jest poprawnym dokumentem SVG.');
  }
  const viewBox = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map((v) => Number.parseFloat(v));
  const width = num(root.getAttribute('width'), viewBox.length === 4 ? viewBox[2] : 0);
  const height = num(root.getAttribute('height'), viewBox.length === 4 ? viewBox[3] : 0);
  const primitives: ExportPrimitive[] = [];
  collect(root, ROOT_STATE, primitives);
  return { width, height, primitives };
}

/** Liczba prymitywów NIOSĄCYCH geometrię (bez tekstu) — używane przez bramki
 *  „eksport bez encji = błąd" w torach DXF/PDF. */
export function geometryPrimitiveCount(drawing: ExportDrawing): number {
  return drawing.primitives.filter((p) => p.kind !== 'text').length;
}
