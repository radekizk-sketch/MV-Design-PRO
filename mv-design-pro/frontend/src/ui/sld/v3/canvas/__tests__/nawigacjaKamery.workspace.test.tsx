/**
 * Karta SLD-SKALA-I-NAWIGACJA, R7 — KAMERA w zamontowanym warsztacie schematu: przelot, skala
 * czytania, powiększenie oknem, wskaźnik skali z menu. Klawisze na `window`, wskaźnik na REALNYCH
 * węzłach (kanwa, nakładka prostokąta), stan kamery czytany z kanwy (`viewBox`,
 * `data-skala-kamery`, `data-stan-kamery`).
 *
 * ILOCZYN CECH:
 *  - przelot: polecenie widoku {Shift+1, okno (Z + przeciągnięcie), Alt+← (historia), menu skali
 *    „Cała sieć”, menu skali „100 %”, F przy zaznaczeniu} × ruch {dozwolony, `reduce`} — przelot
 *    przy ruchu dozwolonym, cięcie przy `reduce`, ten sam kadr końcowy w obu;
 *  - przerwanie przelotu × wejście {wskaźnik, kółko, klawisz} — cięcie do kadru celu;
 *  - zmiana układu (szerokość kanwy) w trakcie przelotu — przelot leci dalej do nowego celu;
 *  - gest {kółko, `+`, strzałka} × ruch dozwolony — zawsze natychmiast, bez przelotu;
 *  - skala czytania × punkt stały {kursor nad kanwą, kursor poza kanwą (środek kadru)};
 *    sam klawisz `1` nie zmienia kamery (cyfry przełączają przestrzenie pracy);
 *  - okno × {przeciągnięcie, klik (okno za małe), Esc, ponowne Z, Shift+przeciągnięcie = lasso,
 *    przycisk paska} oraz historia po oknie;
 *  - wskaźnik skali: procent = skala / skala czytania; „Zaznaczenie” × {brak, jest} zaznaczenia;
 *  - kółko nad nawigatorem × {przybliżenie, oddalenie} — skala wokół środka kadru, bez przelotu
 *    i bez wpisu historii; zdarzenie zatrzymane (strona się nie przewija);
 *  - pamięć kamery × {ten sam projekt po odmontowaniu, inny projekt, projekt bez identyfikatora}.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useAppStateStore } from '../../../../app-state';
import { useSelectionStore } from '../../../../selection';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { SKALA_CZYTANIA } from '../camera';
import { wyczyscPamiecKamery } from '../pamiecKamery';
import { CZAS_PRZELOTU_MS } from '../przelotKamery';
import { WHEEL_ZOOM_SENSITIVITY } from '../SldCanvasV3';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8')) as {
    enm: EnergyNetworkModel;
  }
).enm;
const W = 1200;
const H = 800;

// jsdom nie ma `PointerEvent` — bez niego `fireEvent.pointer*` gubi `button`, `clientX`, `shiftKey`
// (ten sam podkład co `przeciaganieKanwy.test.tsx`).
class PointerEventTestowy extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}
beforeAll(() => {
  if (typeof window.PointerEvent !== 'function') {
    Object.defineProperty(window, 'PointerEvent', { value: PointerEventTestowy, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'PointerEvent', { value: PointerEventTestowy, configurable: true, writable: true });
  }
});

// Zegar klatek pod kontrolą testu: kolejka wywołań `requestAnimationFrame` i jawny czas.
let kolejka: { id: number; cb: FrameRequestCallback }[] = [];
let nr = 0;
let teraz = 0;
function zegarKlatek(ruch: 'dozwolony' | 'reduce') {
  kolejka = [];
  nr = 0;
  teraz = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    nr += 1;
    kolejka.push({ id: nr, cb });
    return nr;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    kolejka = kolejka.filter((k) => k.id !== id);
  });
  vi.spyOn(window.performance, 'now').mockImplementation(() => teraz);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: ruch === 'reduce' && q === '(prefers-reduced-motion: reduce)',
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}
/** Klatka po `ms` od poprzedniej (czas względny — przelot startuje w bieżącej chwili zegara). */
function klatka(ms: number) {
  teraz += ms;
  const biezace = kolejka;
  kolejka = [];
  act(() => {
    for (const k of biezace) k.cb(teraz);
  });
}
function dokoncz() {
  klatka(CZAS_PRZELOTU_MS.max + 1);
}

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  wyczyscPamiecKamery();
  useSnapshotStore.setState({ snapshot: enm });
  useAppStateStore.setState({ activeCaseId: 'case-r7' });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>(() => {})));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useSelectionStore.getState().clearSelection();
  useAppStateStore.setState({ activeCaseId: null });
});

const kanwa = () => screen.getByTestId('sld-canvas-v3');
const viewBox = () => kanwa().getAttribute('viewBox')!;
const skala = () => Number(kanwa().getAttribute('data-skala-kamery'));
const stan = () => kanwa().getAttribute('data-stan-kamery');
const nakladka = () => screen.getByTestId('sld-v3-lasso-capture');
/** Kadr z `viewBox`: lewy górny róg w świecie i skala [px/j.św.]. */
const kadr = () => {
  const [x, y, w] = viewBox().split(' ').map(Number);
  return { x, y, skala: W / w };
};
const swiatPod = (p: { x: number; y: number }) => {
  const k = kadr();
  return { x: k.x + p.x / k.skala, y: k.y + p.y / k.skala };
};

const klawisz = (init: KeyboardEventInit) => act(() => void fireEvent.keyDown(window, init));
const shift1 = () => klawisz({ key: '!', code: 'Digit1', shiftKey: true });

function przeciagnij(z: { x: number; y: number }, na: { x: number; y: number }, shiftKey = false) {
  const el = nakladka();
  fireEvent.pointerDown(el, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: z.x, clientY: z.y, shiftKey });
  fireEvent.pointerMove(el, { pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: na.x, clientY: na.y, shiftKey });
  fireEvent.pointerUp(el, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 0, clientX: na.x, clientY: na.y, shiftKey });
}

/** Polecenia widoku: każde zmienia kadr względem stanu po `przygotuj`. */
const POLECENIA: readonly (readonly [string, () => void, () => void])[] = [
  ['Shift+1 (skala czytania)', () => {}, shift1],
  [
    'okno (Z + przeciągnięcie)',
    () => {},
    () => {
      klawisz({ key: 'z', code: 'KeyZ' });
      przeciagnij({ x: 200, y: 200 }, { x: 500, y: 420 });
    },
  ],
  ['Alt+← (historia)', () => shift1(), () => klawisz({ key: 'ArrowLeft', altKey: true })],
  [
    'menu skali — Cała sieć',
    () => shift1(),
    () => {
      fireEvent.click(screen.getByTestId('sld-v3-wskaznik-skali-toggle'));
      fireEvent.click(screen.getByTestId('sld-v3-skala-siec'));
    },
  ],
  [
    'menu skali — 100 %',
    () => {},
    () => {
      fireEvent.click(screen.getByTestId('sld-v3-wskaznik-skali-toggle'));
      fireEvent.click(screen.getByTestId('sld-v3-skala-100'));
    },
  ],
  [
    'F przy zaznaczeniu',
    () => {
      const pole = enm.bays.find((b) => b.ref_id.includes('/sn_field/'))!;
      act(() => useSelectionStore.getState().selectElement({ id: pole.ref_id, type: 'BaySN', name: pole.ref_id }));
    },
    () => klawisz({ key: 'f', code: 'KeyF' }),
  ],
];

function przebieg(ruch: 'dozwolony' | 'reduce', przygotuj: () => void, polecenie: () => void) {
  zegarKlatek(ruch);
  render(<SldCanvasV3Workspace width={W} height={H} />);
  przygotuj();
  dokoncz();
  const przed = viewBox();
  expect(stan()).toBe('spoczynek');
  // Zdarzenia osobno (każde `fireEvent` we własnym `act`) — jak w przeglądarce, gdzie między
  // zdarzeniami wejścia React renderuje.
  polecenie();
  return { przed };
}

describe('przelot: ILOCZYN {polecenie widoku} × {ruch dozwolony, reduce}', () => {
  for (const [nazwa, przygotuj, polecenie] of POLECENIA) {
    it(`${nazwa}: przelot przy ruchu dozwolonym kończy się w kadrze cięcia`, () => {
      const { przed: przedCiecia } = przebieg('reduce', przygotuj, polecenie);
      expect(stan()).toBe('spoczynek');
      const kadrCiecia = viewBox();
      const skalaCiecia = skala();
      expect(kadrCiecia).not.toBe(przedCiecia);
      cleanup();
      vi.restoreAllMocks();

      const { przed } = przebieg('dozwolony', przygotuj, polecenie);
      expect(przed).toBe(przedCiecia);
      // Stan kamery od razu w celu (plan, trafienia, skala) — animuje się wyłącznie `viewBox`.
      expect(skala()).toBe(skalaCiecia);
      expect(stan()).toBe('przelot');
      expect(viewBox()).toBe(przed);
      klatka(CZAS_PRZELOTU_MS.min / 2);
      expect(stan()).toBe('przelot');
      const posrodku = viewBox();
      expect(posrodku).not.toBe(przed);
      expect(posrodku).not.toBe(kadrCiecia);
      dokoncz();
      expect(stan()).toBe('spoczynek');
      expect(viewBox()).toBe(kadrCiecia);
    });
  }
});

describe('przerwanie przelotu: ILOCZYN {wskaźnik, kółko, klawisz} — cięcie do kadru celu', () => {
  const WEJSCIA: readonly (readonly [string, () => void])[] = [
    ['wskaźnik', () => fireEvent.pointerDown(document.body, { pointerId: 9, button: 0 })],
    ['kółko', () => fireEvent.wheel(document.body, { deltaY: 0 })],
    ['klawisz', () => fireEvent.keyDown(window, { key: 'Shift' })],
  ];
  for (const [nazwa, wejscie] of WEJSCIA) {
    it(nazwa, () => {
      przebieg('reduce', () => {}, shift1);
      const cel = viewBox();
      cleanup();
      vi.restoreAllMocks();
      przebieg('dozwolony', () => {}, shift1);
      klatka(CZAS_PRZELOTU_MS.min / 3);
      expect(stan()).toBe('przelot');
      expect(viewBox()).not.toBe(cel);
      act(() => {
        wejscie();
      });
      expect(stan()).toBe('spoczynek');
      expect(viewBox()).toBe(cel);
      // Po przerwaniu klatki nie biegną dalej.
      expect(kolejka).toHaveLength(0);
    });
  }
});

describe('zmiana układu w trakcie przelotu (szerokość kanwy): przelot leci dalej do NOWEGO celu', () => {
  it('Shift+1, potem węższa kanwa w połowie przelotu — koniec w kadrze cięcia tej samej sekwencji', () => {
    zegarKlatek('reduce');
    const r1 = render(<SldCanvasV3Workspace width={W} height={H} />);
    shift1();
    r1.rerender(<SldCanvasV3Workspace width={W - 200} height={H} />);
    const cel = viewBox();
    cleanup();
    vi.restoreAllMocks();

    zegarKlatek('dozwolony');
    const r2 = render(<SldCanvasV3Workspace width={W} height={H} />);
    shift1();
    klatka(CZAS_PRZELOTU_MS.min / 2);
    expect(stan()).toBe('przelot');
    r2.rerender(<SldCanvasV3Workspace width={W - 200} height={H} />);
    expect(stan()).toBe('przelot');
    klatka(CZAS_PRZELOTU_MS.min / 2);
    expect(viewBox()).not.toBe(cel);
    dokoncz();
    expect(stan()).toBe('spoczynek');
    expect(viewBox()).toBe(cel);
  });
});

describe('gesty zawsze natychmiast: ILOCZYN {kółko, +, strzałka} × ruch dozwolony', () => {
  const GESTY: readonly (readonly [string, () => void])[] = [
    ['kółko', () => fireEvent.wheel(kanwa(), { clientX: W / 2, clientY: H / 2, deltaY: -140 })],
    ['+', () => fireEvent.keyDown(window, { key: '+' })],
    ['strzałka', () => fireEvent.keyDown(window, { key: 'ArrowRight' })],
  ];
  for (const [nazwa, gest] of GESTY) {
    it(nazwa, () => {
      const { przed } = przebieg('dozwolony', () => shift1(), () => {});
      act(() => {
        gest();
      });
      expect(stan()).toBe('spoczynek');
      expect(viewBox()).not.toBe(przed);
      expect(kolejka).toHaveLength(0);
    });
  }
});

describe('skala czytania (Shift+1): ILOCZYN {kursor nad kanwą, poza kanwą}', () => {
  it('kursor nad kanwą: skala czytania, punkt świata pod kursorem nieruchomy', () => {
    zegarKlatek('reduce');
    render(<SldCanvasV3Workspace width={W} height={H} />);
    const kursor = { x: 310, y: 470 };
    fireEvent.pointerMove(kanwa(), { pointerId: 1, pointerType: 'mouse', buttons: 0, clientX: kursor.x, clientY: kursor.y });
    const przed = swiatPod(kursor);
    expect(skala()).toBeLessThan(SKALA_CZYTANIA);
    shift1();
    expect(skala()).toBe(SKALA_CZYTANIA);
    const po = swiatPod(kursor);
    expect(po.x).toBeCloseTo(przed.x, 6);
    expect(po.y).toBeCloseTo(przed.y, 6);
  });

  it('kursor poza kanwą: skala czytania wokół środka kadru', () => {
    zegarKlatek('reduce');
    render(<SldCanvasV3Workspace width={W} height={H} />);
    fireEvent.pointerMove(kanwa(), { pointerId: 1, pointerType: 'mouse', buttons: 0, clientX: 30, clientY: 30 });
    fireEvent.pointerLeave(kanwa(), { pointerId: 1, pointerType: 'mouse' });
    const srodek = { x: W / 2, y: H / 2 };
    const przed = swiatPod(srodek);
    shift1();
    expect(skala()).toBe(SKALA_CZYTANIA);
    const po = swiatPod(srodek);
    expect(po.x).toBeCloseTo(przed.x, 6);
    expect(po.y).toBeCloseTo(przed.y, 6);
  });

  it('sam klawisz `1` nie zmienia kamery (cyfry przełączają przestrzenie pracy powłoki)', () => {
    zegarKlatek('reduce');
    render(<SldCanvasV3Workspace width={W} height={H} />);
    const przed = viewBox();
    klawisz({ key: '1', code: 'Digit1' });
    expect(viewBox()).toBe(przed);
  });
});

describe('powiększenie oknem: ILOCZYN {przeciągnięcie, klik, Esc, ponowne Z, Shift = lasso, przycisk}', () => {
  beforeEach(() => zegarKlatek('reduce'));

  it('Z + przeciągnięcie: okno w całości w kadrze, skala większa, tryb się kończy; Alt+← wraca', () => {
    render(<SldCanvasV3Workspace width={W} height={H} />);
    const przed = viewBox();
    const s0 = skala();
    klawisz({ key: 'z', code: 'KeyZ' });
    expect(nakladka().getAttribute('data-tryb-okna')).toBe('tak');
    expect(screen.getByTestId('sld-v3-powieksz-oknem').getAttribute('aria-pressed')).toBe('true');
    const a = swiatPod({ x: 200, y: 200 });
    const b = swiatPod({ x: 500, y: 420 });
    przeciagnij({ x: 200, y: 200 }, { x: 500, y: 420 });
    expect(nakladka().getAttribute('data-tryb-okna')).toBeNull();
    expect(skala()).toBeGreaterThan(s0);
    const k = kadr();
    for (const p of [a, b]) {
      const ekran = { x: (p.x - k.x) * k.skala, y: (p.y - k.y) * k.skala };
      expect(ekran.x).toBeGreaterThanOrEqual(0);
      expect(ekran.x).toBeLessThanOrEqual(W);
      expect(ekran.y).toBeGreaterThanOrEqual(0);
      expect(ekran.y).toBeLessThanOrEqual(H);
    }
    klawisz({ key: 'ArrowLeft', altKey: true });
    expect(viewBox()).toBe(przed);
  });

  it('klik (okno za małe): kamera bez zmian, tryb trwa', () => {
    render(<SldCanvasV3Workspace width={W} height={H} />);
    const przed = viewBox();
    klawisz({ key: 'z', code: 'KeyZ' });
    przeciagnij({ x: 200, y: 200 }, { x: 203, y: 230 });
    expect(viewBox()).toBe(przed);
    expect(nakladka().getAttribute('data-tryb-okna')).toBe('tak');
  });

  it('Esc i ponowne Z wychodzą z trybu bez zmiany kamery', () => {
    render(<SldCanvasV3Workspace width={W} height={H} />);
    const przed = viewBox();
    klawisz({ key: 'z', code: 'KeyZ' });
    klawisz({ key: 'Escape', code: 'Escape' });
    expect(nakladka().getAttribute('data-tryb-okna')).toBeNull();
    klawisz({ key: 'Z', code: 'KeyZ' });
    expect(nakladka().getAttribute('data-tryb-okna')).toBe('tak');
    klawisz({ key: 'z', code: 'KeyZ' });
    expect(nakladka().getAttribute('data-tryb-okna')).toBeNull();
    expect(viewBox()).toBe(przed);
  });

  it('Shift+przeciągnięcie w trybie okna pozostaje lassem (bez zmiany kamery)', () => {
    render(<SldCanvasV3Workspace width={W} height={H} />);
    const przed = viewBox();
    klawisz({ key: 'z', code: 'KeyZ' });
    const el = nakladka();
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, buttons: 1, clientX: 200, clientY: 200, shiftKey: true });
    fireEvent.pointerMove(el, { pointerId: 1, buttons: 1, clientX: 500, clientY: 420, shiftKey: true });
    expect(screen.getByTestId('sld-lasso')).toBeTruthy();
    expect(screen.queryByTestId('sld-v3-okno-powiekszenia')).toBeNull();
    act(() => void fireEvent.pointerUp(el, { pointerId: 1, button: 0, buttons: 0, clientX: 500, clientY: 420, shiftKey: true }));
    expect(viewBox()).toBe(przed);
  });

  it('przycisk paska włącza i wyłącza ten sam tryb; okno w toku rysuje prostokąt okna', () => {
    render(<SldCanvasV3Workspace width={W} height={H} />);
    const przycisk = screen.getByTestId('sld-v3-powieksz-oknem');
    fireEvent.click(przycisk);
    expect(przycisk.getAttribute('aria-pressed')).toBe('true');
    const el = nakladka();
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, buttons: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, buttons: 1, clientX: 300, clientY: 260 });
    expect(screen.getByTestId('sld-v3-okno-powiekszenia')).toBeTruthy();
    expect(screen.queryByTestId('sld-lasso')).toBeNull();
    act(() => void fireEvent.pointerUp(el, { pointerId: 1, button: 0, buttons: 0, clientX: 300, clientY: 260 }));
    expect(przycisk.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(przycisk);
    fireEvent.click(przycisk);
    expect(przycisk.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('wskaźnik skali: procent skali czytania i menu', () => {
  beforeEach(() => zegarKlatek('reduce'));

  it('procent = skala kamery / skala czytania; po Shift+1 = 100', () => {
    render(<SldCanvasV3Workspace width={W} height={H} />);
    const wskaznik = screen.getByTestId('sld-v3-wskaznik-skali-toggle');
    expect(Number(wskaznik.getAttribute('data-procent'))).toBe(Math.round((skala() / SKALA_CZYTANIA) * 100));
    shift1();
    expect(wskaznik.getAttribute('data-procent')).toBe('100');
    expect(wskaznik.textContent).toContain('100 %');
  });

  it('„Zaznaczenie”: bez zaznaczenia nieaktywne z przyczyną; z zaznaczeniem aktywne', () => {
    render(<SldCanvasV3Workspace width={W} height={H} />);
    fireEvent.click(screen.getByTestId('sld-v3-wskaznik-skali-toggle'));
    const brak = screen.getByTestId('sld-v3-skala-zaznaczenie');
    expect(brak).toBeDisabled();
    expect(brak.getAttribute('title')).toMatch(/Brak zaznaczenia/);
    fireEvent.click(screen.getByTestId('sld-v3-wskaznik-skali-toggle'));
    const pole = enm.bays.find((b) => b.ref_id.includes('/sn_field/'))!;
    act(() => useSelectionStore.getState().selectElement({ id: pole.ref_id, type: 'BaySN', name: pole.ref_id }));
    fireEvent.click(screen.getByTestId('sld-v3-wskaznik-skali-toggle'));
    expect(screen.getByTestId('sld-v3-skala-zaznaczenie')).not.toBeDisabled();
  });

  it('„Cała sieć” = Shift+F', () => {
    render(<SldCanvasV3Workspace width={W} height={H} />);
    shift1();
    klawisz({ key: 'F', code: 'KeyF', shiftKey: true });
    const siec = viewBox();
    shift1();
    fireEvent.click(screen.getByTestId('sld-v3-wskaznik-skali-toggle'));
    act(() => void fireEvent.click(screen.getByTestId('sld-v3-skala-siec')));
    expect(viewBox()).toBe(siec);
  });
});

describe('nawigator: kółko nad nawigatorem zmienia skalę wokół środka kadru (gest — natychmiast, bez historii)', () => {
  const srodekKadru = () => {
    const [x, y, w, h] = viewBox().split(' ').map(Number);
    return { x: x + w / 2, y: y + h / 2 };
  };
  for (const [kierunek, deltaY] of [['przybliżenie', -120], ['oddalenie', 120]] as const) {
    it(`${kierunek}: skala × exp(−Δy · czułość kółka), środek kadru w miejscu, bez przelotu przy ruchu dozwolonym`, () => {
      zegarKlatek('dozwolony');
      render(<SldCanvasV3Workspace width={W} height={H} />);
      shift1();
      dokoncz();
      fireEvent.click(screen.getByTestId('sld-v3-minimap-toggle'));
      const przed = kadr();
      const srodekPrzed = srodekKadru();
      const wstecz = screen.getByTestId('sld-v3-poprzedni-widok');
      const historiaPrzed = wstecz.getAttribute('title');
      act(() => void fireEvent.wheel(screen.getByTestId('sld-v3-minimap-svg'), { deltaY }));
      expect(stan()).toBe('spoczynek');
      expect(kadr().skala / przed.skala).toBeCloseTo(Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY), 6);
      const srodekPo = srodekKadru();
      expect(srodekPo.x).toBeCloseTo(srodekPrzed.x, 6);
      expect(srodekPo.y).toBeCloseTo(srodekPrzed.y, 6);
      expect(wstecz.getAttribute('title')).toBe(historiaPrzed);
    });
  }

  it('kółko nad nawigatorem nie przewija strony (zdarzenie zatrzymane)', () => {
    zegarKlatek('reduce');
    render(<SldCanvasV3Workspace width={W} height={H} />);
    fireEvent.click(screen.getByTestId('sld-v3-minimap-toggle'));
    const zdarzenie = new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true });
    act(() => void screen.getByTestId('sld-v3-minimap-svg').dispatchEvent(zdarzenie));
    expect(zdarzenie.defaultPrevented).toBe(true);
  });
});

describe('pamięć kamery per projekt: powrót na schemat przywraca kadr projektu cięciem', () => {
  beforeEach(() => {
    wyczyscPamiecKamery();
    zegarKlatek('dozwolony');
  });
  afterEach(() => useAppStateStore.setState({ activeProjectId: null }));

  it('wyjście z przestrzeni (odmontowanie) i powrót: ten sam kadr, bez przelotu; inny projekt — dopasowanie', () => {
    act(() => useAppStateStore.setState({ activeProjectId: 'projekt-a' }));
    const pierwszy = render(<SldCanvasV3Workspace width={W} height={H} />);
    const dopasowanie = viewBox();
    shift1();
    dokoncz();
    const praca = viewBox();
    expect(praca).not.toBe(dopasowanie);
    pierwszy.unmount();

    render(<SldCanvasV3Workspace width={W} height={H} />);
    expect(viewBox()).toBe(praca);
    expect(stan()).toBe('spoczynek');
    cleanup();

    act(() => useAppStateStore.setState({ activeProjectId: 'projekt-b' }));
    render(<SldCanvasV3Workspace width={W} height={H} />);
    expect(viewBox()).toBe(dopasowanie);
    cleanup();

    act(() => useAppStateStore.setState({ activeProjectId: 'projekt-a' }));
    render(<SldCanvasV3Workspace width={W} height={H} />);
    expect(viewBox()).toBe(praca);
  });

  it('projekt bez identyfikatora nie ma pamięci: powrót zaczyna od dopasowania', () => {
    act(() => useAppStateStore.setState({ activeProjectId: null }));
    const pierwszy = render(<SldCanvasV3Workspace width={W} height={H} />);
    const dopasowanie = viewBox();
    shift1();
    dokoncz();
    pierwszy.unmount();
    render(<SldCanvasV3Workspace width={W} height={H} />);
    expect(viewBox()).toBe(dopasowanie);
  });
});
