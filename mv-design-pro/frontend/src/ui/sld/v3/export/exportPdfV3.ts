/**
 * S9-6 (audyt E-1 „Eksport PDF i PNG to martwe kliknięcia") — PDF WEKTOROWY
 * arkusza A3 poziomego.
 *
 * PRZED: pozycja „PDF (tytułowy blok)" istniała w menu i miała opis, ale klik
 * nie pobierał pliku, nie zgłaszał błędu i nie pokazywał komunikatu (kanał
 * kończył się gałęzią `else` z tekstem o „dedykowanym kanale", którego nie
 * było). Jedyny moduł PDF w repo (`v2/export/exportPdf.ts`) to od początku
 * SZKIELET: buduje obiekt-specyfikację (`PdfExportSpec`), świadomie NIE
 * generując bajtów („pełna generacja PDF binarna planowana w F4 sprint").
 *
 * PO: pełny plik PDF budowany TUTAJ, z tego samego rysunku, co SVG i DXF
 * (`svgPrimitives.ts`), więc tytułówka i legenda są w PDF automatycznie —
 * bez drugiej implementacji rysunku (dyrektywa właściciela pkt 7).
 *
 * DLACZEGO WŁASNY ZAPIS, A NIE BIBLIOTEKA: `jspdf` jest wprawdzie w
 * zależnościach (nieużywany w `src/`), ale (1) kroje bazowe w jsPDF też nie
 * mają polskich znaków bez dołączenia własnego pisma, więc problem
 * kodowania i tak trzeba rozwiązać samodzielnie (`pdfFont.ts`), (2) jsPDF
 * wpisuje do pliku znacznik czasu utworzenia, co łamie regułę determinizmu
 * eksportu („same input → identical bytes"). Zapis tutaj jest w 100%
 * deterministyczny: ZERO zegara, ZERO identyfikatorów losowych.
 *
 * ZAKRES: geometria (linie/okręgi/wielokąty) + tekst z wyrównaniem; kreski
 * (`stroke-dasharray`) odwzorowane wzorem `d`; wypełnienia płaskie. Krycie
 * cząstkowe nie jest odwzorowywane (patrz `svgPrimitives.ts` — element
 * praktycznie niewidoczny jest pomijany, reszta rysowana pełnym kryciem).
 */
import { pdfEncodeText, pdfEncodingDifferences, pdfTextWidth } from './pdfFont';
import { geometryPrimitiveCount, type ExportDrawing, type ExportPrimitive } from './svgPrimitives';

/** A3 poziomy w punktach typograficznych (1 pt = 1/72"), ISO 216:
 *  420 × 297 mm → 1190,55 × 841,89 pt. Ten sam format, w który celuje łamanie
 *  arkusza (`layout/sheetRows.ts`, karta S9-1) — plik i układ mówią o tym
 *  samym arkuszu. */
export const PDF_A3_LANDSCAPE_PT = { width: 1190.55, height: 841.89 } as const;
/** Margines strony [pt] — 10 mm. */
const PAGE_MARGIN_PT = 28.35;

/** Zaokrąglenie liczb w strumieniu treści — 3 miejsca wystarczają przy
 *  rozdzielczości 1/72", a stała liczba miejsc daje powtarzalne bajty. */
function fmt(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function hexToRgb(color: string): { readonly r: number; readonly g: number; readonly b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (match) {
    const value = Number.parseInt(match[1], 16);
    return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
  }
  const short = /^#([0-9a-f]{3})$/i.exec(color.trim());
  if (short) {
    const [r, g, b] = short[1].split('').map((c) => Number.parseInt(c + c, 16) / 255);
    return { r, g, b };
  }
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(color.trim());
  if (rgb) {
    return { r: Number(rgb[1]) / 255, g: Number(rgb[2]) / 255, b: Number(rgb[3]) / 255 };
  }
  return null;
}

interface Fit {
  readonly scale: number;
  readonly dx: number;
  readonly dy: number;
}

/** Wpasowanie rysunku w stronę: skala jednorodna (bez zniekształcenia
 *  proporcji) + wyśrodkowanie. */
export function fitDrawingToPage(drawing: ExportDrawing): Fit {
  const usableWidth = PDF_A3_LANDSCAPE_PT.width - PAGE_MARGIN_PT * 2;
  const usableHeight = PDF_A3_LANDSCAPE_PT.height - PAGE_MARGIN_PT * 2;
  const scale =
    drawing.width > 0 && drawing.height > 0
      ? Math.min(usableWidth / drawing.width, usableHeight / drawing.height)
      : 1;
  const dx = PAGE_MARGIN_PT + (usableWidth - drawing.width * scale) / 2;
  const dy = PAGE_MARGIN_PT + (usableHeight - drawing.height * scale) / 2;
  return { scale, dx, dy };
}

function colorOperator(color: string, stroking: boolean): string | null {
  const rgb = hexToRgb(color);
  if (!rgb) return null;
  return `${fmt(rgb.r)} ${fmt(rgb.g)} ${fmt(rgb.b)} ${stroking ? 'RG' : 'rg'}`;
}

function primitiveToContent(primitive: ExportPrimitive): string {
  if (primitive.kind === 'text') {
    const bold = primitive.fontWeight >= 600;
    const width = pdfTextWidth(primitive.text, primitive.fontSize, bold);
    const x = primitive.anchor === 'middle' ? primitive.x - width / 2 : primitive.anchor === 'end' ? primitive.x - width : primitive.x;
    // `dominant-baseline="middle"` ⇒ linia pisma przesunięta o ~0,35 wysokości
    // pisma (wartość z metryki AFM: połowa wysokości wersalika Helvetiki,
    // `CapHeight` 718/1000, więc 0,359 em) — bez tego etykiety wyśrodkowane
    // pionowo (legenda, opisy pól) siedziałyby o pół wiersza wyżej.
    const y = primitive.baseline === 'middle' ? primitive.y + primitive.fontSize * 0.359 : primitive.y;
    const fill = colorOperator(primitive.fill, false);
    return [
      'q',
      fill ?? '0 0 0 rg',
      'BT',
      `/${bold ? 'F2' : 'F1'} ${fmt(primitive.fontSize)} Tf`,
      // Odbicie osi Y w macierzy tekstu odwraca odbicie strony (CTM), więc
      // pismo jest czytelne, a współrzędne pozostają w układzie rysunku.
      `1 0 0 -1 ${fmt(x)} ${fmt(y)} Tm`,
      `(${pdfEncodeText(primitive.text)}) Tj`,
      'ET',
      'Q',
    ].join('\n');
  }

  const ops: string[] = ['q'];
  if (primitive.dash && primitive.dash.length > 0) {
    ops.push(`[${primitive.dash.map(fmt).join(' ')}] 0 d`);
  }
  ops.push(`${fmt(Math.max(primitive.strokeWidth, 0.1))} w`);
  const strokeOp = primitive.stroke ? colorOperator(primitive.stroke, true) : null;
  const fillOp = primitive.fill ? colorOperator(primitive.fill, false) : null;
  if (strokeOp) ops.push(strokeOp);
  if (fillOp) ops.push(fillOp);

  if (primitive.kind === 'circle') {
    // Okrąg = cztery łuki Béziera (stała k = 0,5523 — klasyczne przybliżenie
    // ćwiartki okręgu krzywą trzeciego stopnia, błąd < 0,03%).
    const k = 0.5522847498 * primitive.r;
    const { cx, cy, r } = primitive;
    ops.push(
      `${fmt(cx + r)} ${fmt(cy)} m`,
      `${fmt(cx + r)} ${fmt(cy + k)} ${fmt(cx + k)} ${fmt(cy + r)} ${fmt(cx)} ${fmt(cy + r)} c`,
      `${fmt(cx - k)} ${fmt(cy + r)} ${fmt(cx - r)} ${fmt(cy + k)} ${fmt(cx - r)} ${fmt(cy)} c`,
      `${fmt(cx - r)} ${fmt(cy - k)} ${fmt(cx - k)} ${fmt(cy - r)} ${fmt(cx)} ${fmt(cy - r)} c`,
      `${fmt(cx + k)} ${fmt(cy - r)} ${fmt(cx + r)} ${fmt(cy - k)} ${fmt(cx + r)} ${fmt(cy)} c`,
    );
  } else {
    const [first, ...rest] = primitive.points;
    ops.push(`${fmt(first.x)} ${fmt(first.y)} m`);
    for (const point of rest) ops.push(`${fmt(point.x)} ${fmt(point.y)} l`);
    if (primitive.closed) ops.push('h');
  }

  ops.push(fillOp && strokeOp ? 'B' : fillOp ? 'f' : 'S');
  ops.push('Q');
  return ops.join('\n');
}

function buildContentStream(drawing: ExportDrawing): string {
  const fit = fitDrawingToPage(drawing);
  const body = drawing.primitives.map(primitiveToContent).join('\n');
  // Macierz strony: skala + odbicie osi Y (PDF ma początek w lewym DOLNYM
  // rogu, rysunek — w lewym górnym), przesunięcie o margines.
  const top = PDF_A3_LANDSCAPE_PT.height - fit.dy;
  return [`q`, `${fmt(fit.scale)} 0 0 ${fmt(-fit.scale)} ${fmt(fit.dx)} ${fmt(top)} cm`, body, 'Q'].join('\n');
}

/** Długość w bajtach (UTF-8) — `/Length` musi opisywać BAJTY, nie znaki. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Pełny plik PDF (jako tekst — bajty ASCII/WinAnsi, strumień nieskompresowany,
 * więc zawartość jest audytowalna i porównywalna bajt po bajcie).
 *
 * BRAMKA: rysunek bez geometrii ⇒ wyjątek (ta sama zasada co w DXF — pusty
 * plik „udany" jest gorszy niż błąd).
 */
export function buildSldPdf(drawing: ExportDrawing, title: string): string {
  if (geometryPrimitiveCount(drawing) === 0) {
    throw new Error('Eksport PDF: rysunek nie zawiera żadnej geometrii — eksport przerwany.');
  }

  const content = buildContentStream(drawing);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(PDF_A3_LANDSCAPE_PT.width)} ${fmt(
      PDF_A3_LANDSCAPE_PT.height,
    )}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding 7 0 R >>',
    `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ${pdfEncodingDifferences()} >>`,
    `<< /Title (${pdfEncodeText(title)}) /Producer (MV-DESIGN-PRO) >>`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}
