/**
 * POZIOMY SZCZEGÓŁOWOŚCI PROJEKCJI nN (LOD 0/1/2) — dowód klasy, nie
 * przykładu (reguła KLASA-NIE-INSTANCJA, CLAUDE.md).
 *
 * Twarde wymaganie właściciela: każda projekcja ma własny LOD na JEDNEJ
 * geometrii, a poziom NIGDY nie ukrywa rzeczywistej drogi prądu,
 * transformatora, istotnej aparatury, stanów łączeniowych, punktów
 * normalnie otwartych, źródeł, odbiorów ani granic domen.
 *
 * Dlatego dowód jest ILOCZYNEM CECH: [4 warianty topologii: dwie sekcje ze
 * sprzęgłem zamkniętym × to samo ze sprzęgłem otwartym × rozdzielnica z
 * incomerem i pełnym torem odpływów × energizacja z wyspą DER] × [3 poziomy]
 * — i porównuje CAŁY rysunek toru (wszystkie prymitywy nietekstowe każdej
 * grupy węzła/krawędzi wraz z geometrią, wzorem kreski i kolorem), a nie
 * wybrane elementy, które ktoś przewidział.
 *
 * Test negatywny (iniekcja wykonawcy, przywrócona po pomiarze): ukrycie
 * DOWOLNEGO elementu toru na przeglądzie albo policzenie drugiej geometrii
 * per poziom wywala ten plik na czerwono.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { buildLvDomainProjectionFixture } from '../fixtures/projectionFixture';
import { ISLAND_DOMAIN_PROJECTION, ISLAND_DOMAIN_REFS } from '../fixtures/islandDomain';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_PROJECTION, MULTI_SOURCE_UPSTREAM_EQUIVALENTS } from '../fixtures/multiSourceDomain';
import { STATION_BOARD_PROJECTION, STATION_BOARD_REFS } from '../fixtures/stationBoardDomain';
import {
  POZIOMY_LOD,
  REJESTR_ELEMENTOW_KANWY,
  elementyToru,
  warstwaElementu,
  widocznyNaLod,
  type ElementKanwyNn,
  type PoziomLod,
} from '../visualGrammar';
import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import type { SwzOverlayEntry } from '../../canvas/overlay';
import type { LvDomainProjectionV1 } from '../types';

const MULTI_QBC_OPEN = buildLvDomainProjectionFixture({
  graph: {
    ...MULTI_SOURCE_DOMAIN_VIEW,
    branches: MULTI_SOURCE_DOMAIN_VIEW.branches.map((b) => (b.ref_id === 'coupler' ? { ...b, status: 'open' as const } : b)),
  },
  upstreamEquivalents: MULTI_SOURCE_UPSTREAM_EQUIVALENTS,
});

const WARIANTY: readonly { readonly nazwa: string; readonly projection: LvDomainProjectionV1 }[] = [
  { nazwa: 'dwie sekcje, sprzęgło zamknięte', projection: MULTI_SOURCE_PROJECTION },
  { nazwa: 'dwie sekcje, sprzęgło otwarte', projection: MULTI_QBC_OPEN },
  { nazwa: 'rozdzielnica z incomerem i pełnym torem odpływów', projection: STATION_BOARD_PROJECTION },
  { nazwa: 'energizacja i wyspa DER', projection: ISLAND_DOMAIN_PROJECTION },
];

/**
 * ODCISK TORU: dla każdej grupy węzła/krawędzi bierzemy jej pełny znacznik
 * PO USUNIĘCIU wszystkich elementów tekstowych. Zostaje dokładnie to, co
 * jest torem i jego stanem: kreski, kropki zacisków, sylwetki aparatów wraz
 * z transformacjami skali, wzory kresek (stan łącznika), kolory (stan
 * zasilania), groty referencji granicznych. Porównanie tego odcisku między
 * poziomami jest dowodem, że LOD nie rusza rysunku sieci — a nie że nie
 * ruszył trzech elementów wybranych przez autora testu.
 */
function odciskToru(container: HTMLElement): readonly string[] {
  const grupy = [...container.querySelectorAll('[data-testid^="lv-domain-node-"], [data-testid^="lv-domain-edge-"]')];
  return grupy
    .map((grupa) => {
      const kopia = grupa.cloneNode(true) as Element;
      kopia.querySelectorAll('text').forEach((tekst) => tekst.remove());
      return `${grupa.getAttribute('data-testid')}|${kopia.outerHTML}`;
    })
    .sort();
}

function renderNaPoziomie(projection: LvDomainProjectionV1, lod: PoziomLod): HTMLElement {
  const { container } = render(<LvDomainView projection={projection} lod={lod} width={1400} height={1000} />);
  return container;
}

/**
 * Tekst REALNIE narysowany na kanwie: wyłącznie elementy `<text>`. Świadomie
 * NIE `textContent` korzenia — ten wciąga `<title>` (podpowiedź hover, nie
 * rysunek) i chrom nagłówka, przez co „nazwa aparatu zniknęła z rysunku"
 * dałoby się pomylić z „nazwa aparatu jest w podpowiedzi".
 */
function tekstKanwy(): string {
  const root = screen.getByTestId('lv-domain-view-root');
  return [...root.querySelectorAll('text')].map((element) => element.textContent ?? '').join('\n');
}

/** Sama treść licznika odpływów sekcji (bez separatora linii nazwy). */
function licznikSekcji(busRef: string): string {
  return (screen.getByTestId(`lv-domain-bus-licznik-${busRef}`).textContent ?? '').replace(/^\s*·\s*/, '').trim();
}

describe('LOD nN — CIĄGŁOŚĆ TORU: rysunek sieci jest IDENTYCZNY na poziomach 0/1/2', () => {
  for (const wariant of WARIANTY) {
    const odciski = new Map<PoziomLod, readonly string[]>();
    for (const lod of POZIOMY_LOD) {
      const container = renderNaPoziomie(wariant.projection, lod);
      odciski.set(lod, odciskToru(container));
      cleanup();
    }

    it(`[${wariant.nazwa}] odcisk toru na przeglądzie == odcisk na poziomie pełnym`, () => {
      expect(odciski.get(0)).toEqual(odciski.get(2));
    });

    it(`[${wariant.nazwa}] odcisk toru na poziomie sieci == odcisk na poziomie pełnym`, () => {
      expect(odciski.get(1)).toEqual(odciski.get(2));
    });

    it(`[${wariant.nazwa}] odcisk jest NIEPUSTY (pusty rysunek = pusta wyrocznia = fałszywa zieleń)`, () => {
      expect((odciski.get(2) ?? []).length).toBeGreaterThan(5);
    });

    it(`[${wariant.nazwa}] zbiór węzłów i krawędzi sceny identyczny na wszystkich poziomach`, () => {
      const idsNaPoziomie = (lod: PoziomLod): readonly string[] =>
        (odciski.get(lod) ?? []).map((wpis) => wpis.split('|')[0]).sort();
      expect(idsNaPoziomie(0)).toEqual(idsNaPoziomie(2));
      expect(idsNaPoziomie(1)).toEqual(idsNaPoziomie(2));
    });
  }
});

describe('LOD nN — TABELA WARSTW: co znika, a co zostaje na każdym poziomie', () => {
  const refs = STATION_BOARD_REFS;

  it('poziom pełny: tabliczka transformatora, nazwa aparatu, napięcie szyny, słowo stanu, parametry kotwicy', () => {
    renderNaPoziomie(STATION_BOARD_PROJECTION, 2);
    const tekst = tekstKanwy();
    expect(tekst).toContain('630 kVA');
    expect(tekst).toContain('uk = 4%');
    expect(tekst).toContain('QF-01');
    // Napięcie szyny doklejone do jej nazwy (separator gramatyki etykiet) —
    // NIE samo „0,4 kV", bo tę frazę niesie także nazwa własna rozdzielnicy
    // w fixturze (asercja na samym „0,4 kV" byłaby zawsze zielona).
    expect(tekst).toContain('·  0,4 kV');
    expect(tekst).toContain('Sk″');
    expect(tekst).toContain('SN 15 kV');
    cleanup();
  });

  it('poziom sieci: nazwy tożsamości ZOSTAJĄ, opisy drugorzędne ZNIKAJĄ', () => {
    renderNaPoziomie(STATION_BOARD_PROJECTION, 1);
    const tekst = tekstKanwy();
    // Tożsamość (nazwy sekcji/odpływów/źródeł/odbiorów) — zostaje.
    expect(tekst).toContain('QF-01');
    expect(tekst).toContain('RGNN-1');
    expect(tekst).toContain('T1');
    expect(tekst).toContain('PV1');
    expect(tekst).toContain('Odbiór-1');
    expect(tekst).toContain('SN 15 kV');
    // Opis (parametry) — znika.
    expect(tekst).not.toContain('630 kVA');
    expect(tekst).not.toContain('uk = 4%');
    expect(tekst).not.toContain('Dyn5');
    expect(tekst).not.toContain('·  0,4 kV');
    expect(tekst).not.toContain('Sk″');
    cleanup();
  });

  it('przegląd: zostaje nazwa sekcji i LICZBA odpływów; nazwy aparatów/źródeł/odbiorów znikają', () => {
    renderNaPoziomie(STATION_BOARD_PROJECTION, 0);
    const tekst = tekstKanwy();
    expect(tekst).toContain('RGNN-1');
    expect(tekst).toContain('SN 15 kV');
    expect(licznikSekcji(refs.rgnn1BusRef)).toBe('3 odpływy');
    expect(tekst).not.toContain('QF-01');
    expect(tekst).not.toContain('Odbiór-1');
    expect(tekst).not.toContain('630 kVA');
    cleanup();
  });

  it('licznik odpływów istnieje WYŁĄCZNIE na przeglądzie (od poziomu sieci każdy odpływ ma własną nazwę)', () => {
    for (const lod of [1, 2] as const) {
      renderNaPoziomie(STATION_BOARD_PROJECTION, lod);
      expect(screen.queryByTestId(`lv-domain-bus-licznik-${refs.rgnn1BusRef}`)).toBeNull();
      cleanup();
    }
  });

  it('odmiana licznika odpływów jest poprawna po polsku dla różnych liczebności sekcji', () => {
    // Sekcja z jednym kikutem (podrozdzielnica RGN-2: jeden odpływ do odbioru)
    // i sekcja z trzema (RGNN-1) — dwie różne formy w jednym rysunku.
    renderNaPoziomie(STATION_BOARD_PROJECTION, 0);
    expect(licznikSekcji(refs.rgn2BusRef)).toBe('1 odpływ');
    expect(licznikSekcji(refs.rgnn1BusRef)).toBe('3 odpływy');
    cleanup();
  });

  it('nazwy zacisków modelu (tryb audytu topologii) są dostępne WYŁĄCZNIE na poziomie pełnym', () => {
    for (const lod of POZIOMY_LOD) {
      renderNaPoziomie(STATION_BOARD_PROJECTION, lod);
      fireEvent.click(screen.getByTestId('lv-domain-labelmode-audit'));
      const zacisk = screen.getByTestId(`lv-domain-node-${refs.qf01OutBusRef}`);
      const teksty = [...zacisk.querySelectorAll('text')].map((t) => t.textContent);
      if (lod === 2) {
        expect(teksty).toContain('QF-01 zacisk wyjściowy');
      } else {
        expect(teksty).toEqual([]);
      }
      cleanup();
    }
  });

  it('granica domeny: terminal, kabel i strzałka na każdym poziomie; nazwa stacji docelowej także (to nazwa STACJI)', () => {
    for (const lod of POZIOMY_LOD) {
      renderNaPoziomie(MULTI_SOURCE_PROJECTION, lod);
      expect(screen.getByTestId('lv-domain-node-boundary-terminal:tie_to_other').querySelector('circle')).not.toBeNull();
      expect(screen.getByTestId('lv-domain-edge-boundary:tie_to_other#link').querySelector('path')).not.toBeNull();
      expect(screen.getByTestId('lv-domain-node-boundary:tie_to_other').textContent).toContain('Stacja OBCA');
      cleanup();
    }
  });

  it('stan łączeniowy sprzęgła (OTWARTE) widoczny SYMBOLEM na każdym poziomie; samo SŁOWO tylko na pełnym', () => {
    for (const lod of POZIOMY_LOD) {
      renderNaPoziomie(MULTI_QBC_OPEN, lod);
      const coupler = screen.getByTestId('lv-domain-node-coupler');
      expect(coupler.querySelector('g[data-symbol-canon="nnBreaker"] rect')?.getAttribute('fill')).toBe('none');
      const kikuty = [...screen.getByTestId('lv-domain-edge-coupler').querySelectorAll('line')];
      expect(kikuty.length).toBe(2);
      for (const kikut of kikuty) expect(kikut.getAttribute('stroke-dasharray')).not.toBeNull();
      const slowo = [...coupler.querySelectorAll('text')].map((t) => t.textContent);
      expect(slowo.includes('OTWARTE')).toBe(lod === 2);
      cleanup();
    }
  });

  it('status wyniku (tożsamość wyniku) jest jawny na KAŻDYM poziomie', () => {
    for (const lod of POZIOMY_LOD) {
      renderNaPoziomie(MULTI_SOURCE_PROJECTION, lod);
      expect(screen.getByTestId('lv-domain-result-freshness')).toHaveAttribute('data-result-status', 'NONE');
      cleanup();
    }
  });

  it('korzeń widoku publikuje poziom szczegółowości (styk dla wpięcia nawigacji i zrzutów)', () => {
    renderNaPoziomie(MULTI_SOURCE_PROJECTION, 0);
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-lod', '0');
    cleanup();
    renderNaPoziomie(MULTI_SOURCE_PROJECTION, 2);
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-lod', '2');
    cleanup();
  });

  it('brak propu = poziom pełny (domyślny), zgodnie z kontraktem komponentu', () => {
    render(<LvDomainView projection={STATION_BOARD_PROJECTION} width={1400} height={1000} />);
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-lod', '2');
    expect(tekstKanwy()).toContain('630 kVA');
  });
});

describe('LOD nN — NAKŁADKI WYNIKÓW: na przeglądzie kropka werdyktu zamiast plakietki, NIGDY brak wyniku', () => {
  const refs = STATION_BOARD_REFS;
  const swzEntry: SwzOverlayEntry = {
    ownerRef: refs.qf01Ref,
    status: 'nie spełnia',
    przyczynaPl: 'Ik1min poniżej progu wyłączenia w czasie wymaganym.',
    ik1MinA: 96,
    iaWymaganeA: 250,
    tWymaganyS: 0.4,
    margines: -0.62,
  };
  const swzProjection = buildLvDomainProjectionFixture({
    graph: STATION_BOARD_PROJECTION.graph,
    upstreamEquivalents: STATION_BOARD_PROJECTION.upstream_equivalents,
    swzByFeederRef: { [refs.qf01Ref]: swzEntry },
  });
  const scPayload: RawOverlayPayload = {
    run_id: 'bieg-lod',
    analysis_type: 'sc_3f',
    elements: {
      [refs.rgnn1BusRef]: {
        ref_id: refs.rgnn1BusRef,
        kind: 'bus',
        badges: [],
        severity: 'CRITICAL',
        metrics: { IK_3F_A: { code: 'IK_3F_A', value: 8400, unit: 'A' } },
      },
    },
  };
  const scProjection = buildLvDomainProjectionFixture({
    graph: STATION_BOARD_PROJECTION.graph,
    upstreamEquivalents: STATION_BOARD_PROJECTION.upstream_equivalents,
    resultOverlayPayload: scPayload,
  });
  const vdProjection = buildLvDomainProjectionFixture({
    graph: STATION_BOARD_PROJECTION.graph,
    upstreamEquivalents: STATION_BOARD_PROJECTION.upstream_equivalents,
    voltageProfileByBusRef: { [refs.rgnn1BusRef]: { bus_id: refs.rgnn1BusRef, delta_pct: -3.42 } },
  });

  it('SWZ: plakietka liczbowa na poziomach sieci/pełnym, kropka werdyktu na przeglądzie (werdykt zachowany)', () => {
    for (const lod of POZIOMY_LOD) {
      render(<LvDomainView projection={swzProjection} lod={lod} initialOverlay="swz" width={1400} height={1000} />);
      if (lod === 0) {
        const kropka = screen.getByTestId(`lv-domain-verdict-swz-${refs.qf01Ref}`);
        expect(kropka).toHaveAttribute('data-swz-status', 'nie spełnia');
        expect(screen.queryByTestId(`lv-domain-badge-swz-${refs.qf01Ref}`)).toBeNull();
      } else {
        expect(screen.getByTestId(`lv-domain-badge-swz-${refs.qf01Ref}`).textContent).toContain('96');
        expect(screen.queryByTestId(`lv-domain-verdict-swz-${refs.qf01Ref}`)).toBeNull();
      }
      cleanup();
    }
  });

  it('zwarcia: liczba na poziomach sieci/pełnym, kropka na przeglądzie (ton z severity backendu, zero progu w interfejsie)', () => {
    for (const lod of POZIOMY_LOD) {
      render(<LvDomainView projection={scProjection} lod={lod} initialOverlay="shortCircuit" width={1400} height={1000} />);
      if (lod === 0) {
        expect(screen.getByTestId(`lv-domain-verdict-shortCircuit-${refs.rgnn1BusRef}`)).toBeTruthy();
        expect(screen.queryByTestId(`lv-domain-badge-shortCircuit-${refs.rgnn1BusRef}`)).toBeNull();
      } else {
        expect(screen.getByTestId(`lv-domain-badge-shortCircuit-${refs.rgnn1BusRef}`).textContent).toContain('8400');
        expect(screen.queryByTestId(`lv-domain-verdict-shortCircuit-${refs.rgnn1BusRef}`)).toBeNull();
      }
      cleanup();
    }
  });

  it('spadki napięcia: liczba na poziomach sieci/pełnym, kropka obecności wyniku na przeglądzie', () => {
    for (const lod of POZIOMY_LOD) {
      render(<LvDomainView projection={vdProjection} lod={lod} initialOverlay="voltageDrop" width={1400} height={1000} />);
      if (lod === 0) {
        expect(screen.getByTestId(`lv-domain-verdict-voltageDrop-${refs.rgnn1BusRef}`)).toBeTruthy();
        expect(screen.queryByTestId(`lv-domain-badge-voltageDrop-${refs.rgnn1BusRef}`)).toBeNull();
      } else {
        expect(screen.getByTestId(`lv-domain-badge-voltageDrop-${refs.rgnn1BusRef}`).textContent).toContain('-3.42');
        expect(screen.queryByTestId(`lv-domain-verdict-voltageDrop-${refs.rgnn1BusRef}`)).toBeNull();
      }
      cleanup();
    }
  });
});

describe('LOD nN — REJESTR jest JEDYNYM źródłem klasyfikacji (deklaracja z przypiętym testem)', () => {
  const katalogModulu = path.join(__dirname, '..');
  const zrodloWidoku = fs.readFileSync(path.join(katalogModulu, 'LvDomainView.tsx'), 'utf8');
  const zrodloKompozytora = fs.readFileSync(path.join(katalogModulu, 'composeLvDomainScene.ts'), 'utf8');

  function bezKomentarzy(zrodlo: string): string {
    return zrodlo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  it('każdy element warstwy TOR jest widoczny na WSZYSTKICH poziomach (zakaz ukrywania drogi prądu)', () => {
    for (const kind of elementyToru()) {
      for (const lod of POZIOMY_LOD) {
        expect(widocznyNaLod(kind, lod), `${kind} zniknął na poziomie ${lod}`).toBe(true);
      }
    }
  });

  it('każdy element warstwy OPIS żyje WYŁĄCZNIE na poziomie pełnym', () => {
    const opisy = (Object.keys(REJESTR_ELEMENTOW_KANWY) as ElementKanwyNn[]).filter((k) => warstwaElementu(k) === 'opis');
    expect(opisy.length).toBeGreaterThan(0);
    for (const kind of opisy) {
      expect(REJESTR_ELEMENTOW_KANWY[kind].lody, kind).toEqual([2]);
    }
  });

  it('każdy element warstwy TOZSAMOSC ma niepusty, sensowny zasięg poziomów', () => {
    const tozsamosci = (Object.keys(REJESTR_ELEMENTOW_KANWY) as ElementKanwyNn[]).filter(
      (k) => warstwaElementu(k) === 'tozsamosc',
    );
    expect(tozsamosci.length).toBeGreaterThan(0);
    for (const kind of tozsamosci) {
      const lody = REJESTR_ELEMENTOW_KANWY[kind].lody;
      expect(lody.length, kind).toBeGreaterThan(0);
      for (const lod of lody) expect(POZIOMY_LOD).toContain(lod);
    }
  });

  it('każdy wpis rejestru niesie UZASADNIENIE (klasyfikacja bez powodu jest zgadywaniem)', () => {
    for (const [kind, wpis] of Object.entries(REJESTR_ELEMENTOW_KANWY)) {
      expect(wpis.powod.length, kind).toBeGreaterThan(20);
    }
  });

  it('każdy klucz rejestru jest REALNIE użyty w rendererze (zero martwej klasyfikacji)', () => {
    for (const kind of Object.keys(REJESTR_ELEMENTOW_KANWY)) {
      expect(zrodloWidoku.includes(`'${kind}'`), `klucz ${kind} nieużywany w rendererze`).toBe(true);
    }
  });

  it('renderer NIE porównuje poziomu punktowo — filtr ma dokładnie JEDNO wyprowadzenie', () => {
    const kod = bezKomentarzy(zrodloWidoku);
    expect(kod.match(/\blod\s*(===|!==|<|>|<=|>=)/g)).toBeNull();
    // Trójargumentowy warunek na poziomie (`lod ? … : …`). Deklaracja pola
    // opcjonalnego `lod?:` (bez spacji po znaku zapytania) NIE jest
    // porównaniem — kontrakt propu ma prawo istnieć.
    expect(kod.match(/\blod\s*\?\s/g)).toBeNull();
    expect((kod.match(/widocznyNaLod\(/g) ?? []).length).toBe(1);
  });

  it('kompozytor sceny NIE ZNA poziomu szczegółowości (jedna geometria na wszystkie poziomy)', () => {
    const kod = bezKomentarzy(zrodloKompozytora);
    expect(kod.match(/\blod\b/i)).toBeNull();
  });
});

describe('LOD nN — energizacja i wyspy pozostają widoczne na KAŻDYM poziomie (stan ruchowy, nie opis)', () => {
  const refs = ISLAND_DOMAIN_REFS;

  it('szyna bez napięcia i wyspa DER są oznaczone na wszystkich poziomach', () => {
    for (const lod of POZIOMY_LOD) {
      renderNaPoziomie(ISLAND_DOMAIN_PROJECTION, lod);
      expect(screen.getByTestId(`lv-domain-bus-bez-napiecia-${refs.podrozdzielniaCBusRef}`).textContent).toContain('bez napięcia');
      expect(screen.getByTestId(`lv-domain-bus-wyspa-der-${refs.podrozdzielniaDBusRef}`).textContent).toContain('wyspa DER');
      cleanup();
    }
  });
});
