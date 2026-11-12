/**
 * B-2 — KONTRAKT KOTWICZENIA KAMERY NA ZMIANIE (audyt
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §4.3 wiersz B-2: „ogon przesuwa się o
 * pełną szerokość stacji, więc obraz skacze… kamera nie nadąża za miejscem
 * edycji").
 *
 * ---------------------------------------------------------------------------
 * CO ORZEKA (na REALNYCH parach migawek z żywego backendu, port 8037,
 * 2026-08-07 — nie na modelu wymyślonym w teście)
 * ---------------------------------------------------------------------------
 * Po operacji, która zmieniła model i WSKAZAŁA obiekt:
 *  · przybliżenie projektanta ZOSTAJE (skala niezmieniona, dopóki wskazany
 *    obiekt mieści się w kadrze),
 *  · przybliżenie ZOSTAJE (praca przybliżona nie spada do kadru całej sieci),
 *  · wskazany obiekt jest CAŁY w kadrze i wyśrodkowany.
 * Stan sprzed karty (bezwarunkowy `'refit'`), zmierzony tym samym narzędziem:
 * oddalenie 9,01× i L2→L0 przy pracy na pełnym szczególe (sieć 50→51 stacji).
 *
 * ---------------------------------------------------------------------------
 * ILOCZYN CECH (reguła „KLASA, NIE INSTANCJA" pkt 2 — nie przykład z karty)
 * ---------------------------------------------------------------------------
 *  {droga operacji: 5 realnych operacji budowy}
 *    × {rozmiar sieci: mała 3→4 stacje (jeden wiersz arkusza)
 *                    · duża 14→15 stacji (5 wierszy, arkusz łamany)}
 *    × {kadr: dopasowanie startowe · przybliżenie kółkiem} (jedna scena — karta SLD-SKALA-I-NAWIGACJA).
 * Do tego trzy stany brzegowe tej samej maszynerii: migawka o TYM SAMYM haszu
 * (odświeżenie bez zmiany modelu), wskazanie z `zoom_to: false` oraz brak
 * wskazania (fallback do refitu).
 *
 * ŚCIEŻKA REALNA: kamera jest stanem WEWNĘTRZNYM `SldCanvasV3`, więc kontrakt
 * mierzy `viewBox` ZAMONTOWANEGO komponentu po podmianie propu `snapshot` —
 * dokładnie tak, jak robi to aplikacja, gdy store dostaje odpowiedź operacji.
 * Żadnego wołania reducera „na skróty" (Zero-Debt pkt 5).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { at } from '../../../../../test/arrayAt';

import type { EnergyNetworkModel, SelectionHint } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3, sceneBoxToCameraWorld } from '../SldCanvasV3';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { kotwicaWidoku, prostokatElementuWScenie } from '../viewAnchor';
import { prostokatyZakresu, zakresCelu } from '../zakresKadru';
import { wskazanieOperacji } from '../../../../topology/wskazanieOperacji';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';

afterEach(() => cleanup());

const here = dirname(fileURLToPath(import.meta.url));
const wczytajEnm = (nazwa: string): EnergyNetworkModel =>
  (JSON.parse(readFileSync(resolve(here, 'fixtures', nazwa), 'utf8')) as { enm: EnergyNetworkModel }).enm;
const wczytajJson = <T,>(nazwa: string): T =>
  JSON.parse(readFileSync(resolve(here, 'fixtures', nazwa), 'utf8')) as T;

interface OdpowiedzOperacji {
  readonly selection_hint: SelectionHint | null;
  readonly changes: { readonly created_element_ids: string[] } | null;
  readonly segment_srodkowy?: string;
}

const SIECI = [
  {
    nazwa: 'mała (3 → 4 stacje, jeden wiersz arkusza)',
    przed: wczytajEnm('b2MalaPrzed.enm.json'),
    po: wczytajEnm('b2MalaPo.enm.json'),
    operacja: wczytajJson<OdpowiedzOperacji>('b2MalaOperacja.json'),
  },
  {
    nazwa: 'duża (14 → 15 stacji, 5 wierszy arkusza)',
    przed: wczytajEnm('b2DuzaPrzed.enm.json'),
    po: wczytajEnm('b2DuzaPo.enm.json'),
    operacja: wczytajJson<OdpowiedzOperacji>('b2DuzaOperacja.json'),
  },
] as const;

const KANWA = { width: 1600, height: 1000 } as const;

/** Kadr kamery [świat] odczytany z `viewBox` ZAMONTOWANEJ kanwy. */
function kadrZDom(container: HTMLElement): { x: number; y: number; width: number; height: number } {
  const viewBox = container.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('viewBox')!;
  const [x, y, width, height] = viewBox.split(' ').map(Number);
  return { x, y, width, height };
}

/** Prostokąt wskazanego obiektu w świecie kamery. */
function prostokatWskazanego(enm: EnergyNetworkModel, ref: string) {
  const box = prostokatElementuWScenie(buildSceneV3(enm), ref);
  return box ? sceneBoxToCameraWorld(box) : null;
}

function refKotwicy(enm: EnergyNetworkModel, operacja: OdpowiedzOperacji): string {
  const wskazanie = wskazanieOperacji(operacja.selection_hint, operacja.changes);
  expect(wskazanie, 'operacja niesie wskazanie obiektu').not.toBeNull();
  const kotwica = kotwicaWidoku(buildSceneV3(enm), wskazanie!.kandydaci, sceneBoxToCameraWorld);
  expect(kotwica, 'wskazanie rozwiązywalne na rysunku').not.toBeNull();
  return kotwica!.ref;
}

function wskazanieDoPropu(operacja: OdpowiedzOperacji) {
  const wskazanie = wskazanieOperacji(operacja.selection_hint, operacja.changes)!;
  return { kandydaci: wskazanie.kandydaci, przenosKadr: wskazanie.przenosKadr };
}

describe('SldCanvasV3 — kotwiczenie kamery na zmianie (B-2)', () => {
  for (const siec of SIECI) {
    it(`${siec.nazwa}: przybliżenie zostaje, wskazany obiekt jest cały w kadrze`, () => {
      const anchor = wskazanieDoPropu(siec.operacja);
      const { container, rerender } = render(
        <SldCanvasV3
          snapshot={siec.przed}
          width={KANWA.width}
          height={KANWA.height}
          viewAnchor={null}
        />,
      );
      const kadrPrzed = kadrZDom(container);
      const skalaPrzed = KANWA.width / kadrPrzed.width;

      // Zmiana migawki = odpowiedź operacji domenowej (store podaje migawkę
      // i wskazanie w jednym zapisie — tu w jednym renderze).
      rerender(
        <SldCanvasV3
          snapshot={siec.po}
          width={KANWA.width}
          height={KANWA.height}
          viewAnchor={anchor}
        />,
      );
      const kadrPo = kadrZDom(container);
      const skalaPo = KANWA.width / kadrPo.width;

      // 1. Przybliżenie projektanta ZOSTAJE (wskazany obiekt mieści się w
      //    kadrze na każdym z tych poziomów, więc kamera nie ma powodu
      //    oddalać). Sprzed karty: skala spadała do skali fitu całej sieci.
      expect(skalaPo).toBeCloseTo(skalaPrzed, 6);

      // 2. Wskazany obiekt jest CAŁY w kadrze — i wyśrodkowany.
      const ref = refKotwicy(siec.po, siec.operacja);
      const box = prostokatWskazanego(siec.po, ref)!;
      expect(box.minX).toBeGreaterThanOrEqual(kadrPo.x);
      expect(box.maxX).toBeLessThanOrEqual(kadrPo.x + kadrPo.width);
      expect(box.minY).toBeGreaterThanOrEqual(kadrPo.y);
      expect(box.maxY).toBeLessThanOrEqual(kadrPo.y + kadrPo.height);
      expect((box.minX + box.maxX) / 2).toBeCloseTo(kadrPo.x + kadrPo.width / 2, 3);
    });
  }

  /**
   * ŚCIEŻKA PRODUKCYJNA: projektant przybliża się kółkiem — natywnym zdarzeniem, nie
   * podmianą stanu (Zero-Debt pkt 5: obejście realnej ścieżki zamaskowałoby
   * dokładnie ten defekt, który karta naprawia) — a potem zapisuje operację.
   * Sprzed karty: skala wracała do fitu całej sieci (pomiar: 9,01× oddalenia).
   */
  for (const siec of SIECI) {
    it(`${siec.nazwa} · realna ścieżka (kółko myszy): przybliżenie przeżywa zapis operacji`, () => {
      const { container, rerender } = render(
        <SldCanvasV3 snapshot={siec.przed} width={KANWA.width} height={KANWA.height} viewAnchor={null} />,
      );
      const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
      const skala = () => Number(svg.getAttribute('data-skala-kamery'));
      const skalaStartowa = skala();
      // Karta SLD-SKALA-I-NAWIGACJA (R1): jedna scena — dawniej przybliżano aż kamera
      // podniesie poziom szczegółu; teraz do półtorakrotności skali startowej (praca
      // przybliżona, przy której wskazany obiekt nadal mieści się w kadrze — gdyby nie
      // mieścił się, kotwica SŁUSZNIE oddala do jego rozmiaru, test wyżej).
      for (let obrot = 0; skala() < skalaStartowa * 1.5 && obrot < 20; obrot += 1) {
        fireEvent.wheel(svg, { clientX: KANWA.width / 2, clientY: KANWA.height / 2, deltaY: -140 });
      }
      expect(skala()).toBeGreaterThanOrEqual(skalaStartowa * 1.5);
      const kadrRoboczy = kadrZDom(container);
      const skalaRobocza = KANWA.width / kadrRoboczy.width;

      rerender(
        <SldCanvasV3
          snapshot={siec.po}
          width={KANWA.width}
          height={KANWA.height}
          viewAnchor={wskazanieDoPropu(siec.operacja)}
        />,
      );
      const kadrPo = kadrZDom(container);
      const skalaPo = KANWA.width / kadrPo.width;

      expect(skalaPo).toBeCloseTo(skalaRobocza, 6);
      const box = prostokatWskazanego(siec.po, refKotwicy(siec.po, siec.operacja))!;
      expect(box.minX).toBeGreaterThanOrEqual(kadrPo.x);
      expect(box.maxX).toBeLessThanOrEqual(kadrPo.x + kadrPo.width);
      expect(box.minY).toBeGreaterThanOrEqual(kadrPo.y);
      expect(box.maxY).toBeLessThanOrEqual(kadrPo.y + kadrPo.height);
    });
  }

  it('bez kotwicy kamera zachowuje się jak przed kartą — pełny refit do całej sieci', () => {
    const siec = SIECI[1];
    const { container, rerender } = render(
      <SldCanvasV3 snapshot={siec.przed} width={KANWA.width} height={KANWA.height} viewAnchor={null} />,
    );
    rerender(
      <SldCanvasV3 snapshot={siec.po} width={KANWA.width} height={KANWA.height} viewAnchor={null} />,
    );
    const kadrPo = kadrZDom(container);
    // Refit celuje w CAŁĄ treść: kadr musi obejmować skrajne punkty sceny.
    const scene = buildSceneV3(siec.po);
    const bbox = sceneBoxToCameraWorld({
      minX: scene.bbox.x, minY: scene.bbox.y,
      maxX: scene.bbox.x + scene.bbox.width, maxY: scene.bbox.y + scene.bbox.height,
    });
    expect(kadrPo.width).toBeGreaterThan((bbox.maxX - bbox.minX) * 0.9);
  });

  it('wskazanie z `zoom_to: false` NIE rusza kamery (kontrakt SelectionHint)', () => {
    const siec = SIECI[1];
    const wskazanie = wskazanieOperacji(siec.operacja.selection_hint, siec.operacja.changes)!;
    const { container, rerender } = render(
      <SldCanvasV3 snapshot={siec.przed} width={KANWA.width} height={KANWA.height} viewAnchor={null} />,
    );
    const kadrPrzed = kadrZDom(container);
    rerender(
      <SldCanvasV3
        snapshot={siec.po}
        width={KANWA.width}
        height={KANWA.height}
        viewAnchor={{ kandydaci: wskazanie.kandydaci, przenosKadr: false }}
      />,
    );
    expect(kadrZDom(container)).toEqual(kadrPrzed);
  });

  it('migawka o TYM SAMYM haszu (odświeżenie bez zmiany modelu) nie rusza kamery — także po zoomie projektanta', () => {
    const siec = SIECI[1];
    // Ta sama treść, INNA referencja obiektu — dokładnie to, co robi
    // `refresh_snapshot` (pomiar 2026-08-07: hasz odpowiedzi identyczny z
    // haszem sprzed odświeżenia).
    const odswiezona = JSON.parse(JSON.stringify(siec.przed)) as EnergyNetworkModel;
    const { container, rerender } = render(
      <SldCanvasV3 snapshot={siec.przed} width={KANWA.width} height={KANWA.height} viewAnchor={null} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    // KLUCZOWE: kamera musi być PRZESUNIĘTA względem fitu, inaczej refit jest
    // nieodróżnialny od bezruchu i test nie strzeże niczego (iniekcja B,
    // 2026-08-07: pierwsza wersja tego testu przechodziła także z wyłączonym
    // predykatem haszu — obietnica bez strażnika).
    for (let i = 0; i < 8; i += 1) {
      fireEvent.wheel(svg, { clientX: KANWA.width / 2, clientY: KANWA.height / 2, deltaY: -140 });
    }
    const kadrPoZoomie = kadrZDom(container);
    expect(kadrPoZoomie.width).toBeLessThan(kadrZDom(container).width * 1.0001);

    rerender(
      <SldCanvasV3 snapshot={odswiezona} width={KANWA.width} height={KANWA.height} viewAnchor={null} />,
    );
    expect(kadrZDom(container)).toEqual(kadrPoZoomie);
  });

  // Dawny test „kandydat narysowany TYLKO na części poziomów jest odrzucany" skasowany
  // z intencją (karta SLD-SKALA-I-NAWIGACJA R1): jest jedna scena, więc kandydat jest
  // narysowany albo nie — przypadek „nierozwiązywalny ⇒ następny" pilnuje test niżej.

  it('kandydat nierozwiązywalny na rysunku jest pomijany na rzecz następnego (droga „przedłuż magistralę")', () => {
    // Pomiar 2026-08-07: `continue_trunk_segment_sn` wskazuje `bus/…/downstream`,
    // którego rysunek NIE nosi — kotwicą jest dopiero utworzony odcinek.
    const drogi = wczytajJson<Record<string, { wskazanie: string; utworzone: string[] }>>('b2DrogiOperacji.json');
    const droga = drogi.continue_trunk_segment_sn;
    const enm = wczytajEnm('b2Droga-continue_trunk_segment_sn.enm.json');
    const scena = buildSceneV3(enm);
    expect(prostokatElementuWScenie(scena, droga.wskazanie)).toBeNull();
    const kotwica = kotwicaWidoku(
      scena,
      wskazanieOperacji({ element_id: droga.wskazanie, element_type: 'bus', zoom_to: true }, { created_element_ids: droga.utworzone })!.kandydaci,
      sceneBoxToCameraWorld,
    );
    expect(kotwica).not.toBeNull();
    expect(kotwica!.ref).not.toBe(droga.wskazanie);
    expect(droga.utworzone).toContain(kotwica!.ref);
  });
});

/**
 * B-2, KLASA POBOCZNA: „pokaż ten element na schemacie".
 *
 * Pomiar 2026-08-07 (grep produkcyjny, nie lektura): 18 miejsc wołało
 * `useSelectionStore.centerSldOnElement` — wyniki zwarciowe („Pokaż na
 * schemacie"), przejście do stacji, akcje naprawcze bramki gotowości, drzewo
 * danych, panel kontekstu schematu, inspektor wyników, kreatory — a JEDYNYM
 * czytelnikiem pola był hook `useSelectionSync`, którego NIC nie montuje.
 * Wskazanie ginęło; kamera nie reagowała. Test idzie REALNĄ ścieżką tych 18
 * powierzchni: woła akcję sklepu i mierzy `viewBox` zamontowanego warsztatu.
 */
describe('SldCanvasV3Workspace — „pokaż na schemacie" kadruje wskazany element (B-2, klasa poboczna)', () => {
  const enmDuza = SIECI[1].po;

  beforeEach(() => {
    useSnapshotStore.setState({ snapshot: enmDuza, selectionHint: null, lastChanges: null });
    useSelectionStore.getState().clearSelection();
  });
  afterEach(() => {
    useSnapshotStore.getState().reset();
    useSelectionStore.getState().clearSelection();
  });

  /** Stacja wybrana deterministycznie: OSTATNIA w porządku refów. Symbole
   *  stacji jako całości żyją na poziomie przeglądu (L1/L2 rozkładają stację
   *  na pola), więc ref bierzemy stamtąd — kotwica i kadr działają na
   *  wszystkich trzech poziomach. */
  function refOstatniejStacji(): string {
    const scene = buildSceneV3(enmDuza);
    const refyStacji = [...scene.meta.stationTraversalOrder].sort();
    const ref = at(refyStacji, -1)!;
    expect(ref, 'fixtura ma stacje na rysunku').toBeTruthy();
    return ref;
  }

  // Karta SLD-SKALA-I-NAWIGACJA R7: intencja zostaje — wskazanie „kotwicz" przenosi kadr na
  // stację — ale kamerę obu trybów dobiera jedna reguła wskazania (`applyWskazanie`): z kadru
  // całej sieci cel nie jest rozpoznawalny, więc kadr celu w skali czytania (środek może ustąpić
  // sąsiadom w granicach luzu, jak każdy kadr celu).
  it("tryb 'kotwicz' (skutek uboczny edycji, drzewo): kadr przenosi się na stację w skali czytania", () => {
    const { container } = render(<SldCanvasV3Workspace />);
    const kadrPrzed = kadrZDom(container);
    const refStacji = refOstatniejStacji();

    act(() => {
      useSelectionStore.getState().centerSldOnElement(refStacji, 'kotwicz');
    });

    const kadrPo = kadrZDom(container);
    expect(kadrPo).not.toEqual(kadrPrzed);
    const box = prostokatWskazanego(enmDuza, refStacji)!;
    // Wskazany element jest w kadrze, kadr w skali czytania.
    expect(Number(container.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('data-skala-kamery'))).toBeCloseTo(1, 3);
    expect(box.minX).toBeGreaterThanOrEqual(kadrPo.x);
    expect(box.minY).toBeGreaterThanOrEqual(kadrPo.y);
    if (box.maxX - box.minX <= kadrPo.width) expect(box.maxX).toBeLessThanOrEqual(kadrPo.x + kadrPo.width);
  });

  // K2 (UI-04, §0.5–0.6): intencja testu B-2 zostaje — wskazanie z wyników albo
  // gotowości PRZENOSI kadr na element — ale domyślny tryb wskazania to teraz
  // KADR ('kadruj'): stacja z polami i aparatami w całości
  // w kadrze (środek może ustąpić sąsiadom — W5-UI-15), zamiast samego
  // przesunięcia bloku stacji do środka bez zmiany skali.
  it('wskazanie stacji ze sklepu selekcji (domyślnie kadr) pokazuje CAŁĄ stację', () => {
    const { container } = render(<SldCanvasV3Workspace />);
    const kadrPrzed = kadrZDom(container);
    const refStacji = refOstatniejStacji();

    act(() => {
      useSelectionStore.getState().centerSldOnElement(refStacji);
    });

    const kadrPo = kadrZDom(container);
    expect(kadrPo).not.toEqual(kadrPrzed);
    const scena = buildSceneV3(enmDuza);
    const wynik = zakresCelu('stacja', enmDuza, [refStacji], scena);
    expect(wynik.dostepny).toBe(true);
    if (!wynik.dostepny) return;
    const box = prostokatyZakresu(scena, wynik.zakres, sceneBoxToCameraWorld).cel!;
    expect(box.minX).toBeGreaterThanOrEqual(kadrPo.x - 1e-6);
    expect(box.maxX).toBeLessThanOrEqual(kadrPo.x + kadrPo.width + 1e-6);
    expect(box.minY).toBeGreaterThanOrEqual(kadrPo.y - 1e-6);
    expect(box.maxY).toBeLessThanOrEqual(kadrPo.y + kadrPo.height + 1e-6);
  });

  it('PONOWNE wskazanie tego samego refu kadruje znowu (numer wskazania, §0.5)', () => {
    const { container, getByTestId } = render(<SldCanvasV3Workspace />);
    const refStacji = refOstatniejStacji();
    act(() => {
      useSelectionStore.getState().centerSldOnElement(refStacji);
    });
    const kadrStacji = kadrZDom(container);
    // Projektant odchodzi od kadru natywnym klikiem „Cały arkusz".
    fireEvent.click(getByTestId('sld-v3-fit-sheet'));
    expect(kadrZDom(container)).not.toEqual(kadrStacji);
    // Ten sam ref drugi raz: dawny mechanizm (porównanie refu) milczał.
    act(() => {
      useSelectionStore.getState().centerSldOnElement(refStacji);
    });
    expect(kadrZDom(container)).toEqual(kadrStacji);
  });

  it('wskazanie refu, którego rysunek NIE nosi, nie rusza kamery (zero fabrykacji punktu)', () => {
    const { container } = render(<SldCanvasV3Workspace />);
    const kadrPrzed = kadrZDom(container);
    act(() => {
      useSelectionStore.getState().centerSldOnElement('stn/nie-ma-takiego/station');
    });
    expect(kadrZDom(container)).toEqual(kadrPrzed);
  });
});

describe('B-2 — każda droga operacji budowy ma kotwicę na KAŻDYM poziomie szczegółu', () => {
  const drogi = wczytajJson<Record<string, {
    wskazanie: string | null; typ: string | null; zoom_to: boolean | null; utworzone: string[];
  }>>('b2DrogiOperacji.json');

  for (const [operacja, dane] of Object.entries(drogi)) {
    it(`${operacja}: wskazanie backendu prowadzi do obiektu narysowanego na rysunku`, () => {
      const enm = wczytajEnm(`b2Droga-${operacja}.enm.json`);
      const wskazanie = wskazanieOperacji(
        dane.wskazanie ? { element_id: dane.wskazanie, element_type: dane.typ ?? '', zoom_to: dane.zoom_to ?? true } : null,
        { created_element_ids: dane.utworzone },
      );
      expect(wskazanie, 'operacja niesie wskazanie').not.toBeNull();
      const kotwica = kotwicaWidoku(buildSceneV3(enm), wskazanie!.kandydaci, sceneBoxToCameraWorld);
      expect(kotwica, 'kotwica rozwiązywalna na rysunku').not.toBeNull();
      const box = kotwica!.box;
      expect(box.maxX - box.minX).toBeGreaterThan(0);
      expect(box.maxY - box.minY).toBeGreaterThan(0);
    });
  }
});
