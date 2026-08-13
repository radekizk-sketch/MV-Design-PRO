/**
 * S9-6 — ODBIÓR karty: „każdy format oferowany w UI zwraca plik z geometrią".
 *
 * Test idzie REALNĄ ŚCIEŻKĄ UŻYTKOWNIKA (montaż `SldCanvasV3Workspace`,
 * rozwinięcie menu, klik pozycji), na REALNEJ fixturze goldenowej
 * `sldSubstrate52s` (53 stacje) — tej samej, na której działa skrypt odbioru
 * `npm run accept:sld-v3`. Sprawdzane są ILOCZYNY CECH, nie pojedynczy
 * przypadek z karty:
 *   {format: svg, pdf, dxf, iec61850, cim} × {LOD 0, 1, 2} × {motyw ciemny, jasny}
 * Motyw dotyczy formatów rysunkowych (SVG/PDF/DXF); dla nich sprawdzamy
 * dodatkowo, że plik jest BAJT-IDENTYCZNY w obu motywach (arkusz dokumentowy
 * nie zależy od tego, w czym pracował projektant).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useAppStateStore } from '../../../../app-state';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { useThemeModeStore, type ThemeMode } from '../../../../../ui2/theme/themeMode';
import { SldCanvasV3Workspace } from '../../canvas/SldCanvasV3Workspace';
import { SLD_EXPORT_FORMATS, type SldExportFormat } from '../formats';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const PROJEKT = 'Sieć Wschód';
const PRZYPADEK = 'Zwarcie maksymalne';

interface ZapisanyPlik {
  readonly nazwa: string;
  readonly tresc: string;
  readonly mime: string;
}

/** Przechwytuje pobranie pliku (Blob + `<a download>`) bez opuszczania jsdom. */
function przechwycPobranie(): { readonly pliki: ZapisanyPlik[] } {
  const pliki: ZapisanyPlik[] = [];
  const ostatni: { parts?: BlobPart[]; type?: string } = {};
  const RealBlob = globalThis.Blob;
  vi.stubGlobal(
    'Blob',
    vi.fn((parts: BlobPart[], options?: BlobPropertyBag) => {
      ostatni.parts = parts;
      ostatni.type = options?.type;
      return new RealBlob(parts, options);
    }),
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === 'a') {
      Object.defineProperty(el, 'click', {
        value: () => {
          pliki.push({
            nazwa: (el as HTMLAnchorElement).download,
            tresc: String(ostatni.parts?.[0] ?? ''),
            mime: ostatni.type ?? '',
          });
        },
      });
    }
    return el;
  });
  return { pliki };
}

function rozwinZwinieteNarzedzia(): void {
  const menu = screen.queryByTestId('sld-v3-toolbar-menu-toggle');
  if (menu && screen.queryByTestId('sld-v3-toolbar-menu') === null) fireEvent.click(menu);
}

function eksportuj(format: SldExportFormat, lod: 0 | 1 | 2, motyw: ThemeMode): ZapisanyPlik {
  // Każdy eksport startuje od czystego drzewa i czystych szpiegów — test
  // wołający tę funkcję kilka razy w jednym przypadku (np. porównanie nazw
  // między formatami) nie może zostawiać zamontowanych poprzednich kanw.
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useThemeModeStore.getState().setMode(motyw);
  const { pliki } = przechwycPobranie();
  render(<SldCanvasV3Workspace width={900} height={700} lodOverride={lod} />);
  rozwinZwinieteNarzedzia();
  fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
  fireEvent.click(screen.getByTestId(`sld-export-format-${format}`));
  expect(pliki).toHaveLength(1);
  return pliki[0];
}

beforeEach(() => {
  // @ts-expect-error jsdom shim
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  // @ts-expect-error jsdom shim
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  // Kolejność: ustawienie projektu/przypadku RESETUJE store migawki (zmiana
  // przypadku unieważnia model), więc migawka wchodzi PO nich.
  useAppStateStore.getState().setActiveProject('projekt-1', PROJEKT);
  useAppStateStore.getState().setActiveCase('przypadek-1', PRZYPADEK);
  useSnapshotStore.setState({ snapshot: enm });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useThemeModeStore.getState().setMode('dark_scada');
});

/** Minimalny rozmiar pliku [B] uznawany za „niosący treść". Pomiar stanu
 *  PRZED naprawą: DXF 176 B, SCD 169 B, CIM 220 B (same nagłówki formatu) —
 *  próg 2 000 B jest o rząd wielkości wyżej niż każdy z tych pozorów, a o
 *  rząd niżej niż realne pliki fixtury (15 kB…900 kB), więc łapie regresję
 *  „pusty szkielet" bez czułości na wahania treści. */
const PROG_ROZMIARU_B = 2000;

/** Znaczniki dowodzące, że plik niesie ELEMENTY SCENY (nie sam szkielet). */
const DOWOD_TRESCI: Readonly<Record<SldExportFormat, (tresc: string) => boolean>> = {
  svg: (t) => t.includes('sld-v3-symbols') && t.includes('sld-sheet-title-block'),
  pdf: (t) => t.startsWith('%PDF-') && t.includes('%%EOF') && (t.match(/ l\n/g)?.length ?? 0) > 100,
  dxf: (t) => t.includes('\nENTITIES\n') && (t.match(/\nLINE\n/g)?.length ?? 0) > 100,
  // Fixtura goldenowa NIE ma pól SN w ENM (`bays: []`, sieć zbudowana z ciągów
  // liniowych), więc dowodem treści są stacje i poziomy napięć POLICZONE z
  // modelu — mapowanie pól/aparatów ma własny test jednostkowy na modelu,
  // który je ma (`eksportDokumentu.test.ts`). Wymaganie tu `<Bay>` byłoby
  // wymaganiem od eksportu danych, których model nie niesie (fabrykacja).
  iec61850: (t) => t.includes('<Substation') && t.includes('<VoltageLevel') && (t.match(/<Substation /g)?.length ?? 0) > 50,
  cim: (t) => t.includes('<cim:Substation') && t.includes('<cim:ACLineSegment'),
};

describe('S9-6 odbiór: każdy oferowany format × każdy poziom szczegółu zwraca plik z treścią', () => {
  for (const descriptor of SLD_EXPORT_FORMATS) {
    for (const lod of [0, 1, 2] as const) {
      it(`format ${descriptor.id} @ LOD ${lod} — plik > ${PROG_ROZMIARU_B} B ze strukturą sceny`, () => {
        const plik = eksportuj(descriptor.id, lod, 'dark_scada');

        expect(plik.tresc.length).toBeGreaterThan(PROG_ROZMIARU_B);
        expect(DOWOD_TRESCI[descriptor.id](plik.tresc)).toBe(true);
        expect(plik.mime).toContain(descriptor.mime);
        expect(plik.nazwa.endsWith(`.${descriptor.extension}`)).toBe(true);
      });
    }
  }
});

describe('S9-6 odbiór: jedna konwencja nazw dla wszystkich formatów', () => {
  it('nazwa niesie projekt, przypadek i wersję modelu — ten sam trzon w każdym formacie', () => {
    const nazwy = SLD_EXPORT_FORMATS.map((d) => eksportuj(d.id, 1, 'dark_scada').nazwa);
    for (const nazwa of nazwy) {
      expect(nazwa).toMatch(/^schemat-sld_Siec_Wschod_Zwarcie_maksymalne_rew\d+-[0-9a-f]+\./);
    }
    // Dokładnie jedna konwencja: wszystkie nazwy różnią się WYŁĄCZNIE
    // rozszerzeniem (przed S9-6 były dwie: `schemat_sld.svg` i `projekt_wariant.dxf`).
    const trzony = new Set(nazwy.map((n) => n.slice(0, n.indexOf('.'))));
    expect(trzony.size).toBe(1);
  });
});

describe('S9-6 odbiór: arkusz dokumentowy nie zależy od motywu ekranu', () => {
  for (const format of ['svg', 'pdf', 'dxf'] as const) {
    it(`${format} — bajt-identyczny w motywie ciemnym i jasnym`, () => {
      const ciemny = eksportuj(format, 1, 'dark_scada');
      const jasny = eksportuj(format, 1, 'light_technical');

      expect(jasny.tresc).toBe(ciemny.tresc);
      expect(jasny.nazwa).toBe(ciemny.nazwa);
    });
  }
});

describe('S9-6 odbiór: tabliczka rysunkowa z danymi REALNYMI', () => {
  it('SVG niesie nazwę projektu, przypadku, sieci, wersję modelu i liczbę stacji z modelu', () => {
    const plik = eksportuj('svg', 1, 'dark_scada');

    expect(plik.tresc).toContain('SCHEMAT JEDNOKRESKOWY SIECI SN');
    expect(plik.tresc).toContain(PROJEKT);
    expect(plik.tresc).toContain(PRZYPADEK);
    expect(plik.tresc).toContain(enm.header.name);
    expect(plik.tresc).toContain(`rew. ${enm.header.revision}`);
    expect(plik.tresc).toContain(enm.header.hash_sha256.slice(0, 8));
    // Liczba stacji fixtury (53) — wartość z modelu, nie stała w tabliczce.
    expect(plik.tresc).toContain('>53<');
  });

  it('PDF niesie te same dane tabliczki (jedna implementacja metryki dla obu formatów)', () => {
    const plik = eksportuj('pdf', 1, 'dark_scada');

    expect(plik.tresc).toContain('SCHEMAT JEDNOKRESKOWY SIECI SN');
    // Polskie znaki nie są transliterowane — „Sieć" ma kod `/Differences`.
    expect(plik.tresc).toContain('Sie\\003');
  });

  it('brak nazwy projektu/przypadku ⇒ PUSTE POLE z etykietą, nigdy wymyślona wartość', () => {
    useAppStateStore.getState().setActiveProject(null, null);
    useSnapshotStore.setState({ snapshot: enm });
    const plik = eksportuj('svg', 1, 'dark_scada');

    expect(plik.tresc).toContain('Projekt:');
    expect(plik.tresc).toContain('data-brak-danej="true"');
    // Zaślepki poprzedniej metryki (v2 `SldTitleBlock.DEFAULTS`) NIE mogą się
    // pojawić — to była fabrykacja danych cudzego projektu.
    expect(plik.tresc).not.toContain('GPZ-A 110/15 kV');
    expect(plik.tresc).not.toContain('ENEA');
    expect(plik.tresc).not.toContain('1:1000');
  });
});
