/**
 * S9-6 — testy jednostkowe warstwy eksportu dokumentowego:
 *  · STRUKTURA plików (DXF i PDF czytane WŁASNYM parserem, bez zależności
 *    sieciowych i bibliotek — „otwieralność" jest sprawdzana, nie deklarowana),
 *  · BRAMKI „eksport bez encji = błąd" (iniekcja: rysunek bez geometrii),
 *  · tabliczka rysunkowa (dane realne vs uczciwie puste pole),
 *  · konwencja nazw,
 *  · mapowanie modelu ENM na SCD/CIM, w tym ścieżka PÓL SN, której fixtura
 *    goldenowa nie ma (model syntetyczny z polami — inaczej ta gałąź byłaby
 *    kodem bez pokrycia).
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSldDxf, buildDxfInput, DXF_LAYER_OPISY, DXF_LAYER_RYSUNEK } from '../exportDxfV3';
import { buildSldPdf, fitDrawingToPage, PDF_A3_LANDSCAPE_PT } from '../exportPdfV3';
import { pdfEncodeText, pdfTextWidth, pdfUnsupportedCharacters } from '../pdfFont';
import { buildSheetTitleBlockData, dataMetrykiPl, wersjaModeluPl, BRAK_DANEJ } from '../sheetTitleBlock';
import { buildSldExportFileName } from '../exportNames';
import { SLD_EXPORT_FORMATS, sldExportFormatDescriptor } from '../formats';
import { svgMarkupToDrawing, parsePathData, geometryPrimitiveCount, type ExportDrawing } from '../svgPrimitives';
import { buildCimInput, buildIec61850Input, cimObjectCount, iec61850ObjectCount } from '../exportModelData';
import { generateIec61850Scd } from '../../../v2/export/exportIec61850';
import { generateCimRdfXml } from '../../../v2/export/exportCim';

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
    expect(SLD_EXPORT_FORMATS.map((d) => d.id)).toEqual(['svg', 'pdf', 'dxf', 'iec61850', 'cim']);
    expect(sldExportFormatDescriptor('dxf').extension).toBe('dxf');
    // @ts-expect-error — format spoza rejestru nie przechodzi typu ANI wykonania
    expect(() => sldExportFormatDescriptor('png')).toThrow(/nieznany format/);
  });
});

// ---------------------------------------------------------------------------
// SCD / CIM — model syntetyczny Z POLAMI SN (fixtura goldenowa ich nie ma,
// więc bez tego ścieżka pól/aparatów byłaby kodem bez pokrycia).
// ---------------------------------------------------------------------------
function modelZPolami(): EnergyNetworkModel {
  const element = (ref: string, name: string) => ({ id: ref, ref_id: ref, name, tags: [], meta: {} });
  return {
    header: {
      enm_version: '1.0',
      name: 'Sieć testowa',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-02T00:00:00Z',
      revision: 4,
      hash_sha256: 'abc123def456',
      defaults: { frequency_hz: 50, phase_system: '3ph' },
    },
    buses: [
      { ...element('bus-sn', 'Szyna SN'), voltage_kv: 15, phase_system: '3ph' },
      { ...element('bus-nn', 'Szyna nN'), voltage_kv: 0.4, phase_system: '3ph' },
    ],
    branches: [
      { ...element('cb-1', 'Wyłącznik pola 1'), type: 'breaker', from_bus_ref: 'bus-sn', to_bus_ref: 'bus-nn', status: 'closed' },
      { ...element('ds-1', 'Odłącznik pola 1'), type: 'disconnector', from_bus_ref: 'bus-sn', to_bus_ref: 'bus-nn', status: 'open' },
      {
        ...element('kabel-1', 'Kabel SN'),
        type: 'cable',
        from_bus_ref: 'bus-sn',
        to_bus_ref: 'bus-nn',
        status: 'closed',
        length_km: 2,
        r_ohm_per_km: 0.2,
        x_ohm_per_km: 0.1,
        b_siemens_per_km: 0.00005,
      },
    ],
    transformers: [
      {
        ...element('tr-1', 'Transformator T1'),
        hv_bus_ref: 'bus-sn',
        lv_bus_ref: 'bus-nn',
        sn_mva: 0.63,
        uhv_kv: 15,
        ulv_kv: 0.4,
        uk_percent: 4.5,
        pk_kw: 6.5,
      },
    ],
    sources: [],
    loads: [],
    generators: [],
    substations: [
      {
        ...element('st-1', 'Stacja ST-1'),
        station_type: 'mv_lv',
        bus_refs: ['bus-sn', 'bus-nn'],
        transformer_refs: ['tr-1'],
        designation: 'ST-15/0,4-01',
      },
    ],
    bays: [
      {
        ...element('pole-1', 'Pole liniowe'),
        bay_role: 'FEEDER',
        substation_ref: 'st-1',
        bus_ref: 'bus-sn',
        equipment_refs: ['cb-1', 'ds-1'],
        bay_number: '10',
      },
      {
        ...element('pole-2', 'Pole transformatorowe'),
        bay_role: 'TR',
        substation_ref: 'st-1',
        bus_ref: 'bus-sn',
        equipment_refs: [],
      },
    ],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

describe('S9-6 · SCD (IEC 61850) z realnego modelu', () => {
  it('stacja → poziomy napięć → pola → aparaty, z polskimi opisami ról', () => {
    const input = buildIec61850Input(modelZPolami(), 'Projekt X');
    expect(iec61850ObjectCount(input)).toBeGreaterThan(0);

    const [stacja] = input.substations;
    expect(stacja.name).toBe('ST-15/0,4-01'); // `designation` ma pierwszeństwo przed nazwą
    expect(stacja.voltageLevels.map((v) => v.voltage_kv)).toEqual([15, 0.4]);

    const sn = stacja.voltageLevels[0];
    expect(sn.bays.map((b) => b.name)).toEqual(['Pole 10', 'Pole transformatorowe']);
    expect(sn.bays[0].desc).toBe('Pole liniowe');
    expect(sn.bays[0].equipment.map((e) => e.type)).toEqual(['CBR', 'DIS']);
    // Pole transformatorowe dostaje transformator stacji (inaczej wyszłoby puste).
    expect(sn.bays[1].equipment.map((e) => e.type)).toEqual(['PTR']);

    const xml = generateIec61850Scd(input);
    expect(xml).toContain('<Bay name="Pole 10"');
    expect(xml).toContain('ConductingEquipment');
  });

  it('BRAMKA: model bez stacji ⇒ zero obiektów (wołający przerywa eksport)', () => {
    const pusty = { ...modelZPolami(), substations: [], bays: [] } as unknown as EnergyNetworkModel;
    expect(iec61850ObjectCount(buildIec61850Input(pusty))).toBe(0);
  });
});

describe('S9-6 · CIM (IEC 61970/61968) z realnego modelu', () => {
  it('stacje, poziomy napięć, pola, odcinki, transformatory i łączniki z parametrami modelu', () => {
    const input = buildCimInput(modelZPolami());
    expect(cimObjectCount(input)).toBe(1 + 2 + 2 + 1 + 1 + 2);

    const [odcinek] = input.acLineSegments;
    expect(odcinek).toMatchObject({ mrid: 'kabel-1', length_m: 2000 });
    expect(odcinek.r_ohm).toBeCloseTo(0.4, 10);
    expect(odcinek.x_ohm).toBeCloseTo(0.2, 10);

    expect(input.powerTransformers[0]).toMatchObject({ mrid: 'tr-1', substation_mrid: 'st-1', ratedS_mva: 0.63 });
    // Stan łącznika z modelu — nie domyślny „zamknięty".
    expect(input.breakers.map((b) => b.normalOpen)).toEqual([false, true]);

    const xml = generateCimRdfXml(input);
    expect(xml).toContain('<cim:Substation rdf:ID="st-1">');
    expect(xml).toContain('<cim:ACLineSegment rdf:ID="kabel-1">');
    expect(xml).toContain('<cim:Switch.normalOpen>true</cim:Switch.normalOpen>');
  });

  it('łącznik spoza pola nie dostaje pustej referencji kontenera (wskaźnik donikąd)', () => {
    const bezPol = { ...modelZPolami(), bays: [] } as unknown as EnergyNetworkModel;
    const xml = generateCimRdfXml(buildCimInput(bezPol));
    expect(xml).toContain('<cim:Breaker rdf:ID="cb-1">');
    expect(xml).not.toContain('rdf:resource="#"');
  });

  it('BRAMKA: model pusty ⇒ zero obiektów (wołający przerywa eksport)', () => {
    const pusty = {
      ...modelZPolami(),
      substations: [],
      bays: [],
      branches: [],
      transformers: [],
    } as unknown as EnergyNetworkModel;
    expect(cimObjectCount(buildCimInput(pusty))).toBe(0);
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
