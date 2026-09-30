/**
 * S9-6 — ODBIÓR karty: „każdy format oferowany w UI zwraca plik z geometrią".
 *
 * Test idzie REALNĄ ŚCIEŻKĄ UŻYTKOWNIKA (montaż `SldCanvasV3Workspace`,
 * rozwinięcie menu, klik pozycji), na REALNEJ fixturze goldenowej
 * `sldSubstrate52s` (53 stacje) — tej samej, na której działa skrypt odbioru
 * `npm run accept:sld-v3`. Sprawdzane są ILOCZYNY CECH, nie pojedynczy
 * przypadek z karty:
 *   {format rysunku: svg, pdf, dxf} × {LOD 0, 1, 2} × {motyw ciemny, jasny}
 *   {format modelu: cgmes} × {LOD 0, 1, 2} × {odpowiedź serwera: plik, odmowa}
 * Motyw dotyczy formatów rysunkowych (SVG/PDF/DXF); dla nich sprawdzamy
 * dodatkowo, że plik jest BAJT-IDENTYCZNY w obu motywach (arkusz dokumentowy
 * nie zależy od tego, w czym pracował projektant).
 *
 * Karta KASACJA-SCL-I-CIM-KLIENT (decyzja K-14/D-41) — test przepisany do
 * obecnego kanonu. INTENCJA ZACHOWANA: każda pozycja menu kończy się plikiem z
 * treścią albo nazwanym komunikatem, nigdy pozornym sukcesem. ZMIANA: model
 * sieci nie jest już serializowany w przeglądarce (SCD i CIM skasowane), więc
 * dla pozycji CGMES dowodem jest to, że klient zapisuje NIEZMIENIONE bajty
 * serwera dla AKTYWNEGO przypadku, nazywa plik wersją modelu podaną przez
 * serwer i przekazuje odmowę serwera słowo w słowo. Formaty rysunku nie
 * dotykają serwera wcale (iloczyn: format × „czy woła sieć"). Treść samego
 * archiwum CGMES sprawdzają testy backendu (`tests/api/test_enm_eksport_cgmes.py`)
 * i e2e na realnym backendzie (`e2e/eksport-cgmes.spec.ts`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useAppStateStore } from '../../../../app-state';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { useThemeModeStore, type ThemeMode } from '../../../../../ui2/theme/themeMode';
import { useNotificationStore } from '../../../../notifications/store';
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

/**
 * Treść Bloba jako tekst UTF-8. Blob z rysunku powstaje w jsdom (bez `text()`,
 * czytany przez `FileReader`), Blob archiwum przychodzi z `Response.blob()`
 * środowiska Node (ma `text()`) — oba zapisałaby przeglądarka.
 */
function trescBloba(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolveTresc, rejectTresc) => {
    const czytnik = new FileReader();
    czytnik.onload = () => resolveTresc(String(czytnik.result));
    czytnik.onerror = () => rejectTresc(czytnik.error);
    czytnik.readAsText(blob);
  });
}

/**
 * Przechwytuje pobranie pliku bez opuszczania jsdom: Blob przekazany do
 * `URL.createObjectURL` (ten, który przeglądarka zapisałaby na dysk) i nazwa
 * z `<a download>` w chwili kliknięcia.
 */
function przechwycPobranie(): { readonly pliki: Promise<ZapisanyPlik>[] } {
  const pliki: Promise<ZapisanyPlik>[] = [];
  let ostatniBlob: Blob | null = null;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
    ostatniBlob = obj as Blob;
    return 'blob:mock';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === 'a') {
      Object.defineProperty(el, 'click', {
        value: () => {
          const blob = ostatniBlob;
          const nazwa = (el as HTMLAnchorElement).download;
          pliki.push(
            (async () => ({ nazwa, tresc: blob ? await trescBloba(blob) : '', mime: blob?.type ?? '' }))(),
          );
        },
      });
    }
    return el;
  });
  return { pliki };
}

/** Bajty, które „serwer" oddaje jako archiwum CGMES — klient ma je zapisać bez zmian. */
const ARCHIWUM_SERWERA = 'PK\u0003\u0004EQ.xml TP.xml refmap.json manifest.json';

interface OdpowiedzSerwera {
  readonly status: number;
  readonly cialo: string;
  readonly naglowki: Readonly<Record<string, string>>;
}

function serwerOddajePlik(rewizja = enm.header.revision, odcisk = enm.header.hash_sha256): OdpowiedzSerwera {
  return {
    status: 200,
    cialo: ARCHIWUM_SERWERA,
    naglowki: { 'content-type': 'application/zip', 'x-model-rewizja': String(rewizja), 'x-model-odcisk': odcisk },
  };
}

/** Podstawia `fetch` odpowiadający tak, jak końcówka eksportu CGMES; zwraca szpiega. */
function podstawSerwer(odpowiedz: OdpowiedzSerwera) {
  const fetchSpy = vi.fn(
    async (_adres: string, _opcje?: RequestInit) =>
      new Response(odpowiedz.cialo, { status: odpowiedz.status, headers: odpowiedz.naglowki }),
  );
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

function rozwinZwinieteNarzedzia(): void {
  const menu = screen.queryByTestId('sld-v3-toolbar-menu-toggle');
  if (menu && screen.queryByTestId('sld-v3-toolbar-menu') === null) fireEvent.click(menu);
}

interface WynikEksportu {
  readonly plik: ZapisanyPlik;
  readonly fetchSpy: ReturnType<typeof podstawSerwer>;
}

async function eksportuj(
  format: SldExportFormat,
  lod: 0 | 1 | 2,
  motyw: ThemeMode,
  serwer: OdpowiedzSerwera = serwerOddajePlik(),
): Promise<WynikEksportu> {
  // Każdy eksport startuje od czystego drzewa i czystych szpiegów — test
  // wołający tę funkcję kilka razy w jednym przypadku (np. porównanie nazw
  // między formatami) nie może zostawiać zamontowanych poprzednich kanw.
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useThemeModeStore.getState().setMode(motyw);
  const { pliki } = przechwycPobranie();
  const fetchSpy = podstawSerwer(serwer);
  render(<SldCanvasV3Workspace width={900} height={700} lodOverride={lod} />);
  rozwinZwinieteNarzedzia();
  fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
  fireEvent.click(screen.getByTestId(`sld-export-format-${format}`));
  await waitFor(() => expect(pliki).toHaveLength(1));
  return { plik: await pliki[0], fetchSpy };
}

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
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
 *  PRZED naprawą S9-6: DXF 176 B (same nagłówki formatu; klientowe SCD 169 B i
 *  CIM 220 B skasowane w karcie KASACJA-SCL-I-CIM-KLIENT) —
 *  próg 2 000 B jest o rząd wielkości wyżej niż każdy z tych pozorów, a o
 *  rząd niżej niż realne pliki fixtury (15 kB…900 kB), więc łapie regresję
 *  „pusty szkielet" bez czułości na wahania treści. */
const PROG_ROZMIARU_B = 2000;

type FormatRysunku = Exclude<SldExportFormat, 'cgmes'>;

/** Znaczniki dowodzące, że plik niesie ELEMENTY SCENY (nie sam szkielet). */
const DOWOD_TRESCI: Readonly<Record<FormatRysunku, (tresc: string) => boolean>> = {
  svg: (t) => t.includes('sld-v3-symbols') && t.includes('sld-sheet-title-block'),
  pdf: (t) => t.startsWith('%PDF-') && t.includes('%%EOF') && (t.match(/ l\n/g)?.length ?? 0) > 100,
  dxf: (t) => t.includes('\nENTITIES\n') && (t.match(/\nLINE\n/g)?.length ?? 0) > 100,
};

const FORMATY_RYSUNKU = SLD_EXPORT_FORMATS.filter((d) => d.source === 'rysunek');

describe('S9-6 odbiór: każdy format rysunku × każdy poziom szczegółu zwraca plik z treścią', () => {
  it('rejestr rozdziela formaty na rysunek (svg, pdf, dxf) i model (cgmes)', () => {
    expect(FORMATY_RYSUNKU.map((d) => d.id)).toEqual(['svg', 'pdf', 'dxf']);
    expect(SLD_EXPORT_FORMATS.filter((d) => d.source === 'model').map((d) => d.id)).toEqual(['cgmes']);
  });

  for (const descriptor of FORMATY_RYSUNKU) {
    for (const lod of [0, 1, 2] as const) {
      it(`format ${descriptor.id} @ LOD ${lod} — plik > ${PROG_ROZMIARU_B} B ze strukturą sceny, bez wołania serwera`, async () => {
        const { plik, fetchSpy } = await eksportuj(descriptor.id, lod, 'dark_scada');

        expect(plik.tresc.length).toBeGreaterThan(PROG_ROZMIARU_B);
        expect(DOWOD_TRESCI[descriptor.id as FormatRysunku](plik.tresc)).toBe(true);
        expect(plik.mime).toContain(descriptor.mime);
        expect(plik.nazwa.endsWith(`.${descriptor.extension}`)).toBe(true);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    }
  }
});

describe('Eksport CGMES: model sieci z serwera dla aktywnego przypadku', () => {
  for (const lod of [0, 1, 2] as const) {
    it(`LOD ${lod} — zapisuje NIEZMIENIONE bajty serwera, jako ZIP, z końcówki aktywnego przypadku`, async () => {
      const { plik, fetchSpy } = await eksportuj('cgmes', lod, 'dark_scada');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/cases/przypadek-1/enm/eksport-cgmes');
      expect(plik.tresc).toBe(ARCHIWUM_SERWERA);
      expect(plik.mime).toBe('application/zip');
      expect(plik.nazwa.endsWith('.cgmes.zip')).toBe(true);
    });
  }

  it('nazwa pliku niesie wersję modelu PODANĄ PRZEZ SERWER, nie wersję migawki przeglądarki', async () => {
    const { plik } = await eksportuj('cgmes', 1, 'dark_scada', serwerOddajePlik(enm.header.revision + 5, 'fedcba9876543210'));

    expect(plik.nazwa).toBe(`schemat-sld_Siec_Wschod_Zwarcie_maksymalne_rew${enm.header.revision + 5}-fedcba98.cgmes.zip`);
  });

  it('odmowa serwera (model niekompletny, 422) kończy się komunikatem serwera słowo w słowo, bez pliku', async () => {
    const odmowa = 'Eksport CGMES wstrzymany — model sieci jest niekompletny: model nie zawiera żadnej szyny';
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const { pliki } = przechwycPobranie();
    podstawSerwer({ status: 422, cialo: JSON.stringify({ detail: odmowa }), naglowki: { 'content-type': 'application/json' } });
    render(<SldCanvasV3Workspace width={900} height={700} lodOverride={1} />);
    rozwinZwinieteNarzedzia();
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    fireEvent.click(screen.getByTestId('sld-export-format-cgmes'));

    await waitFor(() => expect(useNotificationStore.getState().notifications.map((n) => n.message)).toContain(`Eksport schematu: ${odmowa}`));
    expect(pliki).toHaveLength(0);
  });

  it('brak aktywnego przypadku ⇒ nazwany komunikat, zero wołania serwera', async () => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useAppStateStore.getState().setActiveCase(null, null);
    useSnapshotStore.setState({ snapshot: enm });
    const { pliki } = przechwycPobranie();
    const fetchSpy = podstawSerwer(serwerOddajePlik());
    render(<SldCanvasV3Workspace width={900} height={700} lodOverride={1} />);
    rozwinZwinieteNarzedzia();
    fireEvent.click(screen.getByTestId('sld-export-menu-toggle'));
    fireEvent.click(screen.getByTestId('sld-export-format-cgmes'));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications.map((n) => n.message).join('\n')).toMatch(
        /brak aktywnego przypadku obliczeniowego/,
      ),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pliki).toHaveLength(0);
  });
});

describe('S9-6 odbiór: jedna konwencja nazw dla wszystkich formatów', () => {
  it('nazwa niesie projekt, przypadek i wersję modelu — ten sam trzon w każdym formacie', async () => {
    const nazwy: string[] = [];
    for (const d of SLD_EXPORT_FORMATS) nazwy.push((await eksportuj(d.id, 1, 'dark_scada')).plik.nazwa);
    for (const nazwa of nazwy) {
      expect(nazwa).toMatch(/^schemat-sld_Siec_Wschod_Zwarcie_maksymalne_rew\d+-[0-9a-f]+\./);
    }
    // Dokładnie jedna konwencja: wszystkie nazwy różnią się WYŁĄCZNIE
    // rozszerzeniem (przed S9-6 były dwie: `schemat_sld.svg` i `projekt_wariant.dxf`).
    const trzony = new Set(nazwy.map((n) => n.slice(0, n.indexOf('.'))));
    expect(trzony.size).toBe(1);
    // Cztery pełne montaże kanwy 53 stacji w jednym przypadku — limit czasu
    // przypadku podniesiony jawnie (domyślne 5 s mierzy jeden montaż).
  }, 30_000);
});

describe('S9-6 odbiór: arkusz dokumentowy nie zależy od motywu ekranu', () => {
  for (const format of ['svg', 'pdf', 'dxf'] as const) {
    it(`${format} — bajt-identyczny w motywie ciemnym i jasnym`, async () => {
      const ciemny = (await eksportuj(format, 1, 'dark_scada')).plik;
      const jasny = (await eksportuj(format, 1, 'light_technical')).plik;

      expect(jasny.tresc).toBe(ciemny.tresc);
      expect(jasny.nazwa).toBe(ciemny.nazwa);
    });
  }
});

describe('S9-6 odbiór: tabliczka rysunkowa z danymi REALNYMI', () => {
  it('SVG niesie nazwę projektu, przypadku, sieci, wersję modelu i liczbę stacji z modelu', async () => {
    const { plik } = await eksportuj('svg', 1, 'dark_scada');

    expect(plik.tresc).toContain('SCHEMAT JEDNOKRESKOWY SIECI SN');
    expect(plik.tresc).toContain(PROJEKT);
    expect(plik.tresc).toContain(PRZYPADEK);
    expect(plik.tresc).toContain(enm.header.name);
    expect(plik.tresc).toContain(`rew. ${enm.header.revision}`);
    expect(plik.tresc).toContain(enm.header.hash_sha256.slice(0, 8));
    // Liczba stacji fixtury (53) — wartość z modelu, nie stała w tabliczce.
    expect(plik.tresc).toContain('>53<');
  });

  it('PDF niesie te same dane tabliczki (jedna implementacja metryki dla obu formatów)', async () => {
    const { plik } = await eksportuj('pdf', 1, 'dark_scada');

    expect(plik.tresc).toContain('SCHEMAT JEDNOKRESKOWY SIECI SN');
    // Polskie znaki nie są transliterowane — „Sieć" ma kod `/Differences`.
    expect(plik.tresc).toContain('Sie\\003');
  });

  it('brak nazwy projektu/przypadku ⇒ PUSTE POLE z etykietą, nigdy wymyślona wartość', async () => {
    useAppStateStore.getState().setActiveProject(null, null);
    useSnapshotStore.setState({ snapshot: enm });
    const { plik } = await eksportuj('svg', 1, 'dark_scada');

    expect(plik.tresc).toContain('Projekt:');
    expect(plik.tresc).toContain('data-brak-danej="true"');
    // Zaślepki poprzedniej metryki (v2 `SldTitleBlock.DEFAULTS`) NIE mogą się
    // pojawić — to była fabrykacja danych cudzego projektu.
    expect(plik.tresc).not.toContain('GPZ-A 110/15 kV');
    expect(plik.tresc).not.toContain('ENEA');
    expect(plik.tresc).not.toContain('1:1000');
  });
});
