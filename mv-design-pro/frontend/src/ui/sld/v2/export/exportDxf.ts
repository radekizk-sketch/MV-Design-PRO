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
}

export interface DxfExportInput {
  readonly title: string;
  readonly lines: readonly DxfLineEntity[];
  readonly texts: readonly DxfTextEntity[];
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
  push(0, 'SECTION');
  push(2, 'TABLES');
  push(0, 'TABLE');
  push(2, 'LAYER');
  push(70, 1);
  // Layer 0 - default
  push(0, 'LAYER');
  push(2, '0');
  push(70, 0);
  push(62, 7); // white
  push(6, 'CONTINUOUS');
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

  // TEXT entities
  for (const text of input.texts) {
    push(0, 'TEXT');
    push(8, text.layer ?? '0');
    push(10, text.x);
    push(20, -text.y);
    push(30, 0);
    push(40, text.height ?? 12);
    push(1, text.text);
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
