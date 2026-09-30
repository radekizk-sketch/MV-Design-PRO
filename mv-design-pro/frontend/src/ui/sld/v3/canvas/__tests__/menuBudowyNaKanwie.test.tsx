/**
 * KARTA S9-5 — MENU KONTEKSTOWE I OPERACJE BUDOWY NA KANWIE
 * (audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §3.3 P-7 oraz §5 B-4).
 *
 * Wszystkie kliki idą ŚCIEŻKĄ NATYWNĄ (`userEvent`, pełna sekwencja
 * pointerdown → mousedown → contextmenu → pointerup) na węźle warstwy trafień
 * (`sld-v3-trafienia`, karta S9-4) — czyli na tym, w co w przeglądarce
 * naprawdę trafia przycisk myszy. Zero-Debt pkt 5: syntetyczny `dispatchEvent`
 * na wewnętrznym handlerze zamaskowałby dokładnie tę klasę defektu, którą
 * karta S9-4 znalazła przy lewym kliku (capture-on-pointerdown).
 *
 * Ten plik odpowiada na trzy pytania odbioru:
 *  A. INWENTARZ — co pokazuje menu dla KAŻDEJ klasy obiektu kanwy (iloczyn
 *     {klasa} × {LOD}), łącznie z obiektami świadomie bez menu;
 *  B. ŁAŃCUCH BUDOWY — czy z samej kanwy da się przejść pełny cykl
 *     GPZ → ciąg → stacja na odcinku → kolejny ciąg / odgałęzienie, z REALNYM
 *     refem modelu w każdej operacji (kryterium „15 stacji wyłącznie z kanwy");
 *  C. ZERO FABRYKACJI — czy menu operacji domenowych NIE pojawia się na
 *     obiektach, które nie mają odpowiednika w modelu.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel, LogicalViewsV1 } from '../../../../../types/enm';
import {
  buildSldOperationContext,
  resolveBranchStartAvailability,
  resolveGpzTrunkStartFieldRef,
  resolveTrunkStartAvailability,
} from '../../../shared/sldActionExecutor';
import { getMenuActions } from '../../../v2/command/SldCommandService';
import { buildSceneV3, sceneObstacleRects, type SceneLod } from '../../scene/buildScene';
import { resultRefForSegment } from '../resultLabels';
import type { DerSourceKind } from '../../compose/sourceKind';
import { planSceneLabels } from '../labelLegibility';
import { sheetSizeFor } from '../../sheet/outline';
import { HIT_ATTR, buildCanvasHitAreas, type CanvasHitArea, type HitObjectClass } from '../hitAreas';
import {
  buildCanvasModelIndex,
  resolveCanvasMenuSubject,
  type CanvasMenuSubject,
  type MenuAnchorKind,
} from '../canvasMenuSubject';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useNetworkBuildStore } from '../../../../network-build/networkBuildStore';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

/**
 * Karta POLE-ZAJĘTE: zajętość pól liniowych front czyta WYŁĄCZNIE z modelu odczytu backendu
 * (`logical_views.line_fields`). Widoki logiczne fikstur ENM liczy generator backendu
 * (`scripts/eksport_fixtur_harnessu.py`, ta sama funkcja co odpowiedź operacji).
 */
const generated = resolve(here, '..', '..', '..', '..', '..', 'harness-fixtures', 'generated');
function wczytajWidoki(nazwa: string): LogicalViewsV1 {
  return JSON.parse(readFileSync(resolve(generated, `${nazwa}.json`), 'utf8')) as LogicalViewsV1;
}
interface ScenaPunktuStartu {
  readonly pola_liniowe_elementu: string[];
  readonly snapshot: EnergyNetworkModel;
  readonly logical_views: LogicalViewsV1;
}
function wczytajScene(nazwa: string): ScenaPunktuStartu {
  return JSON.parse(readFileSync(resolve(generated, `${nazwa}.json`), 'utf8')) as ScenaPunktuStartu;
}
const widokiEnm = wczytajWidoki('widoki_logiczne_sld_substrate_52s');
const widokiGpzSwiezy = wczytajWidoki('widoki_logiczne_s95_gpz_swiezy');

const W = 1322;
const H = 696;

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useSnapshotStore.setState({ snapshot: enm, logicalViews: widokiEnm });
});

afterEach(() => {
  cleanup();
  useRawResultOverlayStore.getState().clear();
});

// ---------------------------------------------------------------------------
// Narzędzia pomiarowe (wspólne dla A/B/C)
// ---------------------------------------------------------------------------

interface Kanwa {
  readonly container: HTMLElement;
  readonly obszary: readonly CanvasHitArea[];
  /** Kanoniczny `Bus.ref_id` szyn GPZ — TEN SAM kanał, którym karmi rozstrzyganie
   *  tematu żywy `SldCanvasV3` (`klikMeta.busRef = resultRefForSegment(meta)`). */
  readonly busRefy: ReadonlyMap<string, string | undefined>;
  readonly derKindy: ReadonlyMap<string, DerSourceKind | undefined>;
}

function renderKanwe(lod: SceneLod): Kanwa {
  const { container } = render(<SldCanvasV3Workspace width={W} height={H} lodOverride={lod} />);
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
  const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
  const scale = W / viewBox[2];
  const scene = buildSceneV3(enm, lod);
  const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));
  const obszary = buildCanvasHitAreas({
    symbols: scene.symbols,
    segments: scene.segments,
    labels: plan.drawn,
    resultMarkers: [],
    scale,
  });
  const busRefy = new Map<string, string | undefined>();
  scene.segments.forEach((segment, index) => {
    busRefy.set(segment.meta?.testId ?? `sld-v3-segment-${index}`, resultRefForSegment(segment.meta));
  });
  const derKindy = new Map<string, DerSourceKind | undefined>();
  scene.symbols.forEach((symbol, index) => {
    derKindy.set(symbol.meta?.testId ?? `sld-v3-symbol-${index}`, symbol.meta?.derKind);
  });
  return { container, obszary, busRefy, derKindy };
}

/** Wejście rozstrzygania tematu ZŁOŻONE tak samo jak w żywej kanwie. */
function wejscieTematu(kanwa: Kanwa, area: CanvasHitArea) {
  return {
    klasa: area.klasa,
    ownerRef: area.ownerRef,
    elementKind: area.elementKind,
    derKind: kanwa.derKindy.get(area.testId),
    busRef: kanwa.busRefy.get(area.testId),
  };
}

function uchwyt(kanwa: Kanwa, testId: string): Element {
  const node = kanwa.container.querySelector(
    `[${HIT_ATTR.for}="${CSS.escape(testId)}"][${HIT_ATTR.role}="obrys"]`,
  );
  expect(node, `obiekt ${testId} ma uchwyt trafienia`).toBeTruthy();
  return node!;
}

/** Prawy klik NATYWNY w uchwyt obiektu; `null` = menu się nie otworzyło. */
async function prawyKlik(kanwa: Kanwa, testId: string): Promise<HTMLElement | null> {
  await userEvent.pointer({ keys: '[MouseRight]', target: uchwyt(kanwa, testId) });
  return screen.queryByRole('menu');
}

function pozycjeMenu(menu: HTMLElement): readonly string[] {
  return Array.from(menu.querySelectorAll('[data-testid^="sld-menu-"]')).map((el) =>
    el.getAttribute('data-testid')!.replace('sld-menu-', ''),
  );
}

function pozycjaAktywna(menu: HTMLElement, actionId: string): boolean {
  const el = within(menu).queryByTestId(`sld-menu-${actionId}`);
  return el != null && !(el as HTMLButtonElement).disabled;
}

async function zamknijMenu(): Promise<void> {
  await userEvent.keyboard('{Escape}');
}

const indexModelu = buildCanvasModelIndex(enm);

/** Temat menu obiektu (albo `null`, gdy menu się dla niego nie otwiera). */
function tematObiektu(kanwa: Kanwa, area: CanvasHitArea): CanvasMenuSubject | null {
  const wynik = resolveCanvasMenuSubject(wejscieTematu(kanwa, area), indexModelu);
  return wynik.stan === 'temat' ? wynik.temat : null;
}

/** Pierwszy obiekt danej klasy o zadanej KOTWICY modelu (deterministycznie —
 *  pierwszy w kolejności sceny, bez wybierania „ładniejszego" przykładu). */
function pierwszyZKotwica(
  kanwa: Kanwa,
  klasa: HitObjectClass,
  kotwica: MenuAnchorKind,
  rodzinaGalezi?: string,
): CanvasHitArea | undefined {
  return kanwa.obszary.find((area) => {
    if (area.klasa !== klasa) return false;
    const temat = tematObiektu(kanwa, area);
    if (!temat || temat.kotwica !== kotwica) return false;
    return rodzinaGalezi === undefined || temat.rodzinaGalezi === rodzinaGalezi;
  });
}

// ---------------------------------------------------------------------------
// A. INWENTARZ: klasa obiektu kanwy × kotwica modelu × menu
// ---------------------------------------------------------------------------

/**
 * Oczekiwanie MENU dla KOTWICY modelu (kategoria menu wynika z kotwicy, nie
 * z kreski — nagłówek `canvasMenuSubject.ts`). `rozstrzygajaca` to pozycja,
 * której NIE MA w menu sąsiednich kategorii; inaczej test przechodziłby także
 * przy podmianie kategorii.
 */
const MENU_WG_KOTWICY: Record<string, { readonly naglowek: string; readonly rozstrzygajaca: string }> = {
  stacja: { naglowek: 'Stacja transformatorowa SN/nN', rozstrzygajaca: 'open-station-config' },
  szyna: { naglowek: 'Sekcja rozdzielni SN', rozstrzygajaca: 'add-bay' },
  pole: { naglowek: 'Aparat pola SN', rozstrzygajaca: 'configure-cts-vts' },
  transformator: { naglowek: 'Aparat pola SN', rozstrzygajaca: 'configure-cts-vts' },
  zrodlo: { naglowek: 'Główny Punkt Zasilający', rozstrzygajaca: 'open-source' },
  generator: { naglowek: 'Źródło', rozstrzygajaca: 'show-ncrfg' },
  'galaz/cable': { naglowek: 'Odcinek kabla SN', rozstrzygajaca: 'insert-zksn' },
  'galaz/line_overhead': { naglowek: 'Odcinek linii napowietrznej SN', rozstrzygajaca: 'insert-pole' },
  'galaz/breaker': { naglowek: 'Aparat pola SN', rozstrzygajaca: 'configure-cts-vts' },
  'galaz/switch': { naglowek: 'Aparat pola SN', rozstrzygajaca: 'configure-cts-vts' },
};

/** Klucz oczekiwania dla tematu (gałąź rozstrzyga się dodatkowo rodziną). */
function kluczOczekiwania(temat: CanvasMenuSubject): string {
  return temat.kotwica === 'galaz' ? `galaz/${temat.rodzinaGalezi ?? '—'}` : temat.kotwica;
}

describe('S9-5 A — inwentarz: menu zależy od TRAFIONEGO obiektu', () => {
  /**
   * Obiekty ŚWIADOMIE bez menu — powód MERYTORYCZNY (nie „poza zakresem").
   * Wpis w tej tabeli jest deklaracją; test niżej ją weryfikuje.
   */
  const BEZ_MENU: Record<string, string> = {
    adnotacja:
      'adnotacja graficzna zabezpieczeń nie jest obiektem modelu — nie ma czego zmienić operacją domenową',
    'rysunek-bez-modelu':
      'kreska/znacznik bez odpowiednika w modelu (zejście pola bez gałęzi, słupek terminalny) — operacja domenowa nie miałaby na czym pracować',
  };

  it.each([0, 1, 2] as SceneLod[])(
    'LOD %s: KAŻDA para {klasa obiektu × kotwica modelu} obecna na scenie otwiera menu SWOJEJ kategorii (prawy klik natywny)',
    async (lod) => {
      const kanwa = renderKanwe(lod);
      // Inwentarz par obecnych na tej scenie — liczony z DANYCH, nie z listy
      // wpisanej ręcznie (reguła KLASA pkt 1: inwentarz przed naprawą).
      const pary = new Map<string, CanvasHitArea>();
      for (const area of kanwa.obszary) {
        const temat = tematObiektu(kanwa, area);
        if (!temat) continue;
        const klucz = `${area.klasa}|${kluczOczekiwania(temat)}`;
        if (!pary.has(klucz)) pary.set(klucz, area);
      }
      expect(pary.size, `scena LOD ${lod} ma pary {klasa × kotwica}`).toBeGreaterThan(0);

      for (const [klucz, area] of [...pary.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
        const kluczKotwicy = klucz.split('|')[1];
        const oczekiwane = MENU_WG_KOTWICY[kluczKotwicy];
        expect(oczekiwane, `kotwica ${kluczKotwicy} ma zadeklarowane oczekiwanie menu`).toBeTruthy();
        const menu = await prawyKlik(kanwa, area.testId);
        expect(menu, `prawy klik w ${klucz} otwiera menu`).toBeTruthy();
        expect(menu!.textContent, `nagłówek menu dla ${klucz}`).toContain(oczekiwane.naglowek);
        expect(pozycjeMenu(menu!), `pozycja rozstrzygająca dla ${klucz}`).toContain(oczekiwane.rozstrzygajaca);
        await zamknijMenu();
      }
    },
    300000,
  );

  it('obiekty świadomie bez menu mają powód — i powód jest sprawdzalny', async () => {
    expect(Object.keys(BEZ_MENU).length).toBeGreaterThan(0);
    for (const powod of Object.values(BEZ_MENU)) expect(powod.length).toBeGreaterThan(20);

    const wynikAdnotacji = resolveCanvasMenuSubject(
      { klasa: 'adnotacja', elementKind: 'protectionAnnotation', ownerRef: 'cokolwiek' },
      indexModelu,
    );
    expect(wynikAdnotacji.stan === 'brak' && wynikAdnotacji.kod).toBe('adnotacja');

    const kanwa = renderKanwe(2);
    const rysunkowy = kanwa.obszary.find(
      (a) => a.klasa === 'tor' && tematObiektu(kanwa, a) === null,
    );
    expect(rysunkowy, 'scena zawiera kreski bez odpowiednika w modelu').toBeTruthy();
    expect(await prawyKlik(kanwa, rysunkowy!.testId)).toBeNull();
  }, 180000);

  it('kategoria menu odcinka idzie za RODZINĄ gałęzi: kabel i linia napowietrzna dostają RÓŻNE menu', async () => {
    const kanwa = renderKanwe(2);
    const kabelArea = pierwszyZKotwica(kanwa, 'tor', 'galaz', 'cable');
    const napowietrznaArea = pierwszyZKotwica(kanwa, 'tor', 'galaz', 'line_overhead');
    // Sieć referencyjna niesie OBIE rodziny — inaczej test nie mierzyłby różnicy.
    expect(kabelArea, 'scena ma odcinek kablowy').toBeTruthy();
    expect(napowietrznaArea, 'scena ma odcinek linii napowietrznej').toBeTruthy();

    const kabel = await prawyKlik(kanwa, kabelArea!.testId);
    expect(kabel!.textContent).toContain('Odcinek kabla SN');
    expect(pozycjeMenu(kabel!)).toContain('insert-zksn');
    expect(pozycjeMenu(kabel!)).not.toContain('insert-pole');
    await zamknijMenu();

    const napowietrzna = await prawyKlik(kanwa, napowietrznaArea!.testId);
    expect(napowietrzna!.textContent).toContain('Odcinek linii napowietrznej SN');
    // „Zakończ odcinek słupem rozgałęźnym" (insert_branch_pole_on_segment_sn)
    // była zdolnością BEZ wejścia z kanwy do tej karty.
    expect(pozycjeMenu(napowietrzna!)).toContain('insert-pole');
    expect(pozycjeMenu(napowietrzna!)).not.toContain('insert-zksn');
  }, 180000);

  it('symbol i etykieta TEGO SAMEGO obiektu dają identyczne menu i identyczne blokady', async () => {
    const kanwa = renderKanwe(0);
    const symbol = kanwa.obszary.find((a) => a.klasa === 'stacja' && a.ownerRef?.startsWith('stn/'));
    expect(symbol).toBeTruthy();
    const etykieta = kanwa.obszary.find(
      (a) => a.klasa === 'etykieta' && a.ownerRef?.startsWith(symbol!.ownerRef!),
    );
    expect(etykieta, 'stacja ma na scenie także etykietę-uchwyt').toBeTruthy();

    const zSymbolu = await prawyKlik(kanwa, symbol!.testId);
    const opisSymbolu = Array.from(zSymbolu!.querySelectorAll('[data-testid^="sld-menu-"]')).map(
      (el) => `${el.getAttribute('data-testid')}:${(el as HTMLButtonElement).disabled ? 'blokada' : 'aktywna'}`,
    );
    await zamknijMenu();

    const zEtykiety = await prawyKlik(kanwa, etykieta!.testId);
    const opisEtykiety = Array.from(zEtykiety!.querySelectorAll('[data-testid^="sld-menu-"]')).map(
      (el) => `${el.getAttribute('data-testid')}:${(el as HTMLButtonElement).disabled ? 'blokada' : 'aktywna'}`,
    );
    // Przed kartą S9-5 etykieta stacji NIE dostawała blokady „Dodaj agregat nN"
    // (jej `ownerRef` z sufiksem `#name-row-0` nie rozwiązywał się do stacji),
    // więc ten sam obiekt miał dwa różne menu zależnie od miejsca kliku.
    expect(opisEtykiety).toEqual(opisSymbolu);
  }, 180000);
});

// ---------------------------------------------------------------------------
// B. ŁAŃCUCH BUDOWY (kryterium odbioru: sieć 15 stacji wyłącznie z kanwy)
// ---------------------------------------------------------------------------

describe('S9-5 B — operacje budowy ciągu SN dostępne z rysunku', () => {
  /**
   * Ogniwa łańcucha: obiekt kanwy → pozycja menu → operacja domenowa.
   * Zamknięta lista — brak któregokolwiek ogniwa przerywa budowę z kanwy.
   */
  const LANCUCH: readonly {
    readonly krok: string;
    readonly klasa: HitObjectClass;
    readonly kotwica: MenuAnchorKind;
    readonly rodzina?: string;
    readonly lod: SceneLod;
    readonly action: string;
    readonly op: string;
  }[] = [
    // S9-10: kroki „odgałęzienie z GPZ / z szyny sekcji" USUNIĘTE z tej listy
    // — na sieci referencyjnej NIE MA wolnego pola odgałęźnego (FEEDER z
    // wolnym zaciskiem), więc kreator otwierał się BEZ punktu startu z trwale
    // zablokowanym zapisem (zmierzone: `resolveBranchStartOperationContext.
    // fromRef` pusty dla KAŻDEJ kotwicy fixtur). Pozycja jest teraz uczciwie
    // ZABLOKOWANA (test niżej i describe S9-10), a wariant Z wolnym polem
    // pokrywa test pozytywny S9-10 (wstrzyknięte pole FEEDER).
    { krok: 'stacja na odcinku kablowym', klasa: 'tor', kotwica: 'galaz', rodzina: 'cable', lod: 2, action: 'insert-station', op: 'insert_station_on_segment_sn' },
    { krok: 'stacja na odcinku napowietrznym', klasa: 'tor', kotwica: 'galaz', rodzina: 'line_overhead', lod: 2, action: 'insert-station', op: 'insert_station_on_segment_sn' },
    { krok: 'słup rozgałęźny na odcinku napowietrznym', klasa: 'tor', kotwica: 'galaz', rodzina: 'line_overhead', lod: 2, action: 'insert-pole', op: 'insert_branch_pole_on_segment_sn' },
    { krok: 'dociągnięcie odcinka magistrali', klasa: 'tor', kotwica: 'galaz', rodzina: 'cable', lod: 2, action: 'continue-trunk-from-endpoint', op: 'continue_trunk_segment_sn' },
    { krok: 'łącznik wiersza arkusza = ten sam odcinek', klasa: 'lacznik-wiersza', kotwica: 'galaz', lod: 0, action: 'insert-station', op: 'insert_station_on_segment_sn' },
  ];

  it.each(LANCUCH)(
    'krok „$krok": prawy klik w $klasa → „$action" otwiera operację $op z REALNYM refem modelu',
    async ({ klasa, kotwica, rodzina, lod, action, op }) => {
      const openOperationForm = vi.fn();
      useNetworkBuildStore.setState({ openOperationForm } as never);
      const kanwa = renderKanwe(lod);
      const area = pierwszyZKotwica(kanwa, klasa, kotwica, rodzina);
      expect(area, `scena zawiera obiekt klasy ${klasa} o kotwicy ${kotwica}${rodzina ? `/${rodzina}` : ''}`).toBeTruthy();

      const menu = await prawyKlik(kanwa, area!.testId);
      expect(menu, `prawy klik w ${klasa} otwiera menu`).toBeTruthy();
      expect(pozycjaAktywna(menu!, action), `pozycja „${action}" jest AKTYWNA (nie martwa)`).toBe(true);

      await userEvent.click(within(menu!).getByTestId(`sld-menu-${action}`));

      expect(openOperationForm).toHaveBeenCalledTimes(1);
      const [wywolanaOp, kontekst] = openOperationForm.mock.calls[0] as [string, Record<string, unknown>];
      expect(wywolanaOp).toBe(op);
      // Zero fabrykacji: ref jadący do operacji MUSI istnieć w modelu.
      const elementRef = String(kontekst.element_ref ?? '');
      const wynik = resolveCanvasMenuSubject(wejscieTematu(kanwa, area!), indexModelu);
      expect(wynik.stan === 'temat' && wynik.temat.modelRef).toBe(elementRef);
    },
    120000,
  );

  /**
   * Sieć referencyjna ma WSZYSTKIE pola liniowe GPZ zajęte (z każdego wyszedł
   * już ciąg). Pozycja „Wyprowadź ciąg główny SN" musi być wtedy ZABLOKOWANA
   * z powodem, a nie otwierać kreator, którego nie da się zapisać
   * (`maStartCiagu` wymaga punktu startu). Uczciwa odmowa jest tu ZACHOWANIEM
   * DOCELOWYM — stan „wolne pole istnieje" pokrywa sekcja D.
   */
  it.each([
    ['symbol GPZ', 'zrodlo' as HitObjectClass, 'zrodlo' as MenuAnchorKind, 2 as SceneLod],
    ['szyna sekcji', 'szyna' as HitObjectClass, 'szyna' as MenuAnchorKind, 1 as SceneLod],
  ])(
    '%s na sieci z ZAJĘTYMI polami liniowymi: „Wyprowadź ciąg główny SN" jest zablokowany z powodem (nie martwy klik)',
    async (_nazwa, klasa, kotwica, lod) => {
      const kanwa = renderKanwe(lod);
      const area = pierwszyZKotwica(kanwa, klasa, kotwica)!;
      const menu = await prawyKlik(kanwa, area.testId);
      expect(menu).toBeTruthy();
      const pozycja = within(menu!).getByTestId('sld-menu-continue-trunk') as HTMLButtonElement;
      expect(pozycja.disabled, 'pozycja bez punktu startu MUSI być zablokowana').toBe(true);
      expect(pozycja.title ?? '').toContain('wolnego pola liniowego');
      // S9-10 (ta sama klasa, druga pozycja budowy): „Rozpocznij odgałęzienie"
      // też nie ma tu punktu startu (brak pola FEEDER z wolnym zaciskiem) —
      // MUSI być zablokowane, nie otwierać martwego kreatora.
      const odgalezienie = within(menu!).getByTestId('sld-menu-start-branch') as HTMLButtonElement;
      expect(odgalezienie.disabled, 'odgałęzienie bez punktu startu MUSI być zablokowane').toBe(true);
      expect(odgalezienie.title ?? '').toContain('pola odgałęźnego');
      await zamknijMenu();
    },
    180000,
  );

  /**
   * PRZEPISANE DO KANONU POLE-ZAJĘTE (karta KASACJA-SCL-I-CIM-KLIENT napotkała czerwień
   * bazy i naprawiła ją u źródła — test, nie produkt). Po partii integracji 6 fikstura
   * sieci referencyjnej jest przegenerowana narzędziami repo i jej model odczytu backendu
   * (`widoki_logiczne_sld_substrate_52s.line_fields`) meldował KAŻDE pole OUT/FEEDER stacji
   * jako ZAJĘTE (53 × OUT: 33 odcinki do kolejnej stacji, 20 do końca ciągu; zmierzone).
   * Kanon POLE-ZAJĘTE: drugi kabel z zajętego pola jest odmową, więc „Kontynuuj ciąg" ze
   * stacji tej sieci MUSI być zablokowane z powodem — dawna asercja „aktywne" wymagała
   * martwego kreatora. INTENCJA ZACHOWANA: (1) pozycja obecna i SPAROWANA z tym samym
   * rozstrzygnięciem, które zasila kreator; (2) stacja Z wolnym polem liniowym (scena z
   * generatora backendu, nie wstrzyknięcie) prowadzi ciąg dalej natywnym klikiem i kreator
   * dostaje TO pole jako punkt startu.
   */
  it('stacja na kanwie prowadzi ciąg dalej: zajęte pola ⇒ blokada z powodem, wolne pole ⇒ operacja z tym polem', async () => {
    const kanwa = renderKanwe(0);
    const stacja = kanwa.obszary.find((a) => a.klasa === 'stacja' && a.ownerRef?.startsWith('stn/'))!;
    const menu = await prawyKlik(kanwa, stacja.testId);
    const kontynuuj = within(menu!).getByTestId('sld-menu-continue-trunk') as HTMLButtonElement;
    const tematStacji = tematObiektu(kanwa, stacja)!;
    expect(pozycjaAktywna(menu!, 'continue-trunk')).toBe(
      resolveTrunkStartAvailability(enm, widokiEnm, 'station', tematStacji.modelRef)?.['continue-trunk'] === true,
    );
    expect(kontynuuj.disabled, 'wszystkie pola liniowe stacji zajęte — brak punktu startu').toBe(true);
    expect(kontynuuj.title ?? '').toContain('wolnego pola liniowego');
    expect(within(menu!).queryByTestId('sld-menu-start-branch')).toBeTruthy();
    expect(pozycjaAktywna(menu!, 'start-branch')).toBe(
      resolveBranchStartAvailability(enm, widokiEnm, 'station', stacja.ownerRef ?? null),
    );
    await zamknijMenu();
    cleanup();

    const scena = wczytajScene('punkt_startu_stacja_na_odcinku_wolne_jedno');
    const stacjaZPolem = (scena.snapshot.substations ?? []).find(
      (st) => String(st.station_type).toLowerCase() !== 'gpz',
    )!;
    const wolnePole = (scena.logical_views.line_fields ?? []).find(
      (w) => w.station_ref === stacjaZPolem.ref_id && !w.occupied && ['OUT', 'FEEDER'].includes(w.bay_role),
    )!;
    const openOperationForm = vi.fn();
    useNetworkBuildStore.setState({ openOperationForm } as never);
    useSnapshotStore.setState({ snapshot: scena.snapshot, logicalViews: scena.logical_views });
    const { container } = render(<SldCanvasV3Workspace width={W} height={H} lodOverride={2} />);
    const etykieta = container.querySelector(
      `[${HIT_ATTR.role}="obrys"][${HIT_ATTR.ownerRef}^="${CSS.escape(stacjaZPolem.ref_id)}#name-row"]`,
    );
    expect(etykieta, `etykieta stacji ${stacjaZPolem.ref_id} ma uchwyt`).toBeTruthy();
    await userEvent.pointer({ keys: '[MouseRight]', target: etykieta! });
    const menuZPolem = screen.queryByRole('menu');
    expect(menuZPolem, 'menu stacji otwarte').toBeTruthy();
    expect(pozycjaAktywna(menuZPolem!, 'continue-trunk'), 'wolne pole liniowe ⇒ pozycja aktywna').toBe(true);
    await userEvent.click(within(menuZPolem!).getByTestId('sld-menu-continue-trunk'));
    expect(openOperationForm).toHaveBeenCalledTimes(1);
    expect(openOperationForm.mock.calls[0][0]).toBe('continue_trunk_segment_sn');
    expect(openOperationForm.mock.calls[0][1]).toMatchObject({
      station_ref: stacjaZPolem.ref_id,
      field_ref: wolnePole.field_ref,
    });
  }, 120000);

  /**
   * KRYTERIUM ODBIORU KARTY S9-5 („sieć 15 stacji wyłącznie z kanwy"), przepisane do
   * kanonu POLE-ZAJĘTE (patrz test wyżej): na sieci referencyjnej, gdzie każde pole
   * liniowe stacji jest zajęte, ciąg rośnie z RYSUNKU przez odcinki — „stacja na
   * odcinku" (wstawienie) i „dociągnięcie odcinka" z końca ciągu. Mierzymy pokrycie na
   * całej scenie (reguła KLASA pkt 2): ≥ 15 odcinków z realnym wejściem budowy, każdy z
   * pierwszych 15 otwiera natywnym prawym klikiem menu z AKTYWNYM „Wstaw stację"; każda
   * stacja SN/nN ma menu, a jej „Kontynuuj ciąg" jest sparowane z rozstrzygnięciem kreatora
   * (tu: zablokowane z powodem — nigdy martwy kreator).
   */
  it('pokrycie łańcucha na sieci referencyjnej: ≥ 15 odcinków z aktywnym wstawieniem stacji, stacje sparowane z kreatorem', async () => {
    const kanwa = renderKanwe(0);
    const stacje = kanwa.obszary.filter((a) => {
      if (a.klasa !== 'stacja' || !a.ownerRef?.startsWith('stn/')) return false;
      const wynik = resolveCanvasMenuSubject(wejscieTematu(kanwa, a), indexModelu);
      return wynik.stan === 'temat' && wynik.temat.menuKind === 'station';
    });
    const odcinkiZWejsciem = kanwa.obszary.filter((a) => {
      if (a.klasa !== 'tor' && a.klasa !== 'lacznik-wiersza') return false;
      const wynik = resolveCanvasMenuSubject(wejscieTematu(kanwa, a), indexModelu);
      return wynik.stan === 'temat' && wynik.temat.kotwica === 'galaz';
    });
    expect(stacje.length).toBeGreaterThanOrEqual(15);
    expect(odcinkiZWejsciem.length).toBeGreaterThanOrEqual(15);

    for (const odcinek of odcinkiZWejsciem.slice(0, 15)) {
      const menu = await prawyKlik(kanwa, odcinek.testId);
      expect(menu, `odcinek ${odcinek.ownerRef} otwiera menu`).toBeTruthy();
      expect(pozycjaAktywna(menu!, 'insert-station'), `odcinek ${odcinek.ownerRef}: wstaw stację`).toBe(true);
      await zamknijMenu();
    }
    for (const stacja of stacje.slice(0, 15)) {
      const menu = await prawyKlik(kanwa, stacja.testId);
      expect(menu, `stacja ${stacja.ownerRef} otwiera menu`).toBeTruthy();
      const temat = tematObiektu(kanwa, stacja)!;
      expect(pozycjaAktywna(menu!, 'continue-trunk'), `stacja ${stacja.ownerRef}: kontynuuj ciąg`).toBe(
        resolveTrunkStartAvailability(enm, widokiEnm, 'station', temat.modelRef)?.['continue-trunk'] === true,
      );
      expect(within(menu!).queryByTestId('sld-menu-start-branch')).toBeTruthy();
      expect(pozycjaAktywna(menu!, 'start-branch')).toBe(
        resolveBranchStartAvailability(enm, widokiEnm, 'station', stacja.ownerRef ?? null),
      );
      await zamknijMenu();
    }
  }, 300000);
});

// ---------------------------------------------------------------------------
// C. ZERO FABRYKACJI
// ---------------------------------------------------------------------------

describe('S9-5 C — menu nie obiecuje operacji na obiektach spoza modelu', () => {
  it('kreska rysunku bez gałęzi w modelu NIE otwiera menu odcinka', async () => {
    const kanwa = renderKanwe(2);
    const rysunkowy = kanwa.obszary.find(
      (a) =>
        a.klasa === 'tor' && resolveCanvasMenuSubject(wejscieTematu(kanwa, a), indexModelu).stan === 'brak',
    );
    expect(rysunkowy, 'scena zawiera kreski bez odpowiednika w modelu (zejścia, znaczniki)').toBeTruthy();
    const menu = await prawyKlik(kanwa, rysunkowy!.testId);
    expect(menu).toBeNull();
  }, 120000);

  it('KAŻDY otwarty temat menu niesie ref ISTNIEJĄCY w modelu (skan całej sceny, wszystkie LOD)', () => {
    const refyModelu = new Set<string>();
    for (const kolekcja of [enm.substations, enm.buses, enm.branches, enm.generators, enm.sources, enm.transformers]) {
      for (const el of kolekcja ?? []) {
        const rekord = el as { ref_id?: string; id?: string };
        if (rekord.ref_id) refyModelu.add(rekord.ref_id);
        if (rekord.id) refyModelu.add(rekord.id);
      }
    }
    for (const stacja of enm.substations ?? []) {
      const meta = stacja.meta as { field_specs?: unknown[] } | undefined;
      for (const spec of meta?.field_specs ?? []) {
        const ref = (spec as { field_ref?: string }).field_ref;
        if (ref) refyModelu.add(ref);
      }
    }

    let tematow = 0;
    for (const lod of [0, 1, 2] as SceneLod[]) {
      const scene = buildSceneV3(enm, lod);
      const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), 1, sheetSizeFor(scene));
      const obszary = buildCanvasHitAreas({
        symbols: scene.symbols,
        segments: scene.segments,
        labels: plan.drawn,
        resultMarkers: [],
        scale: 1,
      });
      for (const area of obszary) {
        const wynik = resolveCanvasMenuSubject(
          { klasa: area.klasa, ownerRef: area.ownerRef, elementKind: area.elementKind },
          indexModelu,
        );
        if (wynik.stan !== 'temat') continue;
        tematow += 1;
        expect(
          refyModelu.has(wynik.temat.modelRef),
          `temat menu obiektu ${area.testId} (${area.klasa}) wskazuje ref spoza modelu: ${wynik.temat.modelRef}`,
        ).toBe(true);
      }
    }
    // Sonda musi mieć co mierzyć — pusty przebieg przechodziłby trywialnie.
    expect(tematow).toBeGreaterThan(1000);
  }, 120000);
});

// ---------------------------------------------------------------------------
// D. SIEC PUSTA: pierwsze ogniwo budowy (audyt B-4 „dalsza budowa nie ma
//    sciezki na kanwie") — mierzone na modelu ze ŚWIEŻO wstawionego GPZ,
//    czyli w stanie, w ktorym projektant naprawde zaczyna.
// ---------------------------------------------------------------------------

describe('S9-5 D — pierwsze ogniwo budowy na świeżo wstawionym GPZ', () => {
  /** Model z REALNEGO backendu: `add_grid_source_sn` i nic wiecej. */
  const gpzSwiezy = (
    JSON.parse(
      readFileSync(resolve(here, 'fixtures', 's95GpzSwiezy.enm.json'), 'utf8'),
    ) as EnergyNetworkModel
  );

  /**
   * Kreator magistrali wymaga PUNKTU STARTU (`maStartCiagu`: `from_terminal_id`
   * albo `field_ref`). Pozycja menu, ktora otwiera kreator BEZ punktu startu,
   * jest obietnica bez pokrycia — zapis jest w niej trwale zablokowany.
   * Ten test pilnuje, ze oba wejscia z kanwy (symbol GPZ i szyna sekcji)
   * wskazuja REALNE, wolne pole liniowe rozdzielni.
   */
  it.each([
    ['symbol GPZ', 'gpz' as const],
    ['szyna sekcji', 'section' as const],
  ])('%s → „Wyprowadź ciąg główny SN" niesie WOLNE POLE LINIOWE jako punkt startu', (_nazwa, kind) => {
    const zrodloRef = (gpzSwiezy.sources ?? [])[0]?.ref_id;
    const szynaSn = (gpzSwiezy.buses ?? []).find((b) => b.voltage_kv > 1 && b.voltage_kv < 110);
    expect(zrodloRef, 'fixtura ma źródło GPZ').toBeTruthy();
    expect(szynaSn, 'fixtura ma szynę SN').toBeTruthy();

    const elementId = kind === 'gpz' ? zrodloRef! : szynaSn!.ref_id;
    const operacja = buildSldOperationContext('continue-trunk', kind, elementId, gpzSwiezy, widokiGpzSwiezy);
    expect(operacja?.op).toBe('continue_trunk_segment_sn');
    expect(resolveGpzTrunkStartFieldRef(gpzSwiezy, (gpzSwiezy.substations ?? [])[0].ref_id, widokiGpzSwiezy)).toBeTruthy();

    // Punkt startu = `field_ref` istniejącego pola liniowego (rola OUT/FEEDER).
    const fieldRef = String(operacja!.context.field_ref ?? '');
    const polaSpec = ((gpzSwiezy.substations ?? [])[0]?.meta as
      { field_specs?: Array<{ field_ref?: string; bay_role?: string }> } | undefined)?.field_specs ?? [];
    const pole = polaSpec.find((spec) => spec.field_ref === fieldRef);
    expect(pole, `pole ${fieldRef} istnieje w modelu`).toBeTruthy();
    expect(['OUT', 'FEEDER']).toContain(String(pole!.bay_role).toUpperCase());
    // Kreator sprawdza dokładnie ten warunek — trzymamy go w teście JAWNIE,
    // żeby regresja resolvera nie przeszła jako „kontekst jakiś jest".
    const maStart = Boolean(
      String(operacja!.context.from_terminal_id ?? '').trim()
      || String(operacja!.context.field_ref ?? '').trim(),
    );
    expect(maStart, 'kreator magistrali ma punkt startu').toBe(true);

    // Predykaty PARAMI (reguła KLASA pkt 3): warunek WEJŚCIA (menu odblokowuje
    // pozycję) i warunek WYJŚCIA (operacja dostaje punkt startu) pochodzą z
    // JEDNEGO źródła — `resolveTrunkStartAvailability` → `buildSldOperationContext`
    // (karta S95-START). Tu sprawdzamy, że oba mówią to samo na tym samym modelu.
    const dostepnosc = resolveTrunkStartAvailability(gpzSwiezy, widokiGpzSwiezy, kind, elementId);
    expect(dostepnosc?.['continue-trunk']).toBe(true);
    const pozycja = getMenuActions(kind, { trunkStartAvailable: dostepnosc })
      .find((akcja) => akcja.id === 'continue-trunk');
    expect(pozycja?.disabled ?? false).toBe(false);
  });

  it('pole liniowe ZAJĘTE nie jest punktem startu — zajętość PER POLE z modelu odczytu backendu', () => {
    // Karta POLE-ZAJĘTE: sceny z generatora backendu (operacje domenowe), zajętość liczy
    // `enm/zajetosc_pol.py` — front czyta `line_fields` i wybiera pierwsze WOLNE pole.
    const wolneJedno = wczytajScene('punkt_startu_gpz_z_zaciskami_wolne_jedno');
    const zajete = wczytajScene('punkt_startu_gpz_z_zaciskami_zajete_wszystkie');
    const gpzRef = (snap: EnergyNetworkModel) =>
      (snap.substations ?? []).find((st) => String(st.station_type) === 'gpz')!.ref_id;
    const ostatniePole = wolneJedno.pola_liniowe_elementu[wolneJedno.pola_liniowe_elementu.length - 1];
    // Zajęte pola tej samej szyny sekcyjnej nie blokują wolnego (per POLE, nie per szyna).
    expect(
      resolveGpzTrunkStartFieldRef(wolneJedno.snapshot, gpzRef(wolneJedno.snapshot), wolneJedno.logical_views),
    ).toBe(ostatniePole);
    expect(
      resolveGpzTrunkStartFieldRef(zajete.snapshot, gpzRef(zajete.snapshot), zajete.logical_views),
    ).toBeNull();
    // Brak modelu odczytu = zajętość NIEZNANA, nigdy „wolne".
    expect(resolveGpzTrunkStartFieldRef(wolneJedno.snapshot, gpzRef(wolneJedno.snapshot), null)).toBeNull();
  });
});

describe('S9-10 — „Rozpocznij odgałęzienie": predykat menu SPAROWANY z resolverem kreatora', () => {
  /**
   * ZNALEZISKO UBOCZNE S9-10 (pomiar na żywej aplikacji + fixturach): pozycja
   * `start-branch` była AKTYWNA na każdej stacji, źródle GPZ i szynie sekcji,
   * a kreator odgałęzienia otwierał się z „Brak wskazania źródła" i trwale
   * zablokowanym zapisem — bo bramka S9-5 (`stationHasFreeBay`) nie miała
   * ŻADNEGO pisarza (warunek martwy), a dostępność i punkt startu liczyły
   * dwa różne predykaty. Po S9-10 OBA pochodzą z JEDNEGO resolvera
   * (`resolveBranchStartAvailability` → `resolveBranchStartOperationContext`).
   *
   * Iloczyn cech: {kotwica: stacja, źródło GPZ, szyna sekcji} × {dostępność:
   * brak pola (zmierzone na fixturach) / wolne pole FEEDER (wstrzyknięte)}.
   */
  const gpzSwiezy = (
    JSON.parse(
      readFileSync(resolve(here, 'fixtures', 's95GpzSwiezy.enm.json'), 'utf8'),
    ) as EnergyNetworkModel
  );

  it('parowanie na DANYCH: stacje sieci referencyjnej i świeży GPZ nie mają punktu startu → dostępność false', () => {
    for (const stacja of (enm.substations ?? []).filter((s) => String(s.station_type).toLowerCase() !== 'gpz')) {
      expect(
        resolveBranchStartAvailability(enm, widokiEnm, 'station', stacja.ref_id),
        `stacja ${stacja.ref_id}`,
      ).toBe(false);
    }
    const zrodloRef = (gpzSwiezy.sources ?? [])[0]?.ref_id;
    const szynaSn = (gpzSwiezy.buses ?? []).find((b) => b.voltage_kv > 1 && b.voltage_kv < 110);
    expect(resolveBranchStartAvailability(gpzSwiezy, widokiGpzSwiezy, 'gpz', zrodloRef ?? null)).toBe(false);
    expect(resolveBranchStartAvailability(gpzSwiezy, widokiGpzSwiezy, 'section', szynaSn?.ref_id ?? null)).toBe(false);
  });

  /** Stacja wstawiona na odcinek operacjami domenowymi z wolnym polem odgałęźnym (rola
   *  FEEDER, własny zacisk) — scena z generatora backendu. Karta POLE-ZAJĘTE: zajętość pola
   *  front czyta z `line_fields` tej samej odpowiedzi, więc wstrzykiwanie pola do migawki bez
   *  modelu odczytu nie jest już realnym stanem. */
  function zWolnymPolemOdgaleznym(): {
    enm: EnergyNetworkModel;
    widoki: LogicalViewsV1;
    stationRef: string;
    fieldRef: string;
  } {
    const scena = wczytajScene('punkt_startu_stacja_na_odcinku_wolne_kilka');
    const stacja = (scena.snapshot.substations ?? []).find(
      (st) => String(st.station_type).toLowerCase() !== 'gpz',
    )!;
    const fieldRef = (scena.logical_views.line_fields ?? []).find(
      (wiersz) => wiersz.station_ref === stacja.ref_id && wiersz.bay_role === 'FEEDER',
    )!.field_ref;
    return { enm: scena.snapshot, widoki: scena.logical_views, stationRef: stacja.ref_id, fieldRef };
  }

  it('parowanie POZYTYWNE: wolne pole FEEDER ⇒ dostępność true ORAZ kreator dostaje from_ref TEGO pola', () => {
    const { enm: zPolem, widoki, stationRef, fieldRef } = zWolnymPolemOdgaleznym();
    expect(resolveBranchStartAvailability(zPolem, widoki, 'station', stationRef)).toBe(true);
    // Predykaty PARAMI na JEDNYM modelu: to samo rozstrzygnięcie zasila
    // formularz — `from_ref` operacji wskazuje wstrzyknięte pole.
    const operacja = buildSldOperationContext('start-branch', 'station', stationRef, zPolem, widoki);
    expect(operacja?.op).toBe('start_branch_segment_sn');
    expect(String(operacja?.context.from_ref ?? '')).toBe(`${fieldRef}.BRANCH`); // ui-terminology-ignore
  });

  it('NATYWNY prawy klik w etykietę stacji BEZ wolnego pola: pozycja ZABLOKOWANA z powodem', async () => {
    const kanwa = renderKanwe(2);
    const etykietaStacji = kanwa.container.querySelector(
      `[${HIT_ATTR.role}="obrys"][${HIT_ATTR.ownerRef}*="#name-row"][${HIT_ATTR.klasa}="etykieta"]`,
    );
    expect(etykietaStacji, 'kanwa ma etykietę nazwy stacji').toBeTruthy();
    await userEvent.pointer({ keys: '[MouseRight]', target: etykietaStacji! });
    const menu = screen.queryByRole('menu');
    expect(menu, 'menu stacji otwarte').toBeTruthy();
    const pozycja = within(menu!).queryByTestId('sld-menu-start-branch') as HTMLButtonElement | null;
    expect(pozycja, 'pozycja start-branch obecna').toBeTruthy();
    expect(pozycja!.disabled, 'pozycja zablokowana (kreator nie miałby punktu startu)').toBe(true);
    await zamknijMenu();
  });

  it('NATYWNY prawy klik w etykietę stacji Z wolnym polem FEEDER: pozycja AKTYWNA', async () => {
    const { enm: zPolem, widoki, stationRef } = zWolnymPolemOdgaleznym();
    useSnapshotStore.setState({ snapshot: zPolem, logicalViews: widoki });
    const { container } = render(<SldCanvasV3Workspace width={W} height={H} lodOverride={2} />);
    const etykieta = container.querySelector(
      `[${HIT_ATTR.role}="obrys"][${HIT_ATTR.ownerRef}^="${CSS.escape(stationRef)}#name-row"]`,
    );
    expect(etykieta, `etykieta stacji ${stationRef} ma uchwyt`).toBeTruthy();
    await userEvent.pointer({ keys: '[MouseRight]', target: etykieta! });
    const menu = screen.queryByRole('menu');
    expect(menu, 'menu stacji otwarte').toBeTruthy();
    const pozycja = within(menu!).queryByTestId('sld-menu-start-branch') as HTMLButtonElement | null;
    expect(pozycja, 'pozycja start-branch obecna').toBeTruthy();
    expect(pozycja!.disabled, 'pozycja aktywna — kreator dostanie punkt startu').toBe(false);
    await zamknijMenu();
  });
});
