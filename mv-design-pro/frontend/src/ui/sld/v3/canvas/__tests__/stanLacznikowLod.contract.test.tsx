/**
 * Oględziny architekta 2026-11-13 (zrzuty karty skali), punkty 2, 3 i 6 — kontrakt kanwy:
 *
 *  (2) STANY ŁĄCZNIKÓW BEZ WNĘTRZ PÓL. Iloczyn {stan sprzęgła szyn: zamknięte, otwarte} ×
 *      {skala: 0,3 (LOD0), 0,45 i 0,6 (LOD1), 1,0 (LOD2)} × {motyw: ciemny, jasny} na stacji sekcyjnej
 *      fikstury „GPZ dwusekcyjny z 40 stacjami”: sprzęgło ma kafel stanu w barwie położenia z palety
 *      motywu (ta sama tabela co kafel pełnego rysunku), o stałym rozmiarze ekranowym; w LOD0
 *      szyna przeglądowa stacji jest przerwana dokładnie przy sprzęgle otwartym. Iloczyn
 *      {stan łącznika pola wejściowego: zamknięty, otwarty} × {LOD0, LOD1} — „stacja odłączona”:
 *      LOD0 — □ w nodze, LOD1 — znak przerwy toru bez linii przelotu.
 *      ŁĄCZNIK PODSTAWOWY (dyrektywa właściciela 2026-11-13, LOD1 „podstawowy łącznik i stan”):
 *      iloczyn {skład pola: wyłącznik + odłącznik, rozłącznik + odłącznik, sam odłącznik, dwa
 *      wyłączniki} × {kolejność w scenie: wprost, odwrotnie} — kafel stanu dostaje łącznik
 *      o największej zdolności łączeniowej, przy remisie pierwszy w scenie; sprzęgło zawsze;
 *      na kanwie zbiór kafli = zbiór łączników podstawowych i sprzęgieł.
 *  (3a) LOD0 na sieci wzorcowej 52 stacji: stacja w symbolu ma co najwyżej jedną nazwę
 *      (`#name-row-0`), żaden wiersz „Szyna nN · 0,4 kV” ani inny wiersz pasma nazw stacji
 *      nie jest narysowany. Położenie nazwy względem obrysu należy do układu (wykonawca
 *      geometrii) i nie jest tu sprawdzane.
 *  (H) HISTEREZA poziomu: iloczyn {kierunek: w górę, w dół} × {granica: LOD0/LOD1, LOD1/LOD2}
 *      × {położenie: w paśmie, za pasmem} — funkcja i kanwa (zoom kółkiem).
 *  (6) KADR OBIEKTU Z WNĘTRZEM: iloczyn {nawigator: nie zasłania, zasłania, obiekt za duży także
 *      bez nawigatora} — skala kadru stacji nie schodzi poniżej skali wnętrza pól; gdy podłogę
 *      przekracza wyłącznie zasłona nawigatora, kanwa woła zwinięcie nawigatora.
 *
 * Iniekcje (tabela §3 kontraktu `docs/sld/SLD_LOD_SPEC_OPERATOR_GRADE.md`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import type { Branch, EnergyNetworkModel } from '../../../../../types/enm';
import type { ThemeMode } from '../../../../../ui2/theme/themeMode';
import { buildSceneV3, type SceneV3 } from '../../scene/buildScene';
import { sldPaletteForTheme } from '../../theme/palette';
import { SldCanvasV3, WHEEL_ZOOM_SENSITIVITY, sceneBoxToCameraWorld } from '../SldCanvasV3';
import { RANGA_LACZNIKA_PODSTAWOWEGO, lacznikiZeZnakiemStanu, przegladEtykietPrzySkali, symboleStacji } from '../glifZbiorczy';
import type { HierarchiaCelowWejscie } from '../hitAreas';
import type { PreviewSymbol } from '../../compose/preview';
import { SKALA_PODLOGI_ROZDZIELNICY, SKALA_POL_ODPLYWOW, SKALA_WNETRZA_POL, poziomSzczegolu, type PoziomSzczegolu } from '../oknoRenderu';
import { PASMO_HISTEREZY_CZYTELNOSCI } from '../gestoscInformacji';
import { hierarchiaCelowTrafienia, prostokatyZakresu, zakresCelu } from '../zakresKadru';
import { kameraNaPunkcieSceny } from './kameraTestowa';
import { LACZNIKI_TORU_MOCY, przerwaToru } from '../torMocy';
import { SYMBOLE_LACZNIKOW_Z_POLOZENIEM, type SymbolId } from '../../symbols/defs';

const here = dirname(fileURLToPath(import.meta.url));
function wczytaj(sciezka: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, sciezka), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}
const enmGpz = wczytaj('../../../../../../public/test-fixtures/gpzDwusekcyjny40.enm.json');
const enm52 = wczytaj('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
const STACJA = 'stn/704dda66adab0820af8c8beae645148c/station';
const SPRZEGLO = 'stn/704dda66adab0820af8c8beae645148c/sn_coupler';
const KANWA = { width: 1200, height: 800 } as const;
const MOTYWY: readonly ThemeMode[] = ['dark_scada', 'light_technical'];

afterEach(() => cleanup());

/** Poziom OCZEKIWANY przy skali `s` (bez histerezy) z liczb kontraktu (`SLD_LOD_SPEC` R8 pkt 3:
 *  9/24 = 0,375 i 9/11 = 0,818), nie z funkcji produktu — iniekcja w progach musi czerwienić
 *  iloczyn, a nie przesuwać razem z nim oczekiwanie. */
function oczekiwanyPoziom(s: number): 'LOD0' | 'LOD1' | 'LOD2' {
  return s >= 9 / 11 ? 'LOD2' : s >= 9 / 24 ? 'LOD1' : 'LOD0';
}

function zeStanem(enm: EnergyNetworkModel, ref: string, stan: 'open' | 'closed'): EnergyNetworkModel {
  const kopia = structuredClone(enm) as EnergyNetworkModel;
  const galaz = (kopia.branches ?? []).find((g) => g.ref_id === ref) as (Branch & { status: string }) | undefined;
  if (!galaz) throw new Error(`brak gałęzi ${ref}`);
  galaz.status = stan;
  return kopia;
}

function srodekStacji(enm: EnergyNetworkModel, scene: SceneV3, stacja: string): { x: number; y: number } {
  const r = hierarchiaCelowTrafienia(enm, scene).stacje.get(stacja)!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function rysuj(enm: EnergyNetworkModel, skala: number, motyw: ThemeMode): Element {
  const scene = buildSceneV3(enm);
  const { container } = render(
    <SldCanvasV3
      snapshot={enm}
      {...KANWA}
      paletteMode={motyw}
      cameraOverride={kameraNaPunkcieSceny(scene, srodekStacji(enm, scene, STACJA), skala, KANWA)}
    />,
  );
  return container.querySelector('[data-testid="sld-canvas-v3"]')!;
}

describe('łączniki toru mocy — jedno źródło z biblioteką symboli (oba warianty rysunku pola)', () => {
  // Uziemnik (boczna gałąź do ziemi) i wyłącznik nN nie leżą na torze mocy SN.
  const pozaTorem = new Set<SymbolId>(['earthSwitch', 'qetEarthSwitch', 'nnBreaker']);
  for (const id of SYMBOLE_LACZNIKOW_Z_POLOZENIEM.filter((x) => !pozaTorem.has(x))) {
    it(`${id}: otwarty jest przerwą toru, zamknięty nie`, () => {
      expect(LACZNIKI_TORU_MOCY.has(id)).toBe(true);
      expect(przerwaToru({ symbolId: id, x: 0, y: 0, state: 'open' })).toBe(true);
      if (id !== 'noPoint') expect(przerwaToru({ symbolId: id, x: 0, y: 0, state: 'closed' })).toBe(false);
    });
  }
});

describe('stan sprzęgła szyn × poziom szczegółu × motyw', () => {
  for (const stan of ['closed', 'open'] as const) {
    for (const skala of [0.3, 0.45, 0.6, 1.0]) {
      for (const motyw of MOTYWY) {
        it(`sprzęgło ${stan === 'closed' ? 'zamknięte' : 'otwarte'} · skala ${skala} (${oczekiwanyPoziom(skala)}) · ${motyw}`, () => {
          const svg = rysuj(zeStanem(enmGpz, SPRZEGLO, stan), skala, motyw);
          const paleta = sldPaletteForTheme(motyw);
          const oczekiwany = stan === 'closed' ? 'zamkniety' : 'otwarty';
          const wezel = svg.querySelector(`[data-testid="sld-v3-symbols"] [data-owner-ref="${SPRZEGLO}"]`);
          expect(wezel, 'sprzęgło ma własny węzeł w każdej skali').not.toBeNull();
          const kafel = wezel!.querySelector('[data-kafel-stanu]');
          expect(kafel?.getAttribute('data-kafel-stanu'), 'kafel stanu sprzęgła').toBe(oczekiwany);
          const tlo = kafel!.querySelector('[data-kafel="tlo"]')!;
          expect(tlo.getAttribute('fill')).toBe(paleta.state[oczekiwany]);
          expect(paleta.state.zamkniety).not.toBe(paleta.state.otwarty);
          const poziom = oczekiwanyPoziom(skala);
          if (poziom === 'LOD2') {
            expect(wezel!.getAttribute('data-bez-wnetrza'), 'pełny glif od progu wnętrza').toBeNull();
            return;
          }
          expect(wezel!.getAttribute('data-bez-wnetrza')).toBe('kafel');
          // Stały rozmiar ekranowy kafla bez wnętrza = próg czytelności R3 (9 px, liczba kontraktu).
          expect(Number(tlo.getAttribute('width')) * skala).toBeCloseTo(9, 6);
          // Linia toru przez sprzęgło wyłącznie zamknięte.
          expect(wezel!.querySelector('path') !== null, 'przelot przez sprzęgło').toBe(stan === 'closed');
          if (poziom === 'LOD0') {
            const szyna = svg.querySelector(`[data-testid="sld-v3-symbol-stacji:${STACJA}"] [data-szyna-stacji]`)!;
            const odcinki = (szyna.getAttribute('d') ?? '').match(/M/g)?.length ?? 0;
            expect(odcinki, 'szyna przeglądowa przerwana przy sprzęgle otwartym').toBe(stan === 'closed' ? 1 : 2);
          }
        }, 120000);
      }
    }
  }
});

describe('stacja odłączona — łącznik pola wejściowego × LOD0/LOD1', () => {
  // Pole wejściowe stacji: gałąź toru dochodząca do pola sn_field/000 (stan wyłącznika z gałęzi).
  const bay = (enmGpz.bays ?? []).find((b) => b.ref_id === 'stn/704dda66adab0820af8c8beae645148c/sn_field/000');
  const galaz = bay?.equipment_refs?.[0];
  it('warunek sensu — pole wejściowe stacji niesie gałąź toru', () => {
    expect(galaz).toBeDefined();
  });
  for (const stan of ['closed', 'open'] as const) {
    for (const skala of [0.3, 0.45]) {
      it(`wyłącznik pola wejściowego ${stan === 'closed' ? 'zamknięty' : 'otwarty'} · skala ${skala} (${oczekiwanyPoziom(skala)})`, () => {
        const svg = rysuj(zeStanem(enmGpz, galaz!, stan), skala, 'light_technical');
        const wezly = [...svg.querySelectorAll(`[data-testid="sld-v3-symbols"] [data-owner-ref="${bay!.ref_id}"][data-symbol-id], [data-testid="sld-v3-symbols"] [data-owner-ref="${bay!.ref_id}"]`)];
        const przerwy = wezly.filter((w) => w.getAttribute('data-przerwa-toru') === 'true');
        if (stan === 'closed') {
          expect(przerwy.length, 'brak przerwy toru w polu zamkniętym').toBe(0);
          return;
        }
        expect(przerwy.length, 'przerwa toru w polu z otwartym wyłącznikiem').toBeGreaterThan(0);
        if (oczekiwanyPoziom(skala) === 'LOD1') {
          for (const w of przerwy) {
            expect(w.querySelector('path'), 'bez przelotu przez łącznik otwarty').toBeNull();
            const kafel = w.querySelector('[data-kafel-stanu]');
            if (kafel) expect(kafel.getAttribute('data-kafel-stanu')).toBe('otwarty');
          }
        } else {
          expect(przerwy.every((w) => w.tagName === 'rect'), 'LOD0: □ w nodze symbolu stacji').toBe(true);
        }
      }, 120000);
    }
  }
});

describe('LOD0 — opisy stacji w symbolu: sama nazwa, bez „Szyna nN” (sieć wzorcowa 52 stacji)', () => {
  for (const skala of [0.15, 0.3]) {
    it(`skala ${skala}: co najwyżej jedna nazwa na stację, bez wierszy pasma nazw poza nazwą`, () => {
      const scene = buildSceneV3(enm52);
      const hierarchia = hierarchiaCelowTrafienia(enm52, scene);
      const stacje = symboleStacji(scene.symbols, scene.segments, hierarchia, skala);
      expect(stacje.length, 'warunek sensu — LOD0 ma symbole stacji').toBeGreaterThan(40);
      expect(scene.labels.filter((l) => /Szyna nN/.test(l.text)).length, 'warunek sensu — scena niesie wiersze „Szyna nN”').toBeGreaterThan(40);
      const przedrostki = stacje.map((s) => s.stacjaRef.slice(0, s.stacjaRef.lastIndexOf('/') + 1));
      const srodek = { x: scene.bbox.x + scene.bbox.width / 2, y: scene.bbox.y + scene.bbox.height / 2 };
      const { container } = render(<SldCanvasV3 snapshot={enm52} {...KANWA} cameraOverride={kameraNaPunkcieSceny(scene, srodek, skala, KANWA)} />);
      const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
      expect(svg.getAttribute('data-poziom-szczegolu')).toBe('LOD0');
      let nazw = 0;
      const naStacje = new Map<string, number>();
      for (const g of svg.querySelectorAll('[data-testid="sld-v3-labels"] > g[data-owner-ref]')) {
        expect(g.textContent ?? '', 'wiersz „Szyna nN” w LOD0').not.toMatch(/Szyna nN/);
        const owner = g.getAttribute('data-owner-ref')!;
        const iStacji = przedrostki.findIndex((p) => owner.split('#')[0].startsWith(p));
        if (iStacji < 0) continue;
        const stacja = stacje[iStacji].stacjaRef;
        if (g.getAttribute('data-owner-kind') === 'busbar-voltage') continue;
        expect(owner, `opis stacji w symbolu — wyłącznie nazwa (${g.textContent})`).toBe(`${stacja}#name-row-0`);
        naStacje.set(stacja, (naStacje.get(stacja) ?? 0) + 1);
        nazw += 1;
      }
      expect(nazw, 'narysowane nazwy stacji w kadrze').toBeGreaterThan(5);
      for (const [stacja, n] of naStacje) expect(n, `${stacja}: jedna nazwa`).toBe(1);
    }, 120000);
  }
});

describe('LOD0 — tusz kadru z tymi samymi opisami co rysunek (sieć wzorcowa 52 stacji)', () => {
  it('tusz etykiet kadru stacji przy 0,15 liczony z planem bez opisów przeniesionych do podpowiedzi', () => {
    const scene = buildSceneV3(enm52);
    const hierarchia = hierarchiaCelowTrafienia(enm52, scene);
    const przeglad = przegladEtykietPrzySkali(scene, hierarchia);
    const stacja = symboleStacji(scene.symbols, scene.segments, hierarchia, 0.15)[0].stacjaRef;
    const wynik = zakresCelu('stacja', enm52, [stacja], scene) as { readonly zakres?: Parameters<typeof prostokatyZakresu>[1] };
    const zakres = wynik.zakres!;
    const tusz = (z?: typeof przeglad) => prostokatyZakresu(scene, zakres, (b) => b, z ? { przeglad: z } : {}).tuszEtykiet(0.15).cel;
    const ukryte = przeglad(0.15).ukryte;
    expect(ukryte.size, 'warunek sensu — LOD0 przenosi opisy stacji do podpowiedzi').toBeGreaterThan(40);
    const zPrzegladem = tusz(przeglad);
    const bezPrzegladu = tusz();
    expect(zPrzegladem, 'warunek sensu — kadr ma tusz nazwy').not.toBeNull();
    // Tusz z redukcją LOD0 jest ściśle mniejszy (bez „Szyna nN”, mocy i rodzaju stacji).
    const pole = (b: { minX: number; minY: number; maxX: number; maxY: number }) => (b.maxX - b.minX) * (b.maxY - b.minY);
    expect(pole(zPrzegladem!)).toBeLessThan(pole(bezPrzegladu!));
  });
});

describe('łącznik podstawowy pola — iloczyn składu pola × kolejności w scenie', () => {
  const hierarchia: HierarchiaCelowWejscie = {
    pola: new Map([['st/pole/A', { rect: { x: 0, y: 0, width: 10, height: 10 }, stacjaRef: 'st/station' }]]),
    stacje: new Map([['st/station', { x: 0, y: 0, width: 100, height: 100 }]]),
    stacjaObiektu: new Map([['st/sprzeglo', 'st/station']]),
  };
  const aparat = (symbolId: SymbolId, ownerRef: string): PreviewSymbol =>
    ({ symbolId, x: 0, y: 0, state: 'closed', meta: { elementKind: 'apparatus', ownerRef } }) as PreviewSymbol;
  const SKLADY: readonly { nazwa: string; sklad: readonly SymbolId[]; podstawowy: (kolejnosc: readonly SymbolId[]) => number }[] = [
    { nazwa: 'wyłącznik + odłącznik', sklad: ['disconnector', 'breaker'], podstawowy: (k) => k.indexOf('breaker') },
    { nazwa: 'rozłącznik + odłącznik', sklad: ['disconnector', 'loadBreakSwitch'], podstawowy: (k) => k.indexOf('loadBreakSwitch') },
    { nazwa: 'sam odłącznik', sklad: ['disconnector'], podstawowy: () => 0 },
    { nazwa: 'dwa wyłączniki (remis — pierwszy w scenie)', sklad: ['breaker', 'qetBreaker'], podstawowy: () => 0 },
  ];
  it('ranga pokrywa każdy łącznik toru mocy', () => {
    for (const id of LACZNIKI_TORU_MOCY) expect(RANGA_LACZNIKA_PODSTAWOWEGO[id], id).toBeDefined();
  });
  for (const { nazwa, sklad, podstawowy } of SKLADY) {
    for (const kolejnosc of [sklad, [...sklad].reverse()]) {
      it(`${nazwa} · kolejność ${kolejnosc.join(', ')}`, () => {
        // Indeks 0: sprzęgło stacji; dalej aparaty pola; na końcu aparat spoza hierarchii.
        const symbole = [aparat('lineSwitch', 'st/sprzeglo'), ...kolejnosc.map((id) => aparat(id, 'st/pole/A')), aparat('breaker', 'inna/pole')];
        const wynik = lacznikiZeZnakiemStanu(symbole, hierarchia);
        expect([...wynik].sort((x, y) => x - y)).toEqual([0, 1 + podstawowy(kolejnosc)]);
      });
    }
  }
  // Czytelność stanu (wymaganie właściciela 2026-11-13): iloczyn skala LOD1 {dolna granica pasma
  // wejścia, środek, tuż pod LOD2} × motyw — każdy kafel stanu ma bok ≥ 9 px ekranu (R3), a □
  // przerwy toru pozostałych łączników jest od kafla mniejszy (rozróżnialne znaki).
  for (const skala of [0.42, 0.6, 0.8]) {
    for (const motyw of MOTYWY) {
      it(`kanwa LOD1 · skala ${skala} · ${motyw}: kafel stanu czytelny (≥ 9 px), □ przerwy mniejszy`, () => {
        const svg = rysuj(enmGpz, skala, motyw);
        expect(svg.getAttribute('data-poziom-szczegolu')).toBe('LOD1');
        const tla = [...svg.querySelectorAll('[data-testid="sld-v3-symbols"] [data-kafel="tlo"]')];
        expect(tla.length, 'warunek sensu — kafle w kadrze').toBeGreaterThan(3);
        for (const t of tla) {
          expect(Number(t.getAttribute('width')) * skala).toBeGreaterThanOrEqual(9 - 1e-6);
          expect(Number(t.getAttribute('height')) * skala).toBeGreaterThanOrEqual(9 - 1e-6);
        }
        for (const p of svg.querySelectorAll('[data-testid="sld-v3-symbols"] rect[data-przerwa-toru="true"]')) {
          expect(Number(p.getAttribute('width')) * skala).toBeLessThan(9);
        }
      }, 120000);
    }
  }
  it('kanwa LOD1: kafel stanu wyłącznie na łączniku podstawowym pola i na sprzęgle', () => {
    const scene = buildSceneV3(enmGpz);
    const hier = hierarchiaCelowTrafienia(enmGpz, scene);
    const oczekiwane = new Set([...lacznikiZeZnakiemStanu(scene.symbols, hier)].map((i) => scene.symbols[i].meta?.ownerRef));
    const svg = rysuj(enmGpz, 0.45, 'dark_scada');
    expect(svg.getAttribute('data-poziom-szczegolu')).toBe('LOD1');
    const kafle = [...svg.querySelectorAll('[data-testid="sld-v3-symbols"] [data-bez-wnetrza="kafel"]')].map((w) => w.getAttribute('data-owner-ref'));
    expect(kafle.length, 'warunek sensu — kafle w kadrze').toBeGreaterThan(3);
    for (const ref of kafle) expect(oczekiwane.has(ref ?? undefined), `kafel ${ref}`).toBe(true);
    const naPole = new Map<string, number>();
    for (const ref of kafle) {
      const pole = poleIStacjaRef(hier, ref);
      if (pole !== undefined) naPole.set(pole, (naPole.get(pole) ?? 0) + 1);
    }
    for (const [pole, n] of naPole) expect(n, `${pole}: jeden łącznik ze stanem`).toBe(1);
    // LOD1: identyfikacja transformatora i przejście do widoku nN (portal nN) zostają pełnym glifem.
    for (const id of ['transformer', 'lvPortal']) {
      const wezly = [...svg.querySelectorAll(`[data-testid="sld-v3-symbols"] [data-element-kind="${id}"]`)];
      expect(wezly.length, `${id} narysowany w LOD1`).toBeGreaterThan(0);
      for (const w of wezly) expect(w.getAttribute('data-bez-wnetrza'), `${id} z wnętrzem`).toBeNull();
    }
  }, 120000);
});

function poleIStacjaRef(h: HierarchiaCelowWejscie, ref: string | null): string | undefined {
  if (ref === null) return undefined;
  let najlepsze: string | undefined;
  for (const pole of h.pola.keys()) if ((ref === pole || ref.startsWith(`${pole}/`) || ref.startsWith(`${pole}#`)) && (najlepsze === undefined || pole.length > najlepsze.length)) najlepsze = pole;
  return najlepsze;
}

describe('histereza poziomu szczegółu — kierunek × granica × położenie względem pasma', () => {
  const GRANICE: readonly [number, PoziomSzczegolu, PoziomSzczegolu][] = [
    [SKALA_POL_ODPLYWOW, 'LOD0', 'LOD1'],
    [SKALA_WNETRZA_POL, 'LOD1', 'LOD2'],
  ];
  const p = PASMO_HISTEREZY_CZYTELNOSCI;
  for (const [g, nizej, wyzej] of GRANICE) {
    it(`granica ${nizej}/${wyzej} (${g.toFixed(3)}): w górę`, () => {
      expect(poziomSzczegolu(g * (1 + p / 2), nizej), 'w paśmie — trzyma niższy').toBe(nizej);
      expect(poziomSzczegolu(g * (1 + p) * 1.001, nizej), 'za pasmem — przełącza').toBe(wyzej);
      expect(poziomSzczegolu(g * (1 + p / 2)), 'bez poprzedniego — granica wprost').toBe(wyzej);
    });
    it(`granica ${nizej}/${wyzej} (${g.toFixed(3)}): w dół`, () => {
      expect(poziomSzczegolu(g * (1 - p / 2), wyzej), 'w paśmie — trzyma wyższy').toBe(wyzej);
      expect(poziomSzczegolu(g * (1 - p) * 0.999, wyzej), 'za pasmem — przełącza').toBe(nizej);
      expect(poziomSzczegolu(g * (1 - p / 2)), 'bez poprzedniego — granica wprost').toBe(nizej);
    });
  }
  it('skok przez dwie granice naraz (LOD0 → LOD2 i z powrotem)', () => {
    expect(poziomSzczegolu(2, 'LOD0')).toBe('LOD2');
    expect(poziomSzczegolu(0.1, 'LOD2')).toBe('LOD0');
  });
  it('kanwa: zoom kółkiem w paśmie granicy LOD1/LOD2 nie przełącza rysunku', () => {
    const scene = buildSceneV3(enmGpz);
    const { container } = render(
      <SldCanvasV3 snapshot={enmGpz} {...KANWA} cameraOverride={kameraNaPunkcieSceny(scene, srodekStacji(enmGpz, scene, STACJA), 1.0, KANWA)} />,
    );
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    const skala = (): number => Number(svg.getAttribute('data-skala-kamery'));
    const poziom = (): string | null => svg.getAttribute('data-poziom-szczegolu');
    const doSkali = (cel: number): void => {
      fireEvent.wheel(svg, { clientX: KANWA.width / 2, clientY: KANWA.height / 2, deltaY: -Math.log(cel / skala()) / WHEEL_ZOOM_SENSITIVITY });
    };
    expect(poziom()).toBe('LOD2');
    const g = SKALA_WNETRZA_POL;
    doSkali(g * (1 - p / 2));
    expect(skala()).toBeLessThan(g);
    expect(poziom(), 'w dół w paśmie — trzyma LOD2').toBe('LOD2');
    doSkali(g * (1 - p) * 0.98);
    expect(poziom(), 'w dół za pasmem — LOD1').toBe('LOD1');
    doSkali(g * (1 + p / 2));
    expect(skala()).toBeGreaterThan(g);
    expect(poziom(), 'w górę w paśmie — trzyma LOD1').toBe('LOD1');
    // Ten sam poziom niesie rysunek: aparat bez wnętrza.
    expect(svg.querySelectorAll('[data-testid="sld-v3-symbols"] [data-bez-wnetrza]').length).toBeGreaterThan(0);
    doSkali(g * (1 + p) * 1.02);
    expect(poziom(), 'w górę za pasmem — LOD2').toBe('LOD2');
    expect(svg.querySelectorAll('[data-testid="sld-v3-symbols"] [data-bez-wnetrza]').length).toBe(0);
  }, 120000);
});

describe('kadr stacji z wnętrzem × zasłona nawigatora', () => {
  const scene = buildSceneV3(enmGpz);
  const wynik = zakresCelu('stacja', enmGpz, [STACJA], scene);
  const zakres = (wynik as { readonly zakres?: Parameters<typeof prostokatyZakresu>[1] }).zakres!;
  const cel = prostokatyZakresu(scene, zakres, sceneBoxToCameraWorld).cel!;
  const w = cel.maxX - cel.minX;
  const PAD = 80;
  const WYS = 4000;
  // Szerokość kanwy dobrana do wariantu: [szerokość kanwy, zasłona nawigatora z prawej].
  const F = SKALA_PODLOGI_ROZDZIELNICY;
  const WARIANTY = [
    { nazwa: 'nawigator nie zasłania podłogi', szer: (F + 0.2) * w + PAD + 0.2 * w, zaslona: 0.2 * w, zwiniecie: false },
    { nazwa: 'nawigator spycha kadr pod podłogę wnętrza', szer: (F + 0.05) * w + PAD, zaslona: 0.2 * w, zwiniecie: true },
    { nazwa: 'obiekt za duży także bez nawigatora', szer: (F - 0.1) * w + PAD, zaslona: 0.1 * w, zwiniecie: false },
  ] as const;
  it('warunek sensu — cel kadru stacji ma szerokość', () => {
    expect(w).toBeGreaterThan(0);
  });
  for (const war of WARIANTY) {
    it(war.nazwa, () => {
      const zwin = vi.fn();
      const baza = { top: 0, right: 0, bottom: 0, left: 0 };
      const { container } = render(
        <SldCanvasV3
          snapshot={enmGpz}
          width={Math.round(war.szer)}
          height={WYS}
          safeInsets={{ ...baza, right: war.zaslona }}
          insetsBezNawigatora={baza}
          onZwinNawigatorDlaKadru={zwin}
          zadanieKadru={{ zakres, seq: 1 }}
        />,
      );
      const skala = Number(container.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('data-skala-kamery'));
      expect(zwin).toHaveBeenCalledTimes(war.zwiniecie ? 1 : 0);
      expect(skala, 'kadr obiektu z wnętrzem pól').toBeGreaterThanOrEqual(SKALA_PODLOGI_ROZDZIELNICY - 1e-4);
    }, 120000);
  }
});
