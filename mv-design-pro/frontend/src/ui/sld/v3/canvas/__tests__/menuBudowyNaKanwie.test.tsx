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

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects, type SceneLod } from '../../scene/buildScene';
import { resultRefForSegment } from '../resultLabels';
import type { DerSourceKind } from '../../compose/sourceKind';
import { planSceneLabels } from '../labelLegibility';
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

const W = 1322;
const H = 696;

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useSnapshotStore.setState({ snapshot: enm });
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
  const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale);
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
    { krok: 'wyprowadzenie ciągu z GPZ', klasa: 'zrodlo', kotwica: 'zrodlo', lod: 2, action: 'continue-trunk', op: 'continue_trunk_segment_sn' },
    { krok: 'odgałęzienie z GPZ', klasa: 'zrodlo', kotwica: 'zrodlo', lod: 2, action: 'start-branch', op: 'start_branch_segment_sn' },
    { krok: 'wyprowadzenie ciągu z szyny sekcji', klasa: 'szyna', kotwica: 'szyna', lod: 1, action: 'continue-trunk', op: 'continue_trunk_segment_sn' },
    { krok: 'odgałęzienie z szyny sekcji', klasa: 'szyna', kotwica: 'szyna', lod: 1, action: 'start-branch', op: 'start_branch_segment_sn' },
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

  it('ciąg z GPZ dostaje szynę SN jako punkt wyjścia i znacznik PIERWSZEGO odcinka', async () => {
    const openOperationForm = vi.fn();
    useNetworkBuildStore.setState({ openOperationForm } as never);
    const kanwa = renderKanwe(2);
    const zrodlo = pierwszyZKotwica(kanwa, 'zrodlo', 'zrodlo')!;
    const menu = await prawyKlik(kanwa, zrodlo.testId);
    await userEvent.click(within(menu!).getByTestId('sld-menu-continue-trunk'));

    const [, kontekst] = openOperationForm.mock.calls[0] as [string, Record<string, unknown>];
    // `from_bus_ref` to REALNA szyna SN GPZ (kanał: resolveContinueTrunk…
    // dla `elementType==='Source'`), a nie ref rysunkowy źródła.
    const busRef = String(kontekst.from_bus_ref ?? '');
    expect((enm.buses ?? []).some((b) => b.ref_id === busRef || b.id === busRef)).toBe(true);
    expect(kontekst.is_first_trunk_segment).toBe(true);
  }, 120000);

  it('stacja na kanwie prowadzi ciąg dalej i rozpoczyna odgałęzienie (ogniwo powtarzalne 15×)', async () => {
    const openOperationForm = vi.fn();
    useNetworkBuildStore.setState({ openOperationForm } as never);
    const kanwa = renderKanwe(0);
    const stacja = kanwa.obszary.find((a) => a.klasa === 'stacja' && a.ownerRef?.startsWith('stn/'))!;

    const menu = await prawyKlik(kanwa, stacja.testId);
    expect(pozycjaAktywna(menu!, 'continue-trunk')).toBe(true);
    expect(pozycjaAktywna(menu!, 'start-branch')).toBe(true);
    await userEvent.click(within(menu!).getByTestId('sld-menu-continue-trunk'));
    expect(openOperationForm.mock.calls[0][0]).toBe('continue_trunk_segment_sn');
    expect(openOperationForm.mock.calls[0][1]).toMatchObject({ station_ref: stacja.ownerRef });
  }, 120000);

  /**
   * KRYTERIUM ODBIORU KARTY, zmierzone na sieci referencyjnej: żeby zbudować
   * ciąg o 15 stacjach wyłącznie z kanwy, KAŻDA stacja ciągu musi mieć na
   * rysunku wejście do „kontynuuj ciąg", a KAŻDY odcinek toru — do „zakończ
   * odcinek stacją". Mierzymy pokrycie na całej scenie, nie na jednym
   * przykładzie (reguła KLASA pkt 2).
   */
  it('pokrycie łańcucha na sieci referencyjnej: ≥ 15 stacji i ≥ 15 odcinków z realnym wejściem budowy', async () => {
    const kanwa = renderKanwe(0);
    const stacjeZWejsciem = kanwa.obszary.filter((a) => {
      if (a.klasa !== 'stacja') return false;
      const wynik = resolveCanvasMenuSubject(wejscieTematu(kanwa, a), indexModelu);
      return wynik.stan === 'temat' && wynik.temat.menuKind === 'station';
    });
    const odcinkiZWejsciem = kanwa.obszary.filter((a) => {
      if (a.klasa !== 'tor' && a.klasa !== 'lacznik-wiersza') return false;
      const wynik = resolveCanvasMenuSubject(wejscieTematu(kanwa, a), indexModelu);
      return wynik.stan === 'temat' && wynik.temat.kotwica === 'galaz';
    });
    expect(stacjeZWejsciem.length).toBeGreaterThanOrEqual(15);
    expect(odcinkiZWejsciem.length).toBeGreaterThanOrEqual(15);

    // Dowód, że pokrycie nie jest deklaracją: pierwsze 15 stacji faktycznie
    // otwiera menu z aktywnymi pozycjami budowy przy natywnym prawym kliku.
    for (const stacja of stacjeZWejsciem.slice(0, 15)) {
      const menu = await prawyKlik(kanwa, stacja.testId);
      expect(menu, `stacja ${stacja.ownerRef} otwiera menu`).toBeTruthy();
      expect(pozycjaAktywna(menu!, 'continue-trunk')).toBe(true);
      expect(pozycjaAktywna(menu!, 'start-branch')).toBe(true);
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
      const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), 1);
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
