/**
 * S9-6 — testy jednostkowe warstwy eksportu dokumentowego:
 *  · STRUKTURA plików (DXF i PDF czytane WŁASNYM parserem, bez zależności
 *    sieciowych i bibliotek — „otwieralność" jest sprawdzana, nie deklarowana),
 *  · BRAMKI „eksport bez encji = błąd" (iniekcja: rysunek bez geometrii),
 *  · tabliczka rysunkowa (dane realne vs uczciwie puste pole),
 *  · konwencja nazw,
 *  · składanie pliku eksportu (`buildSldExportFile`) jako iloczyn
 *    {format} × {źródło: rysunek | model} × {dane: są | brak} × {serwer: plik |
 *    odmowa | brak nagłówków wersji}.
 *
 * Karta KASACJA-SCL-I-CIM-KLIENT (decyzja K-14/D-41): sekcje mapowania ENM na
 * SCL/SCD i CIM w przeglądarce USUNIĘTE razem z tymi eksporterami.
 * Intencja tamtych testów („plik modelu bez obiektów to pozorny sukces — bramka
 * przerywa eksport") przechodzi na backend: nazwana odmowa 422 dla modelu
 * niekompletnego (`backend/tests/cgmes/test_cgmes_kompletnosc.py`,
 * `backend/tests/api/test_enm_eksport_cgmes.py`); tu sprawdzamy, że klient
 * przekazuje ją słowo w słowo i nie zapisuje pliku.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSldDxf, buildDxfInput, DXF_LAYER_OPISY, DXF_LAYER_RYSUNEK } from '../exportDxfV3';
import { buildSldPdf, fitDrawingToPage, PDF_A3_LANDSCAPE_PT } from '../exportPdfV3';
import { pdfEncodeText, pdfTextWidth, pdfUnsupportedCharacters } from '../pdfFont';
import { buildSheetTitleBlockData, dataMetrykiPl, wersjaModeluPl, BRAK_DANEJ } from '../sheetTitleBlock';
import { buildSldExportFileName } from '../exportNames';
import { SLD_EXPORT_FORMATS, sldExportFormatDescriptor } from '../formats';
import { svgMarkupToDrawing, parsePathData, geometryPrimitiveCount, type ExportDrawing } from '../svgPrimitives';
import { buildSldExportFile, type SldExportContext } from '../sldExport';
import { adresEksportuCgmes, pobierzEksportCgmes } from '../eksportCgmesApi';

// ---------------------------------------------------------------------------
// Pomocnicze: markup arkusza „w miniaturze" — te same konstrukcje, które
// zmierzono w realnym eksporcie (g/translate, line, rect, circle, path, text).
// ---------------------------------------------------------------------------
const MARKUP_ARKUSZA = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <g transform="translate(10, 20)">
    <line x1="0" y1="0" x2="50" y2="0" stroke="#000000" stroke-width="2"/>
    <rect x="0" y="10" width="20" height="10" fill="none" stroke="#0F7A3D" stroke-dasharray="6 3"/>
    <circle cx="30" cy="15" r="4" fill="#FFFFFF" stroke="#000000"/>
    <path d="M 0 30 L 10 30 L 10 40 Z" fill="none" stroke="#000000"/>
    <text x="5" y="60" font-size="11" font-weight="700" text-anchor="middle" fill="#000000">Stacja Łąka</text>
  </g>
  <animate attributeName="opacity" from="0" to="1"/>
</svg>`;

function pustyMarkup(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"></svg>';
}

// ---------------------------------------------------------------------------
// Parser DXF (pary kod-wartość) — sprawdza, że plik da się przeczytać tak,
// jak czyta go program CAD: sekwencja par, poprawne sekcje, encje na
// zadeklarowanych warstwach.
// ---------------------------------------------------------------------------
interface DxfParsed {
  readonly sections: readonly string[];
  readonly entities: readonly { readonly type: string; readonly layer: string }[];
  readonly declaredLayers: readonly string[];
}

function parseDxf(dxf: string): DxfParsed {
  const lines = dxf.split('\n');
  expect(lines.length % 2).toBe(0); // pary kod/wartość — nieparzysta liczba = plik uszkodzony
  const sections: string[] = [];
  const entities: { type: string; layer: string }[] = [];
  const declaredLayers: string[] = [];
  let inSection: string | null = null;
  let inTables = false;
  let current: { type: string; layer: string } | null = null;
  let expectSectionName = false;
  let expectLayerName = false;

  for (let i = 0; i < lines.length; i += 2) {
    const code = Number.parseInt(lines[i], 10);
    const value = lines[i + 1];
    expect(Number.isFinite(code)).toBe(true);
    if (code === 0) {
      if (current) {
        entities.push(current);
        current = null;
      }
      if (value === 'SECTION') {
        expectSectionName = true;
      } else if (value === 'ENDSEC') {
        inSection = null;
        inTables = false;
      } else if (value === 'LAYER' && inTables) {
        expectLayerName = true;
      } else if (inSection === 'ENTITIES') {
        current = { type: value, layer: '0' };
      }
    } else if (code === 2) {
      if (expectSectionName) {
        inSection = value;
        sections.push(value);
        inTables = value === 'TABLES';
        expectSectionName = false;
      } else if (expectLayerName) {
        declaredLayers.push(value);
        expectLayerName = false;
      }
    } else if (code === 8 && current) {
      current.layer = value;
    }
  }
  return { sections, entities, declaredLayers };
}

// ---------------------------------------------------------------------------
// Parser PDF — nagłówek, obiekty, tablica xref (offsety MUSZĄ trafiać w
// początek obiektu), trailer, długość strumienia.
// ---------------------------------------------------------------------------
function sprawdzPdf(pdf: string): { readonly objectCount: number; readonly streamLength: number } {
  expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
  expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);

  // Uwaga: „xref" występuje TAKŻE w słowie „startxref", więc początku tablicy
  // szukamy przez zadeklarowany offset, nie przez wyszukiwanie tekstu.
  const startxref = Number.parseInt(/startxref\n(\d+)/.exec(pdf)![1], 10);
  const bytes = new TextEncoder().encode(pdf);
  const decoder = new TextDecoder();
  expect(decoder.decode(bytes.slice(startxref, startxref + 4))).toBe('xref');

  const xrefBlock = decoder.decode(bytes.slice(startxref));
  const offsets = Array.from(xrefBlock.matchAll(/^(\d{10}) 00000 n $/gm)).map((m) => Number.parseInt(m[1], 10));
  expect(offsets.length).toBeGreaterThan(0);
  offsets.forEach((offset, index) => {
    const head = decoder.decode(bytes.slice(offset, offset + 12));
    expect(head.startsWith(`${index + 1} 0 obj`)).toBe(true);
  });

  expect(pdf).toMatch(/trailer\n<< \/Size \d+ \/Root 1 0 R/);
  const declared = Number.parseInt(/<< \/Length (\d+) >>\nstream\n/.exec(pdf)![1], 10);
  const streamStart = pdf.indexOf('stream\n') + 'stream\n'.length;
  const streamEnd = pdf.indexOf('\nendstream');
  const actual = new TextEncoder().encode(pdf.slice(streamStart, streamEnd)).length;
  expect(actual).toBe(declared);
  return { objectCount: offsets.length, streamLength: declared };
}

describe('S9-6 · konwerter markupu na prymitywy', () => {
  it('czyta wszystkie konstrukcje arkusza i składa transformację grup', () => {
    const drawing = svgMarkupToDrawing(MARKUP_ARKUSZA);

    expect(drawing.width).toBe(200);
    expect(drawing.height).toBe(100);
    // linia + prostokąt + okrąg + ścieżka + tekst (animate pominięty)
    expect(drawing.primitives).toHaveLength(5);
    const linia = drawing.primitives.find((p) => p.kind === 'polyline')!;
    expect(linia).toMatchObject({ kind: 'polyline', closed: false });
    // translate(10,20) przeniesione na punkty
    expect((linia as { points: readonly { x: number; y: number }[] }).points[0]).toEqual({ x: 10, y: 20 });
    const tekst = drawing.primitives.find((p) => p.kind === 'text')!;
    expect(tekst).toMatchObject({ kind: 'text', text: 'Stacja Łąka', anchor: 'middle', fontSize: 11 });
    expect(geometryPrimitiveCount(drawing)).toBe(4);
  });

  it('kreskowanie i wypełnienie przechodzą na prymityw (nie giną po drodze)', () => {
    const drawing = svgMarkupToDrawing(MARKUP_ARKUSZA);
    const prostokat = drawing.primitives.find((p) => p.kind === 'polyline' && p.closed)!;
    expect(prostokat).toMatchObject({ stroke: '#0F7A3D', fill: null, dash: [6, 3] });
  });

  it('prostokąt tła w PROCENTACH pokrywa cały arkusz (regresja: „100%" czytane jako 100 jednostek zamalowywało róg rysunku)', () => {
    // Dokładnie ten węzeł wstrzykuje `injectExportBackground` (`exportPalette.ts`)
    // do KAŻDEGO `<svg>` eksportu — najczęstszy prostokąt w pliku.
    const zTlem = MARKUP_ARKUSZA.replace(
      '<g transform="translate(10, 20)">',
      '<rect x="0" y="0" width="100%" height="100%" fill="#FFFFFF"/><g transform="translate(10, 20)">',
    );
    const tlo = svgMarkupToDrawing(zTlem).primitives.find(
      (p) => p.kind === 'polyline' && p.fill === '#FFFFFF' && p.closed,
    ) as { readonly points: readonly { x: number; y: number }[] };

    expect(tlo.points).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ]);
  });

  it('jednostka długości spoza słownika (px/mm) RZUCA wyjątek zamiast cichej reinterpretacji', () => {
    const zJednostka = MARKUP_ARKUSZA.replace('width="20"', 'width="20mm"');
    expect(() => svgMarkupToDrawing(zJednostka)).toThrow(/nieobsługiwana jednostka długości/);
  });

  it('element spoza znanego słownika RZUCA wyjątek — nigdy cicho pomija części rysunku', () => {
    const zNieznanym = MARKUP_ARKUSZA.replace('<animate', '<use href="#x" /><animate');
    expect(() => svgMarkupToDrawing(zNieznanym)).toThrow(/nieobsługiwany element „<use>"/);
  });

  it('transformacja inna niż translate RZUCA wyjątek (skala zmieniłaby geometrię po cichu)', () => {
    const zeSkala = MARKUP_ARKUSZA.replace('translate(10, 20)', 'scale(2)');
    expect(() => svgMarkupToDrawing(zeSkala)).toThrow(/nieobsługiwana transformacja/);
  });

  it('element praktycznie niewidoczny (opacity 0) nie trafia do pliku', () => {
    const zUkrytym = MARKUP_ARKUSZA.replace('<g transform', '<g opacity="0" transform');
    expect(svgMarkupToDrawing(zUkrytym).primitives).toHaveLength(0);
  });

  it('`currentColor` rozwiązywany z `style` przodka (strzałki rozpływu zwarciowego)', () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">
      <g style="color: #B71C1C;"><polygon points="0,0 5,0 5,5" fill="currentColor" stroke="currentColor"/></g></svg>`;
    const [prymityw] = svgMarkupToDrawing(markup).primitives;
    expect(prymityw).toMatchObject({ kind: 'polyline', closed: true, fill: '#B71C1C', stroke: '#B71C1C' });
  });

  it('parser ścieżek obsługuje komendy sceny (M/L/Z/h/q) i spłaszcza krzywą deterministycznie', () => {
    const [prosta] = parsePathData('M 3 10 L 13 10 L 8 16 Z');
    expect(prosta.closed).toBe(true);
    expect(prosta.points).toHaveLength(3);

    const [skos] = parsePathData('M6,8 h8');
    expect(skos.points[1]).toEqual({ x: 14, y: 8 });

    const [krzywa] = parsePathData('M 8 8 q 5 2.5 0 5');
    expect(krzywa.points).toHaveLength(9); // punkt startowy + 8 odcinków
    expect(parsePathData('M 8 8 q 5 2.5 0 5')).toEqual(parsePathData('M 8 8 q 5 2.5 0 5'));
  });
});

describe('S9-6 · DXF: struktura pliku i bramka pustych encji', () => {
  it('plik ma sekcje HEADER/TABLES/ENTITIES, encje na ZADEKLAROWANYCH warstwach i kończy się EOF', () => {
    const dxf = buildSldDxf(svgMarkupToDrawing(MARKUP_ARKUSZA), 'Schemat testowy');
    const parsed = parseDxf(dxf);

    expect(parsed.sections).toEqual(['HEADER', 'TABLES', 'ENTITIES']);
    expect(dxf.endsWith('EOF')).toBe(true);
    expect(parsed.entities.length).toBeGreaterThan(0);
    expect(parsed.entities.some((e) => e.type === 'LINE')).toBe(true);
    expect(parsed.entities.some((e) => e.type === 'CIRCLE')).toBe(true);
    expect(parsed.entities.some((e) => e.type === 'TEXT')).toBe(true);
    // KAŻDA warstwa użyta przez encję musi być zadeklarowana w tablicy warstw.
    for (const entity of parsed.entities) {
      expect(parsed.declaredLayers).toContain(entity.layer);
    }
    expect(parsed.declaredLayers).toEqual(expect.arrayContaining([DXF_LAYER_RYSUNEK, DXF_LAYER_OPISY]));
  });

  it('polski tekst trafia do DXF bez transliteracji (AC1024 = UTF-8)', () => {
    const dxf = buildSldDxf(svgMarkupToDrawing(MARKUP_ARKUSZA), 'Schemat');
    expect(dxf).toContain('Stacja Łąka');
  });

  it('INIEKCJA: rysunek bez geometrii ⇒ BRAMKA (wyjątek), nigdy „udany" pusty plik', () => {
    expect(() => buildSldDxf(svgMarkupToDrawing(pustyMarkup()), 'Pusty')).toThrow(/nie zawiera żadnej geometrii/);
  });

  it('INIEKCJA: rysunek z samym tekstem (zero geometrii) też jest zatrzymany', () => {
    const samTekst = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><text x="1" y="2">Opis</text></svg>';
    expect(() => buildSldDxf(svgMarkupToDrawing(samTekst), 'Sam opis')).toThrow(/nie zawiera żadnej geometrii/);
  });

  it('wyrównanie tekstu ze sceny przechodzi na kod wyrównania DXF', () => {
    const input = buildDxfInput(svgMarkupToDrawing(MARKUP_ARKUSZA), 'T');
    expect(input.texts[0].align).toBe('center');
  });
});

describe('S9-6 · PDF: struktura pliku, determinizm i polskie znaki', () => {
  it('plik jest poprawnym PDF-em: nagłówek, obiekty, xref trafiający w obiekty, trailer, długość strumienia', () => {
    const pdf = buildSldPdf(svgMarkupToDrawing(MARKUP_ARKUSZA), 'Schemat testowy');
    const { objectCount, streamLength } = sprawdzPdf(pdf);

    expect(objectCount).toBe(8);
    expect(streamLength).toBeGreaterThan(0);
    expect(pdf).toContain(`/MediaBox [0 0 ${PDF_A3_LANDSCAPE_PT.width} ${PDF_A3_LANDSCAPE_PT.height}]`);
  });

  it('ten sam rysunek daje BAJT-IDENTYCZNY plik (zero zegara, zero losowości)', () => {
    const a = buildSldPdf(svgMarkupToDrawing(MARKUP_ARKUSZA), 'Schemat testowy');
    const b = buildSldPdf(svgMarkupToDrawing(MARKUP_ARKUSZA), 'Schemat testowy');
    expect(a).toBe(b);
    expect(a).not.toMatch(/CreationDate/);
  });

  it('polskie znaki mają własne kody (`/Differences`), nie są transliterowane', () => {
    const pdf = buildSldPdf(svgMarkupToDrawing(MARKUP_ARKUSZA), 'Schemat');
    expect(pdf).toContain('/Differences [ 1 /aogonek');
    // „Stacja Łąka" → Ł=\010, ą=\001
    expect(pdf).toContain('(Stacja \\010\\001ka)');
    expect(pdf).not.toContain('(Stacja Laka)');
  });

  it('oracle pokrycia pisma: etykiety rysunku nie trafiają w znak zastępczy', () => {
    const teksty = ['Stacja Łąka', 'Sk″ 250 MVA', 'Ω', 'Zwarcie ≥ 12,5 kA', 'GPZ Poznań — sekcja 1'];
    expect(pdfUnsupportedCharacters(teksty)).toEqual([]);
    expect(pdfUnsupportedCharacters(['emoji 🙂'])).toEqual(['🙂']);
  });

  it('szerokość tekstu liczona z metryk AFM — wyrównanie do środka jest przesunięciem o połowę tej szerokości', () => {
    // Helvetica: „AA" = 2 × 667/1000 em.
    expect(pdfTextWidth('AA', 10, false)).toBeCloseTo(13.34, 5);
    // Znak akcentowany ma szerokość litery bazowej (kroje bazowe PDF).
    expect(pdfTextWidth('ą', 10, false)).toBe(pdfTextWidth('a', 10, false));
    expect(pdfEncodeText('(a)')).toBe('\\(a\\)');
  });

  it('rysunek wpasowany w A3 poziomy z marginesem — skala jednorodna, bez zniekształcenia', () => {
    const drawing: ExportDrawing = { width: 2000, height: 1000, primitives: [] };
    const fit = fitDrawingToPage(drawing);
    expect(fit.scale).toBeGreaterThan(0);
    expect(2000 * fit.scale).toBeLessThanOrEqual(PDF_A3_LANDSCAPE_PT.width);
    expect(1000 * fit.scale).toBeLessThanOrEqual(PDF_A3_LANDSCAPE_PT.height);
  });

  it('INIEKCJA: rysunek bez geometrii ⇒ BRAMKA (wyjątek)', () => {
    expect(() => buildSldPdf(svgMarkupToDrawing(pustyMarkup()), 'Pusty')).toThrow(/nie zawiera żadnej geometrii/);
  });
});

describe('S9-6 · tabliczka rysunkowa: dane realne albo uczciwie puste pole', () => {
  const pelne = {
    projectName: 'Sieć Wschód',
    caseName: 'Zwarcie maksymalne',
    networkName: 'GPZ Poznań — ciąg 1',
    modelUpdatedAtIso: '2026-08-04T09:15:00Z',
    modelRevision: 12,
    modelHash: 'acf9d1b2c3d4e5f6',
    stationCount: 53,
    sheetAspect: 1.41,
    lodLabelPl: 'Szczegół pola',
  };

  it('wypełnia wiersze danymi z modelu i powłoki', () => {
    const rows = buildSheetTitleBlockData(pelne).rows;
    const byLabel = new Map(rows.map((r) => [r.labelPl, r.value]));

    expect(byLabel.get('Projekt')).toBe('Sieć Wschód');
    expect(byLabel.get('Zakres obliczeń')).toBe('Zwarcie maksymalne');
    expect(byLabel.get('Sieć (model)')).toBe('GPZ Poznań — ciąg 1');
    expect(byLabel.get('Data modelu')).toBe('2026-08-04');
    expect(byLabel.get('Wersja modelu')).toBe('rew. 12 · acf9d1b2');
    expect(byLabel.get('Liczba stacji')).toBe('53');
    expect(byLabel.get('Arkusz')).toContain('A3 poziomy');
    expect(byLabel.get('Arkusz')).toContain('1,41 : 1');
  });

  it('schemat jednokreskowy jest BEZ SKALI — pole mówi to wprost, zamiast podawać wymyślone „1:1000"', () => {
    const rows = buildSheetTitleBlockData(pelne).rows;
    expect(rows.find((r) => r.labelPl === 'Skala')?.value).toBe('bez skali — schemat jednokreskowy');
  });

  it('brak danej ⇒ wartość `null` (renderowana jako znak braku), nigdy zaślepka', () => {
    const rows = buildSheetTitleBlockData({ stationCount: 0, sheetAspect: 1.4 }).rows;
    expect(rows.find((r) => r.labelPl === 'Projekt')?.value).toBeNull();
    expect(rows.find((r) => r.labelPl === 'Data modelu')?.value).toBeNull();
    expect(rows.find((r) => r.labelPl === 'Wersja modelu')?.value).toBeNull();
    // Liczba stacji 0 to REALNY pomiar pustego rysunku, nie brak danej.
    expect(rows.find((r) => r.labelPl === 'Liczba stacji')?.value).toBe('0');
    expect(BRAK_DANEJ).toBe('—');
  });

  it('data nierozpoznana nie jest podmieniana na „dziś"', () => {
    expect(dataMetrykiPl('nieznana')).toBeNull();
    expect(dataMetrykiPl(null)).toBeNull();
    expect(wersjaModeluPl(null, null)).toBeNull();
    expect(wersjaModeluPl(3, null)).toBe('rew. 3');
  });
});

describe('S9-6 · konwencja nazw plików', () => {
  it('trzon identyczny dla wszystkich formatów, różni się WYŁĄCZNIE rozszerzeniem', () => {
    const wejscie = { projectName: 'Sieć Wschód', caseName: 'Zwarcie max', modelRevision: 7, modelHash: 'abcdef1234' };
    for (const descriptor of SLD_EXPORT_FORMATS) {
      expect(buildSldExportFileName(descriptor.id, wejscie)).toBe(
        `schemat-sld_Siec_Wschod_Zwarcie_max_rew7-abcdef12.${descriptor.extension}`,
      );
    }
  });

  it('brak danych ⇒ człon POMINIĘTY (bez słów-zaślepek „projekt"/„wariant")', () => {
    expect(buildSldExportFileName('svg', {})).toBe('schemat-sld.svg');
    expect(buildSldExportFileName('dxf', { modelRevision: 2 })).toBe('schemat-sld_rew2.dxf');
    expect(buildSldExportFileName('pdf', { projectName: 'P' })).not.toContain('wariant');
  });

  it('nazwa jest deterministyczna (zero zależności od zegara)', () => {
    const wejscie = { projectName: 'P', caseName: 'C', modelRevision: 1, modelHash: 'aa11bb22' };
    expect(buildSldExportFileName('svg', wejscie)).toBe(buildSldExportFileName('svg', wejscie));
  });

  it('rejestr formatów zna każdą pozycję, PNG nie istnieje', () => {
    expect(SLD_EXPORT_FORMATS.map((d) => d.id)).toEqual(['svg', 'pdf', 'dxf', 'cgmes']);
    // Jeden eksport modelu sieci (K-14/D-41): lista wyżej jest DOKŁADNA, więc
    // klientowe SCD i CIM nie mogą wrócić bez czerwieni tego testu.
    expect(sldExportFormatDescriptor('cgmes')).toMatchObject({
      labelPl: 'CGMES — model sieci (IEC 61970 EQ+TP)',
      extension: 'cgmes.zip',
      mime: 'application/zip',
      source: 'model',
    });
    expect(sldExportFormatDescriptor('dxf').extension).toBe('dxf');
    // @ts-expect-error — format spoza rejestru nie przechodzi typu ANI wykonania
    expect(() => sldExportFormatDescriptor('png')).toThrow(/nieznany format/);
  });
});

// ---------------------------------------------------------------------------
// Składanie pliku eksportu — iloczyn cech (karta KASACJA-SCL-I-CIM-KLIENT).
// ---------------------------------------------------------------------------
function migawka(revision: number, hash: string): EnergyNetworkModel {
  return { header: { revision, hash_sha256: hash } } as unknown as EnergyNetworkModel;
}

function kontekst(zmiany: Partial<SldExportContext> = {}): SldExportContext {
  return {
    svgMarkup: MARKUP_ARKUSZA,
    snapshot: migawka(3, 'aaaabbbbcccc'),
    caseId: 'przypadek-7',
    projectName: 'Sieć Wschód',
    caseName: 'Wariant A',
    ...zmiany,
  };
}

function odpowiedzSerwera(status: number, cialo: string, naglowki: Record<string, string>): Response {
  return new Response(cialo, { status, headers: naglowki });
}

describe('buildSldExportFile — format × źródło × dane × serwer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const format of ['svg', 'pdf', 'dxf'] as const) {
    it(`${format}: plik z RYSUNKU, nazwa z wersji migawki, zero wołania serwera`, async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const plik = await buildSldExportFile(format, kontekst());
      expect(typeof plik.content).toBe('string');
      expect((plik.content as string).length).toBeGreaterThan(0);
      expect(plik.filename).toBe(`schemat-sld_Siec_Wschod_Wariant_A_rew3-aaaabbbb.${sldExportFormatDescriptor(format).extension}`);
      expect(plik.mime).toBe(sldExportFormatDescriptor(format).mime);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it(`${format}: brak rysunku ⇒ nazwany wyjątek, nie pusty plik`, async () => {
      await expect(buildSldExportFile(format, kontekst({ svgMarkup: null }))).rejects.toThrow(
        new RegExp(`Eksport ${format.toUpperCase()}: brak rysunku schematu`),
      );
    });
  }

  it('cgmes: bajty z serwera BEZ ZMIAN, nazwa z wersji podanej przez serwer, rysunek niepotrzebny', async () => {
    const fetchSpy = vi.fn(async () =>
      odpowiedzSerwera(200, 'PK-archiwum', {
        'content-type': 'application/zip',
        'x-model-rewizja': '9',
        'x-model-odcisk': '0123456789abcdef',
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const plik = await buildSldExportFile('cgmes', kontekst({ svgMarkup: null }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/cases/przypadek-7/enm/eksport-cgmes', {
      method: 'GET',
      headers: { Accept: 'application/zip' },
    });
    expect(plik.content).not.toBeTypeOf('string');
    expect(await (plik.content as Blob).text()).toBe('PK-archiwum');
    // Rewizja 9 z serwera, nie 3 z migawki przeglądarki.
    expect(plik.filename).toBe('schemat-sld_Siec_Wschod_Wariant_A_rew9-01234567.cgmes.zip');
    expect(plik.mime).toBe('application/zip');
  });

  it('cgmes: serwer bez nagłówków wersji ⇒ człon wersji POMINIĘTY (nie dosztukowany z migawki)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odpowiedzSerwera(200, 'PK', { 'content-type': 'application/zip' })));
    const plik = await buildSldExportFile('cgmes', kontekst());
    expect(plik.filename).toBe('schemat-sld_Siec_Wschod_Wariant_A.cgmes.zip');
  });

  it('cgmes: odmowa 422 ⇒ wyjątek z treścią serwera słowo w słowo', async () => {
    const odmowa = 'Eksport CGMES wstrzymany — model sieci jest niekompletny: Odbiór „Odbiór C” jest przyłączony do szyny, której nie ma w modelu';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => odpowiedzSerwera(422, JSON.stringify({ detail: odmowa }), { 'content-type': 'application/json' })),
    );
    await expect(buildSldExportFile('cgmes', kontekst())).rejects.toThrow(odmowa);
  });

  it('cgmes: błąd serwera bez treści JSON ⇒ nazwany kod HTTP, nie pusty komunikat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odpowiedzSerwera(500, 'Internal Server Error', {})));
    await expect(pobierzEksportCgmes('p')).rejects.toThrow('Eksport CGMES: serwer odpowiedział kodem HTTP 500.');
  });

  it('cgmes: brak aktywnego przypadku ⇒ nazwany wyjątek, zero wołania serwera', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(buildSldExportFile('cgmes', kontekst({ caseId: null }))).rejects.toThrow(
      /brak aktywnego przypadku obliczeniowego/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('adres końcówki koduje identyfikator przypadku', () => {
    expect(adresEksportuCgmes('a b/c')).toBe('/api/cases/a%20b%2Fc/enm/eksport-cgmes');
  });
});

// ---------------------------------------------------------------------------
// V12K-331 (interakcja S9-6 × S9-7/8): zagnieżdżony <svg> ramki arkusza niesie
// viewBox o PRZESUNIĘTYM początku (margines formatu, np. „-298 -298 8940 6237"
// przy rozmiarze 8940×6237) — to czysta translacja, nie skalowanie. Konwerter
// DXF/PDF musi ją odwzorować przesunięciem współrzędnych; twardy błąd zostaje
// WYŁĄCZNIE dla realnego skalowania (wymiary viewBoxu ≠ rozmiar viewportu),
// bo to rozjechałoby geometrię po cichu. Obie strony przypięte testem
// (deklaracja bez testu = fałszywa pewność).
// ---------------------------------------------------------------------------
import { svgMarkupToDrawing } from '../svgPrimitives';

describe('zagnieżdżony <svg> — translacja odwzorowana, skalowanie odrzucone (V12K-331)', () => {
  it('viewBox o przesuniętym początku (skala 1:1) przesuwa współrzędne dzieci', () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'
      + '<svg width="100" height="100" viewBox="-30 -20 100 100">'
      + '<line x1="0" y1="0" x2="10" y2="0" stroke="#000" stroke-width="1"/>'
      + '</svg></svg>';
    const drawing = svgMarkupToDrawing(markup);
    const linia = drawing.primitives.find((p) => p.kind === 'polyline');
    expect(linia).toBeDefined();
    if (linia?.kind === 'polyline') {
      // Punkt (0,0) w układzie viewBoxu „-30 -20 …" leży 30 px w prawo i
      // 20 px w dół od początku viewportu.
      expect(linia.points[0]).toEqual({ x: 30, y: 20 });
      expect(linia.points[1]).toEqual({ x: 40, y: 20 });
    }
  });

  it('viewBox SKALUJĄCY (wymiary ≠ rozmiar viewportu) pozostaje twardym błędem', () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'
      + '<svg width="100" height="100" viewBox="0 0 50 50">'
      + '<line x1="0" y1="0" x2="10" y2="0" stroke="#000" stroke-width="1"/>'
      + '</svg></svg>';
    expect(() => svgMarkupToDrawing(markup)).toThrow(/skalujący viewBox/);
  });
});
