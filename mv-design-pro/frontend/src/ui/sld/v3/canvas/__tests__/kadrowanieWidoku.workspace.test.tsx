/**
 * K2 (UI-04, §0.2–0.7) — KADROWANIE w zamontowanym warsztacie schematu.
 *
 * Ścieżka NATYWNA (Zero-Debt §5): dwuklik i klik w REALNE obszary trafienia
 * (`data-hit-for`), klik w przyciski doku, klawisze na `window` — kamera jest
 * stanem wewnętrznym kanwy, więc kontrakt mierzy `viewBox` i `data-scene-lod`.
 *
 * ILOCZYN CECH:
 *  - wejście polecenia: dwuklik stacji · „Dopasuj widok" · menu „Dopasuj do…" ·
 *    klawisze F / Shift+F / Alt+← · poziom mini-ścieżki · poprzednia/następna
 *    stacja · wskazanie ze sklepu (przed i po montażu) · „Cały arkusz";
 *  - zaznaczenie: brak · jedno pole · element nienarysowany;
 *  - tor zasilania: drogi pewne i warunkowe · brak drogi · błąd HTTP · brak przypadku;
 *  - historia: kadr → „Wstecz" przywraca DOKŁADNIE poprzedni viewBox i ścieżkę;
 *  - klik obiektu (UI-02b): kanwa nie dostaje zasłony prawego pasa — przy kadrze
 *    (kadr bez zmian) × bez kadru (obiekt w pasie dawnej szuflady, widok bez zmian);
 *    szczegóły i działania obiektu są w inspektorze powłoki, POZA kanwą;
 *  - gest wielokliku: drugi klik w inny uchwyt · tło · węzeł nie-uchwyt · poza kanwą;
 *  - klawisze w polu edycji — ignorowane.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { TorElementuOdpowiedz } from '../../../../../ui2/adapters/topologiaZasilenia';
import { useAppStateStore } from '../../../../app-state';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { useSelectionStore } from '../../../../selection';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../../scene/buildScene';
import { InspektorKanwyTestowy } from '../../../../network-build/inspektor-elementu/__tests__/inspektorKanwyTestowy';
import { sceneBoxToCameraWorld } from '../SldCanvasV3';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { opisToru } from '../useKadrowanieWidoku';
import { hiddenLabelsHintTextPozaCelem } from '../chromeLayout';
import { prostokatRefowWScenie } from '../viewAnchor';
import { prostokatyZakresu, zakresCelu } from '../zakresKadru';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
  ) as { enm: EnergyNetworkModel }
).enm;
const sceny = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) } as const;
const porzadek = sceny[2].meta.stationTraversalOrder;
const nazwa = (ref: string) => enm.substations.find((s) => s.ref_id === ref)?.name ?? ref;

/** Stacja ciągu głównego z polami SN (trzecia w porządku magistrali). */
const STACJA = sceny[2].meta.mainTrunkStationIds[2];
const POLE = enm.bays.find((b) => b.substation_ref === STACJA && b.ref_id.includes('/sn_field/'))!;

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useSnapshotStore.setState({ snapshot: enm });
  useAppStateStore.setState({ activeCaseId: 'case-k2' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useRawResultOverlayStore.getState().clear();
  useSelectionStore.getState().clearSelection();
  useAppStateStore.setState({ activeCaseId: null });
});

const kanwa = (c: HTMLElement) => c.querySelector('[data-testid="sld-canvas-v3"]')!;
const viewBox = (c: HTMLElement) => kanwa(c).getAttribute('viewBox');
const poziom = (c: HTMLElement) => Number(kanwa(c).getAttribute('data-scene-lod')) as SceneLod;
const etykietySciezki = () =>
  within(screen.getByTestId('sld-v3-sciezka-kadru'))
    .getAllByTestId(/^sld-v3-sciezka-\d+$/)
    .map((el) => el.textContent);

function uchwyt(container: HTMLElement, scene: SceneV3, predykat: (s: SceneV3['symbols'][number]) => boolean): Element {
  const index = scene.symbols.findIndex(predykat);
  expect(index).toBeGreaterThanOrEqual(0);
  const testId = scene.symbols[index].meta?.testId ?? `sld-v3-symbol-${index}`;
  const el = container.querySelector(`[data-hit-for="${testId}"][data-hit-role="obrys"]`);
  if (!el) throw new Error(`brak obszaru trafienia dla ${testId}`);
  return el;
}

function dwuklikStacji(container: HTMLElement, ref: string): void {
  const lod = poziom(container);
  fireEvent.doubleClick(
    uchwyt(container, sceny[lod], (s) => s.meta?.elementKind === 'station' && s.meta?.ownerRef === ref),
  );
}

function otworzMenu(): HTMLElement {
  fireEvent.click(screen.getByTestId('sld-v3-dopasuj-do-toggle'));
  return screen.getByTestId('sld-v3-dopasuj-do-menu');
}

describe('dwuklik stacji, mini-ścieżka, historia kadrów', () => {
  it('dwuklik w stację (L0) → kadr stacji na L ≥ 1 i ścieżka „Sieć › stacja"; „Wstecz" i Alt+← przywracają kadr', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    expect(poziom(container)).toBe(0);
    const kadrSieci = viewBox(container);
    expect(screen.getByTestId('sld-v3-poprzedni-widok')).toBeDisabled();

    dwuklikStacji(container, STACJA);
    expect(poziom(container)).toBeGreaterThanOrEqual(1);
    const kadrStacji = viewBox(container);
    expect(kadrStacji).not.toBe(kadrSieci);
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);

    fireEvent.click(screen.getByTestId('sld-v3-poprzedni-widok'));
    expect(viewBox(container)).toBe(kadrSieci);
    expect(poziom(container)).toBe(0);
    expect(screen.queryByTestId('sld-v3-sciezka-kadru')).toBeNull();

    dwuklikStacji(container, STACJA);
    expect(viewBox(container)).toBe(kadrStacji);
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    expect(viewBox(container)).toBe(kadrSieci);
  });

  it('rozwinięcie zwiniętego GPZ klikiem (KD-5) jest poleceniem widoku: „Wstecz" wraca do kadru sieci', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    const kadrSieci = viewBox(container);
    fireEvent.click(uchwyt(container, sceny[0], (s) => s.symbolId === 'gpzCollapsed'));
    expect(poziom(container)).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('sld-v3-poprzedni-widok')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('sld-v3-poprzedni-widok'));
    expect(viewBox(container)).toBe(kadrSieci);
  });

  it('klik w poziom „Sieć" ścieżki wraca do kadru sieci; poprzednia/następna stacja w porządku obchodu rysunku', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    dwuklikStacji(container, STACJA);
    const i = porzadek.indexOf(STACJA);
    expect(screen.getByTestId('sld-v3-stacja-licznik').textContent).toBe(`${i + 1}/${porzadek.length}`);

    fireEvent.click(screen.getByTestId('sld-v3-stacja-nastepna'));
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(porzadek[i + 1])]);
    fireEvent.click(screen.getByTestId('sld-v3-stacja-poprzednia'));
    fireEvent.click(screen.getByTestId('sld-v3-stacja-poprzednia'));
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(porzadek[i - 1])]);

    fireEvent.click(screen.getByTestId('sld-v3-sciezka-0'));
    expect(screen.queryByTestId('sld-v3-sciezka-kadru')).toBeNull();
    expect(poziom(container)).toBe(0);
  });

  it('pierwsza stacja obchodu (GPZ): „poprzednia" nieaktywna z opisem', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    dwuklikStacji(container, porzadek[0]);
    expect(screen.getByTestId('sld-v3-stacja-poprzednia')).toBeDisabled();
    expect(screen.getByTestId('sld-v3-stacja-poprzednia')).toHaveAttribute('title', 'To pierwsza stacja rysunku');
    expect(screen.getByTestId('sld-v3-stacja-nastepna')).not.toBeDisabled();
  });
});

/**
 * K2 — CEL GESTU WIELOKLIKU. W żywej aplikacji pierwszy klik w stację otwiera
 * inspektor powłoki, kanwa się zwęża, a rysunek przesuwa (zmierzone: 183 px przy
 * oknie 1600 px), więc drugi klik i `dblclick` przeglądarka wysyła do obiektu,
 * który przesunął się pod kursor. jsdom nie ma układu, dlatego test odtwarza
 * DOKŁADNIE sekwencję przeglądarki: `click` (detail 1) w cel, potem `click`
 * (detail 2) i `dblclick` (detail 2) w INNY węzeł.
 * Iloczyn: początek gestu {uchwyt stacji · tło kanwy · węzeł kanwy bez uchwytu ·
 * węzeł poza kanwą} × drugi węzeł {inny uchwyt · ten sam uchwyt · węzeł poza kanwą}
 * × zdarzenie {drugi klik · dwuklik}.
 */
describe('gest wielokliku: drugi klik i dwuklik trafiają do celu PIERWSZEGO kliku', () => {
  const inny = () => porzadek.find((r) => r !== STACJA && r !== sceny[2].meta.gpzId)!;
  const stacjaL0 = (c: HTMLElement, ref: string) =>
    uchwyt(c, sceny[0], (s) => s.meta?.elementKind === 'station' && s.meta?.ownerRef === ref);
  const zaznaczone = () => useSelectionStore.getState().selectedElements.map((e) => e.id);

  it('pierwszy klik w stację, drugi klik i dwuklik w przesunięty pod kursor węzeł sąsiada → kadr i zaznaczenie TEJ stacji', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    fireEvent.click(stacjaL0(container, STACJA), { detail: 1 });
    expect(zaznaczone()).toEqual([STACJA]);
    const sasiad = stacjaL0(container, inny());
    fireEvent.click(sasiad, { detail: 2 });
    expect(zaznaczone()).toEqual([STACJA]);
    fireEvent.doubleClick(sasiad, { detail: 2 });
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
    expect(poziom(container)).toBeGreaterThanOrEqual(1);
  });

  it('drugi klik i dwuklik w NIEDOSTĘPNĄ akcję paska inspektora odsłoniętego pierwszym klikiem → kadr stacji; akcja nie jest `disabled` (inaczej przeglądarka nie wysłałaby zdarzeń)', () => {
    const { container } = render(
      <>
        <SldCanvasV3Workspace width={1200} height={800} />
        <InspektorKanwyTestowy />
      </>,
    );
    fireEvent.click(stacjaL0(container, STACJA), { detail: 1 });
    const pasek = screen.getByTestId('inspektor-dzialania');
    const niedostepna = pasek.querySelector('[data-testid^="inspektor-akcja-"][data-disabled="true"]');
    expect(niedostepna, 'stacja bez wyników ma w pasku akcję niedostępną').not.toBeNull();
    expect(niedostepna).not.toBeDisabled();
    expect(niedostepna).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(niedostepna!, { detail: 2 });
    fireEvent.doubleClick(niedostepna!, { detail: 2 });
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
    // Inspektor zostaje (jest poza kanwą i nie zasłania kadru) — wskazuje TĘ stację.
    expect(screen.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-element-id', STACJA);
  });

  it('gest otwarty na TLE: drugi klik i dwuklik w uchwyt stacji, który przesunął się pod kursor, nie zaznaczają ani nie kadrują', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    const kadrSieci = viewBox(container);
    fireEvent.click(kanwa(container), { detail: 1 });
    const cel = stacjaL0(container, STACJA);
    fireEvent.click(cel, { detail: 2 });
    fireEvent.doubleClick(cel, { detail: 2 });
    expect(zaznaczone()).toEqual([]);
    expect(screen.queryByTestId('sld-v3-sciezka-kadru')).toBeNull();
    expect(viewBox(container)).toBe(kadrSieci);
  });

  it('gest otwarty na węźle bez uchwytu (treść nad rysunkiem): zdarzenia idą zwykłą drogą do węzła pod kursorem', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    const bezUchwytu = container.querySelector('[data-testid="sld-v3-rysunek"]')!;
    expect(bezUchwytu.closest('[data-hit-for]')).toBeNull();
    fireEvent.click(bezUchwytu, { detail: 1 });
    const cel = stacjaL0(container, STACJA);
    fireEvent.click(cel, { detail: 2 });
    expect(zaznaczone()).toEqual([STACJA]);
    fireEvent.doubleClick(cel, { detail: 2 });
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
  });

  it('drugi klik i dwuklik w węzeł POZA kanwą (panel, który przesunął się pod kursor) → węzeł nie dostaje kliku, stacja jest kadrowana', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    const przyciskPanelu = document.createElement('button');
    const klikPanelu = vi.fn();
    przyciskPanelu.addEventListener('click', klikPanelu);
    document.body.appendChild(przyciskPanelu);
    try {
      fireEvent.click(stacjaL0(container, STACJA), { detail: 1 });
      fireEvent.click(przyciskPanelu, { detail: 2 });
      fireEvent.doubleClick(przyciskPanelu, { detail: 2 });
      expect(klikPanelu).not.toHaveBeenCalled();
      expect(zaznaczone()).toEqual([STACJA]);
      expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
    } finally {
      przyciskPanelu.remove();
    }
  });

  it('gest otwarty POZA kanwą: drugi klik i dwuklik w uchwyt stacji idą zwykłą drogą (kanwa nie przejmuje cudzego gestu)', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    const zewnatrz = document.createElement('div');
    document.body.appendChild(zewnatrz);
    try {
      fireEvent.click(zewnatrz, { detail: 1 });
      const cel = stacjaL0(container, STACJA);
      fireEvent.click(cel, { detail: 2 });
      expect(zaznaczone()).toEqual([STACJA]);
      fireEvent.doubleClick(cel, { detail: 2 });
      expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
    } finally {
      zewnatrz.remove();
    }
  });

  it('cel bez zmian (rysunek nie drgnął): drugi klik i dwuklik w ten sam uchwyt działają zwykłą drogą', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    const cel = stacjaL0(container, STACJA);
    fireEvent.click(cel, { detail: 1 });
    fireEvent.click(cel, { detail: 2 });
    fireEvent.doubleClick(cel, { detail: 2 });
    expect(zaznaczone()).toEqual([STACJA]);
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
  });
});

/**
 * UI-02b JEDEN-INSPEKTOR × K2 — klik obiektu NIE zasłania kanwy. Dawna szuflada
 * szczegółów (392 px) otwierała się klikiem nad prawym pasem kanwy; kadr ponawiał się
 * na lewo od niej, a obiekt w pasie był przesuwany. Szczegóły są teraz w inspektorze
 * powłoki poza kanwą, więc klik nie zmienia prostokąta bezpiecznego: kadr i widok
 * zostają bez zmian. Iloczyn: kadr {trwający (dwuklik stacji) · brak (widok sieci)}
 * × obiekt {pole stacji · stacja w pasie dawnej szuflady · stacja na lewo od pasa}.
 */
const DAWNA_SZEROKOSC_SZUFLADY_PX = 392;

describe('klik obiektu bez zasłony kanwy: kadr i widok bez zmian', () => {
  const SZEROKOSC = 1200;
  const WYSOKOSC = 800;
  /** Prostokąt stacji w pikselach ekranu kanwy (z viewBox i geometrii sceny). */
  function stacjaNaEkranie(container: HTMLElement) {
    const [x, y, w, h] = viewBox(container)!.split(' ').map(Number);
    const wynik = zakresCelu('stacja', enm, [STACJA], sceny[2]);
    if (!wynik.dostepny) throw new Error(wynik.przyczyna);
    const box = prostokatyZakresu(sceny, wynik.zakres, sceneBoxToCameraWorld).celByLod[poziom(container)]!;
    const k = SZEROKOSC / w;
    expect(WYSOKOSC / h).toBeCloseTo(k, 6);
    return { left: (box.minX - x) * k, right: (box.maxX - x) * k, top: (box.minY - y) * k, bottom: (box.maxY - y) * k };
  }
  function naEkranie(container: HTMLElement, ref: string) {
    const [x, , w] = viewBox(container)!.split(' ').map(Number);
    const box = sceneBoxToCameraWorld(prostokatRefowWScenie(sceny[poziom(container)], [ref])!);
    const k = SZEROKOSC / w;
    return { left: (box.minX - x) * k, right: (box.maxX - x) * k };
  }
  const renderZInspektorem = () =>
    render(
      <>
        <SldCanvasV3Workspace width={SZEROKOSC} height={WYSOKOSC} />
        <InspektorKanwyTestowy />
      </>,
    );

  it('dwuklik stacji kadruje na całej kanwie; klik pola w kadrze pokazuje pole w inspektorze, a kadr zostaje DOKŁADNIE ten sam', () => {
    const { container } = renderZInspektorem();
    const cel = uchwyt(container, sceny[0], (s) => s.meta?.elementKind === 'station' && s.meta?.ownerRef === STACJA);
    fireEvent.click(cel, { detail: 1 });
    expect(screen.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-element-id', STACJA);
    fireEvent.doubleClick(cel, { detail: 2 });
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
    const kadrPelny = viewBox(container);
    const pelny = stacjaNaEkranie(container);
    expect(pelny.left).toBeGreaterThanOrEqual(-1e-6);
    expect(pelny.right).toBeLessThanOrEqual(SZEROKOSC + 1e-6);

    const lod = poziom(container);
    fireEvent.click(uchwyt(container, sceny[lod], (s) => s.meta?.ownerRef === POLE.ref_id), { detail: 1 });
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual([POLE.ref_id]);
    expect(screen.getByTestId('inspektor-element-kanwy')).toBeInTheDocument();
    expect(viewBox(container)).toBe(kadrPelny);
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
  });

  it('klik stacji leżącej w pasie dawnej szuflady (widok sieci): rysunek się nie przesuwa — nic jej nie zasłania', () => {
    const { container } = renderZInspektorem();
    const granica = SZEROKOSC - DAWNA_SZEROKOSC_SZUFLADY_PX;
    const ref = porzadek.find((r) => {
      if (r === sceny[2].meta.gpzId) return false;
      const e = naEkranie(container, r);
      return e.right > granica && e.left < SZEROKOSC && e.right - e.left < granica - 80;
    });
    expect(ref, 'fikstura ma stację w pasie dawnej szuflady').toBeTruthy();
    const przed = viewBox(container);
    fireEvent.click(uchwyt(container, sceny[poziom(container)], (s) => s.meta?.elementKind === 'station' && s.meta?.ownerRef === ref), {
      detail: 1,
    });
    expect(screen.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-element-id', ref!);
    expect(viewBox(container)).toBe(przed);
  });

  it('klik stacji widocznej na lewo od pasa: widok bez zmian', () => {
    const { container } = renderZInspektorem();
    const granica = SZEROKOSC - DAWNA_SZEROKOSC_SZUFLADY_PX;
    // GPZ pominięty: klik w zwinięty blok GPZ rozwija go (KD-5) — to polecenie widoku.
    const ref = porzadek.find((r) => {
      if (r === sceny[2].meta.gpzId) return false;
      const e = naEkranie(container, r);
      return e.left >= 40 && e.right <= granica - 40;
    });
    expect(ref, 'fikstura ma stację na lewo od pasa').toBeTruthy();
    const przed = viewBox(container);
    fireEvent.click(uchwyt(container, sceny[poziom(container)], (s) => s.meta?.elementKind === 'station' && s.meta?.ownerRef === ref), {
      detail: 1,
    });
    expect(screen.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-element-id', ref!);
    expect(viewBox(container)).toBe(przed);
  });
});

describe('„Dopasuj widok", menu „Dopasuj do…" i klawisze', () => {
  it('bez zaznaczenia: menu pokazuje cele niedostępne Z PRZYCZYNĄ; sieć i magistrala aktywne', () => {
    render(<SldCanvasV3Workspace width={1200} height={800} />);
    const menu = otworzMenu();
    for (const cel of ['zaznaczenie', 'stacja', 'sekcja', 'pole', 'tor']) {
      expect(within(menu).getByTestId(`sld-v3-dopasuj-do-${cel}`)).toBeDisabled();
      expect(within(menu).getByTestId(`sld-v3-dopasuj-do-${cel}-przyczyna`).textContent!.length).toBeGreaterThan(20);
    }
    expect(within(menu).getByTestId('sld-v3-dopasuj-do-siec')).not.toBeDisabled();
    expect(within(menu).getByTestId('sld-v3-dopasuj-do-magistrala')).not.toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('sld-v3-dopasuj-do-menu')).toBeNull();
  });

  it('zaznaczenie pola natywnym klikiem → „Dopasuj widok" kadruje POLE (ścieżka Sieć › stacja › pole), Shift+F wraca do sieci', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    const kadrSieci = viewBox(container);
    dwuklikStacji(container, STACJA);
    const lod = poziom(container);
    fireEvent.click(uchwyt(container, sceny[lod], (s) => s.meta?.ownerRef === POLE.ref_id));
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual([POLE.ref_id]);
    const kadrStacji = viewBox(container);

    fireEvent.click(screen.getByTestId('sld-v3-fit-view'));
    expect(viewBox(container)).not.toBe(kadrStacji);
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA), POLE.name]);

    // Poziom stacji ze ścieżki: ten sam kadr co dwuklik.
    fireEvent.click(screen.getByTestId('sld-v3-sciezka-1'));
    expect(viewBox(container)).toBe(kadrStacji);

    // Klik pola nie zasłania kanwy (UI-02b: szczegóły w inspektorze powłoki), więc
    // Shift+F daje DOKŁADNIE kadr sieci z chwili montażu.
    fireEvent.keyDown(window, { key: 'F', shiftKey: true });
    expect(viewBox(container)).toBe(kadrSieci);
    // F z zaznaczeniem — znów kadr pola.
    fireEvent.keyDown(window, { key: 'f' });
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA), POLE.name]);
  });

  it('menu: „Sekcja szyn" i „Stacja" dla zaznaczonego pola kadrują sekcję i stację', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    act(() => useSelectionStore.getState().selectElement({ id: POLE.ref_id, type: 'BaySN', name: POLE.name }));
    fireEvent.click(within(otworzMenu()).getByTestId('sld-v3-dopasuj-do-sekcja'));
    const sciezkaSekcji = etykietySciezki();
    expect(sciezkaSekcji.slice(0, 2)).toEqual(['Sieć', nazwa(STACJA)]);
    expect(sciezkaSekcji[2]).toMatch(/^Szyna SN/);
    const kadrSekcji = viewBox(container);
    fireEvent.click(within(otworzMenu()).getByTestId('sld-v3-dopasuj-do-stacja'));
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
    expect(viewBox(container)).not.toBe(kadrSekcji);
  });

  it('klawisze w polu edycji NIE kadrują', () => {
    const { container } = render(
      <>
        <input data-testid="pole-edycji" />
        <SldCanvasV3Workspace width={1200} height={800} />
      </>,
    );
    act(() => useSelectionStore.getState().selectElement({ id: POLE.ref_id, type: 'BaySN', name: POLE.name }));
    const przed = viewBox(container);
    fireEvent.keyDown(screen.getByTestId('pole-edycji'), { key: 'f' });
    fireEvent.keyDown(screen.getByTestId('pole-edycji'), { key: 'ArrowLeft', altKey: true });
    expect(viewBox(container)).toBe(przed);
  });
});

describe('wskazanie ze sklepu selekcji', () => {
  it('wskazanie wydane, gdy schematu NIE było (przełączenie przestrzeni) — obsłużone raz po montażu', () => {
    act(() => useSelectionStore.getState().centerSldOnElement(STACJA));
    const { container, rerender } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    expect(poziom(container)).toBeGreaterThanOrEqual(1);
    expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
    fireEvent.click(screen.getByTestId('sld-v3-fit-sheet'));
    const poArkuszu = viewBox(container);
    rerender(<SldCanvasV3Workspace width={1200} height={800} />);
    expect(viewBox(container)).toBe(poArkuszu);
  });

  it('wskazanie elementu nienarysowanego: kamera stoi, komunikat mówi dlaczego', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    const przed = viewBox(container);
    act(() => useSelectionStore.getState().centerSldOnElement('seg/nie-ma/segment'));
    expect(viewBox(container)).toBe(przed);
    expect(screen.getByTestId('sld-v3-komunikat-kadru-tekst').textContent).toMatch(/nie jest narysowany/);
  });
});

describe('tor zasilania (odpowiedź backendu, bez wyróżnienia na kanwie)', () => {
  const elementToru = (ref: string, stacja: string | null) => ({
    ref_id: ref,
    rodzaj: 'pole' as const,
    typ: null,
    nazwa: ref,
    stan_lacznika: null,
    pole_ref: null,
    stacja_ref: stacja,
  });
  const tor = (nadpisz: Partial<TorElementuOdpowiedz>): TorElementuOdpowiedz => ({
    case_id: 'case-k2',
    enm_revision: 1,
    enm_hash: 'h',
    podstawa: 'topologia_laczeniowa',
    opis_podstawy: 'Topologia łączeniowa modelu (stany łączników), nie wynik obliczeń.',
    element: { ref_id: POLE.ref_id, rodzaj: 'pole', typ: null, nazwa: POLE.name },
    stan: 'zasilany',
    status: 'rozstrzygniety',
    przyczyny: [],
    drogi: [],
    drogi_obciete: false,
    sasiedztwo: {
      kierunek_ustalony: true,
      poprzednie: [],
      nastepne: [],
      pola_wejsciowe: [],
      pola_wyjsciowe: [],
      pole: null,
      stacja: null,
      przekladniki: [],
      zabezpieczenia: [],
    },
    ...nadpisz,
  });
  const odpowiedz = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })));

  it('drogi pewna i warunkowa: kadr obejmuje sumę dróg, tekst podaje liczby, łączniki nieustalone i podstawę', async () => {
    const gpzPole = enm.bays.find((b) => b.substation_ref === sceny[2].meta.gpzId)!;
    odpowiedz(
      200,
      tor({
        status: 'nierozstrzygniety',
        drogi: [
          { zrodlo_ref: 'src/A', pewna: true, elementy: [elementToru(gpzPole.ref_id, null)], laczniki_nieustalone: [] },
          { zrodlo_ref: 'src/B', pewna: false, elementy: [elementToru(POLE.ref_id, STACJA)], laczniki_nieustalone: ['Q7'] },
        ],
      }),
    );
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    act(() => useSelectionStore.getState().selectElement({ id: POLE.ref_id, type: 'BaySN', name: POLE.name }));
    const przed = viewBox(container);
    fireEvent.click(within(otworzMenu()).getByTestId('sld-v3-dopasuj-do-tor'));
    await waitFor(() => expect(screen.getByTestId('sld-v3-komunikat-kadru')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      `/api/cases/case-k2/enm/topologia/tor?element_ref=${encodeURIComponent(POLE.ref_id)}`,
    );
    const tekst = screen.getByTestId('sld-v3-komunikat-kadru-tekst').textContent!;
    expect(tekst).toContain('dróg 2 (pewnych 1, warunkowych 1)');
    expect(tekst).toContain('tor nierozstrzygnięty');
    expect(tekst).toContain('Topologia łączeniowa modelu');
    expect(screen.getByTestId('sld-v3-komunikat-kadru-szczegoly').textContent).toContain(
      'Droga warunkowa od źródła src/B — łączniki o nieustalonym stanie: Q7.',
    );
    expect(screen.getByTestId('sld-v3-komunikat-kadru')).toHaveAttribute('data-rodzaj', 'ostrzezenie');
    expect(viewBox(container)).not.toBe(przed);
    expect(etykietySciezki()).toEqual(['Sieć', `Tor zasilania: ${POLE.name}`]);
  });

  // Rodzaj komunikatu WYŁĄCZNIE ze statusu backendu (kontrakt werdyktu wyjaśnialnego):
  // iloczyn status × obecność dróg warunkowych × obcięcie listy — front nie liczy
  // własnego progu (dawny warunek `warunkowe.length > 0` był drugą klasyfikacją).
  it.each([
    ['rozstrzygniety', [true], false, 'informacja'],
    ['rozstrzygniety', [true, true], false, 'informacja'],
    ['nierozstrzygniety', [true, false], false, 'ostrzezenie'],
    ['nierozstrzygniety', [true], true, 'ostrzezenie'],
    ['brak_drogi', [], false, 'ostrzezenie'],
  ] as const)('opisToru: status %s, drogi pewne %j, obcięte %s → rodzaj %s', (status, pewnosc, obciete, rodzaj) => {
    const opis = opisToru(
      tor({
        status,
        drogi_obciete: obciete,
        drogi: pewnosc.map((pewna, i) => ({ zrodlo_ref: `src/${i}`, pewna, elementy: [], laczniki_nieustalone: [] })),
      }),
    );
    expect(opis.rodzaj).toBe(rodzaj);
    expect(opis.tekst).toContain(POLE.name);
    if (status === 'brak_drogi') expect(opis.tekst).toContain('brak drogi od źródła sieciowego');
    else expect(opis.tekst).toContain(`dróg ${pewnosc.length} (pewnych ${pewnosc.filter(Boolean).length}`);
    expect(opis.tekst.includes('tor nierozstrzygnięty')).toBe(status === 'nierozstrzygniety');
    if (obciete) expect(opis.szczegoly.join(' ')).toContain('Lista dróg jest obcięta');
  });

  it('brak drogi: kamera stoi, komunikat z przyczynami backendu', async () => {
    odpowiedz(
      200,
      tor({
        stan: 'niezasilany',
        status: 'brak_drogi',
        przyczyny: [{ kod: 'LACZNIK_OTWARTY', opis: 'Łącznik Q3 otwarty odcina pole od źródła.', elementy: ['Q3'] }],
      }),
    );
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    act(() => useSelectionStore.getState().selectElement({ id: POLE.ref_id, type: 'BaySN', name: POLE.name }));
    const przed = viewBox(container);
    fireEvent.click(within(otworzMenu()).getByTestId('sld-v3-dopasuj-do-tor'));
    await waitFor(() => expect(screen.getByTestId('sld-v3-komunikat-kadru')).toBeInTheDocument());
    expect(screen.getByTestId('sld-v3-komunikat-kadru-tekst').textContent).toContain('brak drogi od źródła sieciowego');
    expect(screen.getByTestId('sld-v3-komunikat-kadru-szczegoly').textContent).toContain('Łącznik Q3 otwarty');
    expect(screen.getByTestId('sld-v3-komunikat-kadru')).toHaveAttribute('data-rodzaj', 'ostrzezenie');
    expect(viewBox(container)).toBe(przed);
  });

  it('błąd HTTP: komunikat błędu z kodem, kamera stoi; zamknięcie komunikatu', async () => {
    odpowiedz(500, { detail: 'awaria' });
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    act(() => useSelectionStore.getState().selectElement({ id: POLE.ref_id, type: 'BaySN', name: POLE.name }));
    const przed = viewBox(container);
    fireEvent.click(within(otworzMenu()).getByTestId('sld-v3-dopasuj-do-tor'));
    await waitFor(() => expect(screen.getByTestId('sld-v3-komunikat-kadru')).toHaveAttribute('data-rodzaj', 'blad'));
    expect(screen.getByTestId('sld-v3-komunikat-kadru-tekst').textContent).toContain('HTTP 500');
    expect(viewBox(container)).toBe(przed);
    fireEvent.click(screen.getByTestId('sld-v3-komunikat-kadru-zamknij'));
    expect(screen.queryByTestId('sld-v3-komunikat-kadru')).toBeNull();
  });

  it('brak aktywnego przypadku: „Tor zasilania" nieaktywny z przyczyną, bez żądania', () => {
    useAppStateStore.setState({ activeCaseId: null });
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    render(<SldCanvasV3Workspace width={1200} height={800} />);
    act(() => useSelectionStore.getState().selectElement({ id: POLE.ref_id, type: 'BaySN', name: POLE.name }));
    const menu = otworzMenu();
    expect(within(menu).getByTestId('sld-v3-dopasuj-do-tor')).toBeDisabled();
    expect(within(menu).getByTestId('sld-v3-dopasuj-do-tor-przyczyna').textContent).toMatch(/przypadku obliczeniowego/);
    expect(spy).not.toHaveBeenCalled();
  });
});

/**
 * K2b §0.3 — WPIS HISTORII = {kamera, poziom, ścieżka, zaznaczenie}. Ścieżka
 * natywna przeglądarki: dwuklik to `click` (detail 1) → `click` (detail 2) →
 * `dblclick`, a pierwszy klik ZAZNACZA stację — zaznaczenie sprzed gestu
 * (odcinek) musi trafić do wpisu powrotu. Iloczyn: zaznaczenie przed wejściem
 * {odcinek toru · brak} × powrót {„Sieć" ścieżki · „Wstecz"} × przegląd stacji
 * {bez · następna ×2 · poprzednia}.
 */
describe('K2b: historia kadrów niesie zaznaczenie; przegląd stacji to jeden wpis powrotu', () => {
  const zaznaczone = () => useSelectionStore.getState().selectedElements.map((e) => e.id);
  const odcinekToru = (c: HTMLElement): Element => {
    const el = c.querySelector('[data-hit-klasa="tor"][data-hit-role="obrys"]');
    if (!el) throw new Error('brak obszaru trafienia odcinka toru');
    return el;
  };
  function dwuklikNatywny(c: HTMLElement, ref: string): void {
    const el = uchwyt(c, sceny[poziom(c)], (s) => s.meta?.elementKind === 'station' && s.meta?.ownerRef === ref);
    fireEvent.click(el, { detail: 1 });
    fireEvent.click(el, { detail: 2 });
    fireEvent.doubleClick(el, { detail: 2 });
  }

  for (const powrot of ['sciezka', 'wstecz'] as const) {
    for (const przeglad of ['bez', 'nastepna2', 'poprzednia'] as const) {
      it(`zaznaczony odcinek → dwuklik stacji → przegląd ${przeglad} → ${powrot === 'sciezka' ? '„Sieć"' : '„Wstecz"'}: kadr sieci i zaznaczenie odcinka jak przed dwuklikiem`, () => {
        const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
        fireEvent.click(odcinekToru(container), { detail: 1 });
        const przed = zaznaczone();
        expect(przed).toHaveLength(1);
        const kadrSieci = viewBox(container);

        dwuklikNatywny(container, STACJA);
        expect(etykietySciezki()).toEqual(['Sieć', nazwa(STACJA)]);
        expect(zaznaczone()).toEqual([STACJA]);
        const i = porzadek.indexOf(STACJA);
        if (przeglad === 'nastepna2') {
          fireEvent.click(screen.getByTestId('sld-v3-stacja-nastepna'));
          const kadrPierwszej = viewBox(container);
          fireEvent.click(screen.getByTestId('sld-v3-stacja-nastepna'));
          expect(viewBox(container)).not.toBe(kadrPierwszej);
          expect(etykietySciezki()).toEqual(['Sieć', nazwa(porzadek[i + 2])]);
        }
        if (przeglad === 'poprzednia') fireEvent.click(screen.getByTestId('sld-v3-stacja-poprzednia'));

        if (powrot === 'sciezka') fireEvent.click(screen.getByTestId('sld-v3-sciezka-0'));
        else fireEvent.click(screen.getByTestId('sld-v3-poprzedni-widok'));
        expect(viewBox(container)).toBe(kadrSieci);
        expect(poziom(container)).toBe(0);
        expect(screen.queryByTestId('sld-v3-sciezka-kadru')).toBeNull();
        expect(zaznaczone()).toEqual(przed);
        // Przegląd stacji nie zostawił wpisów pośrednich: jeden powrót wraca do sieci.
        if (powrot === 'wstecz') expect(screen.getByTestId('sld-v3-poprzedni-widok')).toBeDisabled();
      });
    }
  }

  it('bez zaznaczenia przed wejściem: „Sieć" wraca do kadru sieci i zdejmuje zaznaczenie stacji z gestu', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    const kadrSieci = viewBox(container);
    dwuklikNatywny(container, STACJA);
    expect(zaznaczone()).toEqual([STACJA]);
    fireEvent.click(screen.getByTestId('sld-v3-sciezka-0'));
    expect(viewBox(container)).toBe(kadrSieci);
    expect(zaznaczone()).toEqual([]);
  });

  it('kadr stacji (dwuklik, kamera kadru): zero ukrytych opisów celu; komunikat, jeśli jest, mówi o opisach POZA celem', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    dwuklikNatywny(container, STACJA);
    expect(kanwa(container).getAttribute('data-ukryte-opisy-celu')).toBe('0');
    expect(Number(kanwa(container).getAttribute('data-min-opis-celu-px'))).toBeGreaterThanOrEqual(13 - 0.01);
    const hint = container.querySelector('[data-testid="sld-v3-hidden-labels-hint"]');
    if (hint && Number(hint.getAttribute('data-hidden-count')) > 0) {
      expect(hint.getAttribute('data-opisy-celu')).toBeNull();
      expect(hint.textContent).toBe(hiddenLabelsHintTextPozaCelem(Number(hint.getAttribute('data-hidden-count'))));
    }
  });

  it('kadr stacji przyciemnia sąsiadów (kurtyna), powrót do sieci ją zdejmuje', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    expect(container.querySelectorAll('[data-kadr="poza"]')).toHaveLength(0);
    dwuklikNatywny(container, STACJA);
    expect(container.querySelectorAll('[data-kadr="poza"]').length).toBeGreaterThan(0);
    expect(kanwa(container).getAttribute('data-kadr-aktywny')).toBe('true');
    fireEvent.click(screen.getByTestId('sld-v3-sciezka-0'));
    expect(container.querySelectorAll('[data-kadr="poza"]')).toHaveLength(0);
  });
});
