/**
 * exportDxf — eksport schematu SLD do formatu AutoCAD DXF.
 *
 * DXF (Drawing Exchange Format) jest de-facto standardem dla CAD-ów:
 * AutoCAD, Revit, Archicad, ZWCAD, BricsCAD. Pozwala projektantowi sieci
 * SN otworzyć schemat jednokreskowy w środowisku CAD i scalić go z
 * planami architektonicznymi/budowlanymi.
 *
 * Implementacja: minimalny AC1024 (AutoCAD 2010) DXF z LINE entities
 * dla każdego ciągu/segmentu na canvas + TEXT entities dla etykiet.
 *
 * BINDING: 100% PL etykiety w komentarzach.
 */

export interface DxfLineEntity {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly layer?: string;
}

export interface DxfTextEntity {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly height?: number;
  readonly layer?: string;
  /** S9-6: wyrównanie poziome (`text-anchor` sceny). Brak = do lewej —
   *  zachowanie sprzed karty dla dotychczasowych wołających. */
  readonly align?: 'left' | 'center' | 'right';
}

/** S9-6 (audyt E-2): okrąg — scena v3 rysuje nim m.in. węzły rozgałęzień i
 *  glify aparatów, więc bez tej encji eksport CAD gubiłby część rysunku. */
export interface DxfCircleEntity {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly layer?: string;
}

export interface DxfExportInput {
  readonly title: string;
  readonly lines: readonly DxfLineEntity[];
  readonly texts: readonly DxfTextEntity[];
  /** Brak = zero okręgów (zgodność wstecz z wołającymi sprzed S9-6). */
  readonly circles?: readonly DxfCircleEntity[];
}

/**
 * Generuje minimalny AutoCAD 2010 (AC1024) DXF jako string.
 *
 * Struktura DXF (text-based):
 *   SECTION HEADER
 *   SECTION TABLES (layers)
 *   SECTION ENTITIES (LINE, TEXT)
 *   EOF
 *
 * Każda wartość ma "group code" (numer) + value. Tekstowy format.
 *
 * @see http://www.uccs.edu/~ahmad/teaching/CADFiles/DXF-Reference.pdf
 */
export function generateDxf(input: DxfExportInput): string {
  const lines: string[] = [];

  const push = (code: number, value: string | number): void => {
    lines.push(String(code), String(value));
  };

  // HEADER section
  push(0, 'SECTION');
  push(2, 'HEADER');
  push(9, '$ACADVER');
  push(1, 'AC1024'); // AutoCAD 2010
  push(0, 'ENDSEC');

  // TABLES section (layers)
  // S9-6: tablica warstw deklaruje KAŻDĄ warstwę użytą przez encje (dawniej
  // wyłącznie '0' — encja na warstwie niezadeklarowanej jest dla części
  // czytników DXF błędem struktury, a dla reszty cichym auto-utworzeniem).
  const usedLayers = Array.from(
    new Set<string>([
      '0',
      ...input.lines.map((l) => l.layer ?? '0'),
      ...input.texts.map((t) => t.layer ?? '0'),
      ...(input.circles ?? []).map((c) => c.layer ?? '0'),
    ]),
  ).sort();
  push(0, 'SECTION');
  push(2, 'TABLES');
  push(0, 'TABLE');
  push(2, 'LAYER');
  push(70, usedLayers.length);
  for (const layer of usedLayers) {
    push(0, 'LAYER');
    push(2, layer);
    push(70, 0);
    push(62, 7); // white
    push(6, 'CONTINUOUS');
  }
  push(0, 'ENDTAB');
  push(0, 'ENDSEC');

  // ENTITIES section
  push(0, 'SECTION');
  push(2, 'ENTITIES');

  // LINE entities
  for (const line of input.lines) {
    push(0, 'LINE');
    push(8, line.layer ?? '0');
    push(10, line.x1);
    push(20, -line.y1); // DXF Y up vs screen Y down
    push(30, 0);
    push(11, line.x2);
    push(21, -line.y2);
    push(31, 0);
  }

  // CIRCLE entities (S9-6)
  for (const circle of input.circles ?? []) {
    push(0, 'CIRCLE');
    push(8, circle.layer ?? '0');
    push(10, circle.cx);
    push(20, -circle.cy); // ta sama konwersja osi Y co LINE
    push(30, 0);
    push(40, circle.r);
  }

  // TEXT entities
  for (const text of input.texts) {
    push(0, 'TEXT');
    push(8, text.layer ?? '0');
    push(10, text.x);
    push(20, -text.y);
    push(30, 0);
    push(40, text.height ?? 12);
    push(1, text.text);
    // S9-6: wyrównanie poziome — grupa 72 (0 lewo / 1 środek / 2 prawo).
    // Dla wyrównania innego niż lewe DXF wymaga punktu dopasowania (11/21),
    // inaczej czytnik ignoruje kod 72 i tekst wraca do lewej.
    if (text.align === 'center' || text.align === 'right') {
      push(72, text.align === 'center' ? 1 : 2);
      push(11, text.x);
      push(21, -text.y);
      push(31, 0);
    }
  }

  push(0, 'ENDSEC');
  push(0, 'EOF');

  return lines.join('\n');
}

export function downloadDxf(input: DxfExportInput, filename: string): void {
  const dxf = generateDxf(input);
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.dxf') ? filename : `${filename}.dxf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
