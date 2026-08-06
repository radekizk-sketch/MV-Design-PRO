/**
 * S9-6 (audyt E-2 „DXF eksportuje PUSTY rysunek") — DXF z REALNĄ geometrią
 * sceny + bramka „eksport bez encji = błąd".
 *
 * PRZED: menu wołało `generateDxf({ title, lines: [], texts: [] })` — plik
 * 176 B, formalnie poprawny (nagłówek AC1024 + tablica warstw), sekcja
 * `ENTITIES` PUSTA. W CAD-zie otwierał się pusty arkusz, a aplikacja meldowała
 * sukces. To jest gorsze niż błąd: fałszywy sukces nie daje się zauważyć.
 *
 * PO: geometria pochodzi z markupu arkusza (`svgPrimitives.ts` — TEN SAM
 * rysunek, który idzie do pliku .svg), a przed zwróceniem pliku działa
 * BRAMKA: zero encji geometrycznych ⇒ wyjątek, nie plik. Bramka jest
 * przypięta testem (`__tests__/exportDxfV3.test.ts`, iniekcja: pusty rysunek).
 *
 * WARSTWY (nazwy polskie, bez kodenamów) — DXF jest formatem wymiany z CAD,
 * więc podział musi być użyteczny dla odbiorcy: geometria rysunku i opisy w
 * osobnych warstwach, żeby dało się wyłączyć opisy przy scalaniu z podkładem.
 */
import { generateDxf, type DxfCircleEntity, type DxfExportInput, type DxfLineEntity, type DxfTextEntity } from '../../v2/export/exportDxf';
import { geometryPrimitiveCount, type ExportDrawing } from './svgPrimitives';

/** Warstwa geometrii rysunku (tory, symbole, ramka arkusza). */
export const DXF_LAYER_RYSUNEK = 'SCHEMAT_RYSUNEK';
/** Warstwa opisów (etykiety, legenda, tabliczka rysunkowa). */
export const DXF_LAYER_OPISY = 'SCHEMAT_OPISY';

function anchorToAlign(anchor: 'start' | 'middle' | 'end'): DxfTextEntity['align'] {
  if (anchor === 'middle') return 'center';
  if (anchor === 'end') return 'right';
  return 'left';
}

/** Prymitywy arkusza → wejście generatora DXF (bez zapisu pliku). */
export function buildDxfInput(drawing: ExportDrawing, title: string): DxfExportInput {
  const lines: DxfLineEntity[] = [];
  const circles: DxfCircleEntity[] = [];
  const texts: DxfTextEntity[] = [];

  for (const primitive of drawing.primitives) {
    if (primitive.kind === 'polyline') {
      const points = primitive.closed ? [...primitive.points, primitive.points[0]] : primitive.points;
      for (let i = 0; i + 1 < points.length; i += 1) {
        lines.push({
          x1: points[i].x,
          y1: points[i].y,
          x2: points[i + 1].x,
          y2: points[i + 1].y,
          layer: DXF_LAYER_RYSUNEK,
        });
      }
    } else if (primitive.kind === 'circle') {
      circles.push({ cx: primitive.cx, cy: primitive.cy, r: primitive.r, layer: DXF_LAYER_RYSUNEK });
    } else {
      texts.push({
        x: primitive.x,
        y: primitive.y,
        text: primitive.text,
        height: primitive.fontSize,
        layer: DXF_LAYER_OPISY,
        align: anchorToAlign(primitive.anchor),
      });
    }
  }

  return { title, lines, texts, circles };
}

/**
 * Pełny plik DXF arkusza. BRAMKA: rysunek bez geometrii ⇒ wyjątek (nigdy
 * „udany" pusty plik).
 */
export function buildSldDxf(drawing: ExportDrawing, title: string): string {
  if (geometryPrimitiveCount(drawing) === 0) {
    throw new Error(
      'Eksport DXF: rysunek nie zawiera żadnej geometrii — plik bez encji byłby pozornym sukcesem ' +
        '(w programie CAD otwiera się pusty arkusz). Eksport przerwany.',
    );
  }
  const input = buildDxfInput(drawing, title);
  if (input.lines.length === 0 && (input.circles?.length ?? 0) === 0) {
    throw new Error('Eksport DXF: sekcja ENTITIES byłaby pusta — eksport przerwany.');
  }
  return generateDxf(input);
}
