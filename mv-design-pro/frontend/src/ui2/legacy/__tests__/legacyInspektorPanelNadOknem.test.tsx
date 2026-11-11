/**
 * UI-02b JEDEN-INSPEKTOR — ŻYWY prawy inspektor (`LegacyInspektor`) po kliku obiektu
 * na kanwie.
 *
 * Klik obiektu daje selekcję, a synchronizacja selekcji (`useUrlSelectionSync`) otwiera
 * w prawym panelu okno techniczne obiektu (stacja → E-13, odcinek → E-12). Bez tej karty
 * okno ZASTĘPOWAŁO sekcje obiektu z kanwy: pasek działań z rejestru menu, wyniki i formularz
 * układu PV/BESS/FW nie były widoczne w żywej aplikacji (testy kanwy montowały uprząż
 * `InspektorKanwyTestowy` z pominięciem `LegacyInspektor`, więc tego nie widziały). Teraz:
 *  - okno otwarte PRZEZ selekcję stoi POD sekcjami obiektu (pasek, wyniki);
 *  - okno nie dubluje przycisku, który pasek nad nim pokazuje dla tego samego obiektu
 *    (ta sama pozycja rejestru) — każde działanie w inspektorze RAZ;
 *  - okno otwarte JAWNIE (działanie użytkownika) stoi samo, z własnymi przyciskami.
 *
 * Ścieżka natywna: klik w uchwyt trafienia kanwy, klik w przycisk paska.
 * Iloczyn: obiekt {stacja · odcinek} × okno {otwarte przez selekcję · otwarte jawnie}
 * × status wyników {brak · świeże}.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import type { ResultStatus } from '../../../ui/types';
import { useAppStateStore } from '../../../ui/app-state';
import { useSelectionStore } from '../../../ui/selection';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useRawResultOverlayStore } from '../../../ui/sld-overlay/rawResultOverlayStore';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../../../ui/sld/v3/scene/buildScene';
import { SldCanvasV3Workspace } from '../../../ui/sld/v3/canvas/SldCanvasV3Workspace';
import { useKontekstElementuKanwy } from '../../../ui/sld/shared/kontekstElementuKanwy';
import { useUrlSelectionSync } from '../../../ui/navigation/useUrlSelectionSync';
import { renderWithQueryClient } from '../../../test/queryClientTestUtils';
import { LegacyInspektor } from '../LegacyInspektor';

const here = dirname(fileURLToPath(import.meta.url));
const SIEC = (
  JSON.parse(
    readFileSync(
      resolve(here, '..', '..', '..', 'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
      'utf8',
    ),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

/** Odcinki kablowe z WOLNYM końcem (zacisk końcowy bez innych gałęzi i poza szynami stacji)
 *  — tylko dla nich okno odcinka pokazuje „Zakończ stacją SN/nN" (dokończenie odcinka). */
const WOLNE_KONCE: ReadonlySet<string> = (() => {
  const krotnosc = new Map<string, number>();
  for (const b of SIEC.branches ?? []) {
    for (const bus of [b.from_bus_ref, b.to_bus_ref]) krotnosc.set(bus, (krotnosc.get(bus) ?? 0) + 1);
  }
  const szynyStacji = new Set((SIEC.substations ?? []).flatMap((s) => s.bus_refs ?? []));
  return new Set(
    (SIEC.branches ?? [])
      .filter((b) => b.type === 'cable' && krotnosc.get(b.to_bus_ref) === 1 && !szynyStacji.has(b.to_bus_ref))
      .map((b) => b.ref_id),
  );
})();

function uchwytOdcinka(predykat: (ownerRef: string) => boolean) {
  return (scena: SceneV3): string => {
    const i = scena.segments.findIndex(
      (s) => s.meta?.elementKind === 'segment' && Boolean(s.meta.ownerRef) && !s.meta.ownerRef!.includes('#') && predykat(s.meta.ownerRef!),
    );
    expect(i, 'odcinek w scenie').toBeGreaterThanOrEqual(0);
    return scena.segments[i].meta?.testId ?? `sld-v3-segment-${i}`;
  };
}

/** Para: pozycja rejestru w pasku inspektora ↔ przycisk okna technicznego z tą samą operacją. */
interface Para {
  readonly akcja: string;
  readonly przyciskOkna: string;
}

interface Przypadek {
  readonly nazwa: string;
  readonly lod: SceneLod;
  readonly uchwyt: (scena: SceneV3) => string;
  readonly okno: string;
  readonly pary: readonly Para[];
  /** Jawne otwarcie okna z paska (działanie użytkownika). */
  readonly otworzJawnie: string;
  /** Gdzie staje okno otwarte jawnie (tryb z definicji ekranu). */
  readonly oknoJawneW: 'replace_right_panel' | 'expand_workspace';
  /** Przycisk, który okno pokazuje samo, gdy paska nad nim nie ma (a nad oknem z selekcji
   *  chowa, bo pasek ma tę samą pozycję) — dowód, że para jest ćwiczona w obie strony. */
  readonly przyciskOknaJawnego?: string;
}

const PRZYPADKI: readonly Przypadek[] = [
  {
    nazwa: 'stacja',
    lod: 0,
    uchwyt: (scena) => {
      const i = scena.symbols.findIndex((s) => s.meta?.elementKind === 'station' && s.symbolId !== 'gpzCollapsed');
      expect(i, 'stacja w scenie').toBeGreaterThanOrEqual(0);
      return scena.symbols[i].meta?.testId ?? `sld-v3-symbol-${i}`;
    },
    okno: 'station-configurator-surface',
    pary: [
      { akcja: 'continue-trunk', przyciskOkna: 'station-continue-trunk' },
      { akcja: 'start-branch', przyciskOkna: 'station-start-branch' },
    ],
    // „Dodaj źródło PV/BESS/FW z katalogu" otwiera kartę układów stacji (E-13) w prawym
    // panelu jako okno jawne („Otwórz konfigurator stacji" otwiera E-13 w obszarze roboczym).
    otworzJawnie: 'inspektor-akcja-add-source',
    oknoJawneW: 'expand_workspace',
  },
  {
    nazwa: 'odcinek przelotowy',
    lod: 2,
    uchwyt: uchwytOdcinka((ref) => !WOLNE_KONCE.has(ref)),
    okno: 'sn-segment-surface',
    pary: [
      { akcja: 'insert-station', przyciskOkna: 'segment-action-append-station' },
      { akcja: 'insert-zksn', przyciskOkna: 'segment-action-append-zksn' },
      { akcja: 'insert-pole', przyciskOkna: 'segment-action-append-branch-pole' },
    ],
    otworzJawnie: 'inspektor-otworz-konfiguracje',
    oknoJawneW: 'replace_right_panel',
  },
  {
    nazwa: 'odcinek z wolnym końcem',
    lod: 2,
    uchwyt: uchwytOdcinka((ref) => WOLNE_KONCE.has(ref)),
    okno: 'sn-segment-surface',
    pary: [
      { akcja: 'insert-station', przyciskOkna: 'segment-action-append-station' },
      { akcja: 'insert-zksn', przyciskOkna: 'segment-action-append-zksn' },
      { akcja: 'insert-pole', przyciskOkna: 'segment-action-append-branch-pole' },
    ],
    otworzJawnie: 'inspektor-otworz-konfiguracje',
    oknoJawneW: 'replace_right_panel',
    przyciskOknaJawnego: 'segment-action-append-station',
  },
];

const STATUSY: readonly ResultStatus[] = ['NONE', 'FRESH'];

function SynchronizacjaSelekcji(): null {
  useUrlSelectionSync();
  return null;
}

function idPaska(): string[] {
  const pasek = screen.queryByTestId('inspektor-dzialania');
  if (!pasek) return [];
  return Array.from(pasek.querySelectorAll('[data-testid^="inspektor-akcja-"]')).map((el) =>
    el.getAttribute('data-testid')!.slice('inspektor-akcja-'.length),
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
  );
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useAppStateStore.setState({ activeCaseId: 'case-panel-nad-oknem', activeCaseResultStatus: 'NONE' });
});
afterEach(() => {
  cleanup();
  useKontekstElementuKanwy.getState().wyczysc();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useAppStateStore.setState({ activeCaseId: null, activeCaseResultStatus: 'NONE' });
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe.each(PRZYPADKI)('żywy inspektor po kliku: $nazwa', (przypadek) => {
  it.each(STATUSY)('status wyników %s: okno z selekcji pod paskiem, bez dubli; okno jawne samo', async (status) => {
    useSnapshotStore.setState({ snapshot: SIEC });
    act(() => useAppStateStore.setState({ activeCaseResultStatus: status }));
    const { container } = renderWithQueryClient(
      <>
        <SynchronizacjaSelekcji />
        <SldCanvasV3Workspace width={1322} height={696} lodOverride={przypadek.lod === 0 ? undefined : przypadek.lod} />
        <aside data-testid="prawy-inspektor">
          <LegacyInspektor fallback={<p data-testid="inspektor-pusty">pusty</p>} />
        </aside>
      </>,
    );
    const testId = przypadek.uchwyt(buildSceneV3(SIEC, przypadek.lod));
    const uchwyt = container.querySelector(`[data-hit-for="${testId}"]`);
    expect(uchwyt, `uchwyt trafienia ${testId}`).not.toBeNull();

    fireEvent.click(uchwyt!, { detail: 1 });

    // Okno techniczne otworzyła synchronizacja selekcji — sekcje obiektu stoją NAD nim.
    await waitFor(() => expect(screen.getByTestId(przypadek.okno)).toBeInTheDocument());
    const kontener = screen.getByTestId('inspektor-panel-nad-oknem');
    const pasek = screen.getByTestId('inspektor-dzialania');
    expect(kontener.contains(pasek)).toBe(true);
    expect(kontener.contains(screen.getByTestId(przypadek.okno))).toBe(true);
    // Jedno przewijanie (treść inspektora): kontener nie ustala wysokości ani przewijania,
    // więc procentowa wysokość okna (`h-full` korzenia okna) nie ma się do czego odnieść i okno
    // ma naturalną wysokość pod panelem elementu. Pomiar 2026-10-29 (UX-04): kontener
    // `h-full overflow-y-auto` dawał trzy zagnieżdżone przewijania i uciętą ocenę pola. jsdom nie
    // liczy układu — układ mierzy e2e (`jednoPrzewijanieInspektora`), tu przypięty mechanizm.
    expect(screen.getByTestId('workspace-surface-panel').parentElement, 'okno wprost w kontenerze').toBe(kontener);
    expect(kontener.className, 'kontener bez własnej wysokości i przewijania').not.toMatch(
      /(^|\s)(h-\S+|max-h-\S+|min-h-\S+|overflow-\S+|flex|grid)(\s|$)/,
    );
    expect(pasek.compareDocumentPosition(screen.getByTestId(przypadek.okno)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Sekcja „Wyniki" i bramka „Pokaż wyniki" (status wyników) są widoczne także nad oknem.
    expect(kontener.contains(screen.getByTestId('inspektor-wyniki'))).toBe(true);
    const pokazWyniki = screen.queryByTestId('inspektor-akcja-show-results');
    expect(pokazWyniki, 'obiekt ma „Pokaż wyniki"').not.toBeNull();
    expect(pokazWyniki!.getAttribute('aria-disabled') === 'true').toBe(status === 'NONE');

    const ids = idPaska();
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size, 'każda pozycja paska raz').toBe(ids.length);
    for (const para of przypadek.pary) {
      if (ids.includes(para.akcja)) {
        expect(screen.queryAllByTestId(para.przyciskOkna), `${para.akcja}: okno nie dubluje paska`).toHaveLength(0);
      }
    }
    expect(
      przypadek.pary.some((para) => ids.includes(para.akcja)),
      'co najmniej jedna para okno↔pasek jest ćwiczona',
    ).toBe(true);

    // Okno otwarte JAWNIE z paska (działanie użytkownika) nie jest oknem „za selekcją":
    // sekcje obiektu nie stoją nad nim. W prawym panelu stoi samo, z własnymi przyciskami;
    // w obszarze roboczym prawy inspektor wraca do widoku inżynierskiego zaznaczenia.
    fireEvent.click(screen.getByTestId(przypadek.otworzJawnie));
    await waitFor(() => expect(screen.queryByTestId('inspektor-panel-nad-oknem')).toBeNull());
    const jawne = useNetworkBuildStore.getState().activeSurface;
    expect(jawne?.routeState.payload?.source).not.toBe('url_selection');
    expect(jawne?.openMode).toBe(przypadek.oknoJawneW);
    const inspektor = screen.getByTestId('prawy-inspektor');
    if (przypadek.oknoJawneW === 'replace_right_panel') {
      expect(inspektor.querySelector(`[data-testid="${przypadek.okno}"]`)).not.toBeNull();
      expect(screen.queryByTestId('inspektor-dzialania')).toBeNull();
      if (przypadek.przyciskOknaJawnego) {
        expect(screen.getAllByTestId(przypadek.przyciskOknaJawnego)).toHaveLength(1);
      }
    } else {
      expect(inspektor.querySelector(`[data-testid="${przypadek.okno}"]`)).toBeNull();
      expect(inspektor.querySelector('[data-testid="inspector-engineering"]')).not.toBeNull();
    }
  }, 30000);
});
