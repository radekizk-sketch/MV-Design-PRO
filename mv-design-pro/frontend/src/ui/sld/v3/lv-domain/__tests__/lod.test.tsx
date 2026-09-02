/**
 * POZIOMY SZCZEGÓŁOWOŚCI (LOD 0/1/2) na JEDNEJ geometrii (§2/§28) — dowód
 * klasy: [scenariusze o różnej topologii] × [3 poziomy]; porównywany jest
 * CAŁY rysunek toru (prymitywy nietekstowe każdej grupy węzła/krawędzi wraz
 * z geometrią, wzorem kreski i kolorem). Ukrycie DOWOLNEGO elementu toru na
 * przeglądzie albo druga geometria per poziom wywala ten plik na czerwono.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { scenariusz, type SlugScenariusza } from '../fixtures/scenariusze';
import { POZIOMY_LOD, REJESTR_ELEMENTOW_KANWY, type PoziomLod } from '../visualGrammar';

afterEach(cleanup);

const WARIANTY: readonly SlugScenariusza[] = [
  '02_two_tr_qbc_open',
  '03_two_tr_qbc_closed',
  '07_island_grid_following',
  '12_der_full_path',
  '14_sub_boards',
];

/**
 * ODCISK TORU: dla każdej grupy węzła/krawędzi TORU bierzemy jej znacznik po
 * usunięciu tekstów, podpowiedzi i pustych kontenerów etykiet. Zostaje to,
 * co jest torem i jego stanem: kreski, kropki zacisków, sylwetki aparatów
 * ze skalą, wzory kresek, kolory. Zabezpieczenia (`relay:`) są warstwą
 * TOŻSAMOŚCI (rejestr: `symbolZabezpieczenia`), nie torem — poza odciskiem.
 */
function odciskToru(container: HTMLElement): readonly string[] {
  const grupy = [...container.querySelectorAll('[data-testid^="lv-domain-node-"], [data-testid^="lv-domain-edge-"]')].filter(
    (g) => !(g.getAttribute('data-testid') ?? '').includes('relay:'),
  );
  return grupy
    .map((grupa) => {
      const kopia = grupa.cloneNode(true) as Element;
      kopia.querySelectorAll('text, title').forEach((t) => t.remove());
      for (let i = 0; i < 4; i += 1) kopia.querySelectorAll('g').forEach((g) => { if (!g.hasChildNodes()) g.remove(); });
      return `${grupa.getAttribute('data-testid')}|${kopia.outerHTML}`;
    })
    .sort();
}

function renderNaPoziomie(slug: SlugScenariusza, lod: PoziomLod, overlay: 'swz' | 'shortCircuit' | null = null): HTMLElement {
  const { container } = render(<LvDomainView projection={scenariusz(slug)} lod={lod} width={1400} height={1000} initialOverlay={overlay} />);
  return container;
}

function tekstKanwy(): string {
  return [...screen.getByTestId('lv-domain-view-root').querySelectorAll('svg text')].map((t) => t.textContent ?? '').join('\n');
}

describe('LOD — CIĄGŁOŚĆ TORU: rysunek sieci identyczny na poziomach 0/1/2', () => {
  for (const slug of WARIANTY) {
    const odciski = new Map<PoziomLod, readonly string[]>();
    for (const lod of POZIOMY_LOD) {
      odciski.set(lod, odciskToru(renderNaPoziomie(slug, lod)));
      cleanup();
    }
    it(`[${slug}] odcisk toru na przeglądzie i poziomie sieci == odcisk na poziomie pełnym; odcisk niepusty`, () => {
      expect(odciski.get(0)).toEqual(odciski.get(2));
      expect(odciski.get(1)).toEqual(odciski.get(2));
      expect((odciski.get(2) ?? []).length).toBeGreaterThan(8);
    });
  }
});

describe('LOD — tabela warstw: co znika, co zostaje', () => {
  it('[12] poziom pełny: tabliczka TR, nazwy aparatów, napięcie sekcji, przekładniki, zabezpieczenia, słowo stanu', () => {
    renderNaPoziomie('12_der_full_path', 2);
    const t = tekstKanwy();
    expect(t).toContain('630 kVA');
    expect(t).toContain('QF-G1');
    expect(t).toContain('0,4 kV');
    expect(t).toContain('CT-T1');
    expect(screen.getByTestId('lv-domain-node-relay:REL-T1').querySelector('g[data-symbol-canon="protectionRelay"]')).not.toBeNull();
  });

  it('[12] poziom sieci: nazwy tożsamości zostają, opisy drugorzędne znikają', () => {
    renderNaPoziomie('12_der_full_path', 1);
    const t = tekstKanwy();
    expect(t).toContain('QF-G1');
    expect(t).toContain('T1');
    expect(t).not.toContain('630 kVA');
    expect(t).not.toContain('CT-T1');
    expect(t).not.toContain('0,4 kV');
  });

  it('[15] przegląd: zostaje nazwa sekcji i LICZBA odpływów; nazwy aparatów i odbiorów znikają; symbole i kreski zostają', () => {
    renderNaPoziomie('15_many_feeders', 0);
    const t = tekstKanwy();
    expect(t).toContain('Rozdzielnica główna nN');
    expect(screen.getByTestId('lv-domain-bus-licznik-RGnN-1').textContent).toContain('12 odpływów');
    expect(t).not.toContain('QF-01');
    expect(t).not.toContain('Kotłownia');
    expect(document.querySelectorAll('g[data-symbol-canon="nnBreaker"]').length).toBeGreaterThanOrEqual(13);
  });

  it('[15] licznik odpływów istnieje WYŁĄCZNIE na przeglądzie', () => {
    renderNaPoziomie('15_many_feeders', 1);
    expect(screen.queryByTestId('lv-domain-bus-licznik-RGnN-1')).toBeNull();
  });

  it('[02] stan sprzęgła OTWARTE: glif pusty na każdym poziomie, słowo OTWARTY tylko na pełnym', () => {
    for (const lod of POZIOMY_LOD) {
      renderNaPoziomie('02_two_tr_qbc_open', lod);
      expect(screen.getByTestId('lv-domain-node-QBC')).toHaveAttribute('data-device-state', 'OPEN');
      expect(screen.getByTestId('lv-domain-node-QBC').querySelector('g[data-symbol-canon="nnBreaker"]')).not.toBeNull();
      if (lod === 2) expect(screen.getByTestId('lv-domain-stan-QBC').textContent).toBe('OTWARTY');
      else expect(screen.queryByTestId('lv-domain-stan-QBC')).toBeNull();
      cleanup();
    }
  });

  it('[07]/[10] stan zasilania i wyspa są oznaczone na KAŻDYM poziomie (stan ruchowy, nie opis)', () => {
    for (const lod of POZIOMY_LOD) {
      renderNaPoziomie('07_island_grid_following', lod);
      expect(screen.getByTestId('lv-domain-bus-stan-RGN-D_szyna').textContent).toContain('NIEZASILONA');
      expect(screen.getByTestId('lv-domain-bus-wyspa-RGN-D_szyna').textContent).toContain('WYSPA');
      expect(screen.getByTestId('lv-domain-result-freshness')).toBeInTheDocument();
      cleanup();
    }
  });

  it('[18] nakładka SWZ: plakietka liczbowa na poziomach sieci/pełnym, kropka werdyktu na przeglądzie — werdykt NIGDY nie znika', () => {
    renderNaPoziomie('18_swz_overlay', 0, 'swz');
    expect(screen.getByTestId('lv-domain-verdict-swz-QF-02')).toHaveAttribute('data-swz-status', 'nie spełnia');
    expect(screen.queryByTestId('lv-domain-badge-swz-QF-02')).toBeNull();
    cleanup();
    for (const lod of [1, 2] as const) {
      renderNaPoziomie('18_swz_overlay', lod, 'swz');
      expect(screen.getByTestId('lv-domain-badge-swz-QF-02').textContent).toContain('61 A');
      expect(screen.queryByTestId('lv-domain-verdict-swz-QF-02')).toBeNull();
      cleanup();
    }
  });

  it('korzeń widoku publikuje poziom; brak propu = poziom pełny', () => {
    renderNaPoziomie('01_single_tr', 1);
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-lod', '1');
    cleanup();
    render(<LvDomainView projection={scenariusz('01_single_tr')} width={1400} height={1000} />);
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-lod', '2');
  });
});

describe('LOD — rejestr jest JEDYNYM źródłem klasyfikacji (deklaracja z przypiętym testem)', () => {
  const katalog = path.join(__dirname, '..');
  const zrodloWidoku = fs.readFileSync(path.join(katalog, 'LvDomainView.tsx'), 'utf8');
  const zrodloKompozytora = fs.readFileSync(path.join(katalog, 'composeLvDomainScene.ts'), 'utf8');
  const bezKomentarzy = (z: string): string => z.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('każdy klucz rejestru jest REALNIE użyty w rendererze (zero martwej klasyfikacji)', () => {
    for (const kind of Object.keys(REJESTR_ELEMENTOW_KANWY)) {
      expect(zrodloWidoku.includes(`'${kind}'`), `klucz ${kind} nieużywany`).toBe(true);
    }
  });

  it('renderer NIE porównuje poziomu punktowo — filtr ma dokładnie JEDNO wyprowadzenie', () => {
    const kod = bezKomentarzy(zrodloWidoku);
    expect(kod.match(/\blod\s*(===|!==|<|>|<=|>=)/g)).toBeNull();
    expect(kod.match(/\blod\s*\?\s/g)).toBeNull();
    expect((kod.match(/widocznyNaLod\(/g) ?? []).length).toBe(1);
  });

  it('kompozytor sceny NIE ZNA poziomu szczegółowości (jedna geometria na wszystkie poziomy)', () => {
    expect(bezKomentarzy(zrodloKompozytora).match(/\blod\b/i)).toBeNull();
  });
});
