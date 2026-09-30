/**
 * ENERGIZACJA NA KANWIE (§5/§6/§7/§14–§17/§26) — testy obowiązkowe §46:
 * otwarty wyłącznik (strona górna/dolna), energizacja dwustronna, sprzęgło
 * otwarte/zamknięte, wyspa podążająca vs tworząca napięcie, wspólne źródło
 * nieduplikowane, zasilanie wielostronne, konflikt, stan nieznany, świeżość
 * wyniku, tryb mono. Każdy fakt jest CZYTANY z projekcji backendu i musi
 * mieć w DOM nośnik geometryczny (atrybut/wzór kreski/etykieta), nie tylko
 * kolor.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { scenariusz, type SlugScenariusza } from '../fixtures/scenariusze';
import { etykietaStanuZasilania, paletaMono } from '../visualGrammar';

afterEach(cleanup);

function renderuj(slug: SlugScenariusza, props: Partial<Parameters<typeof LvDomainView>[0]> = {}): HTMLElement {
  const { container } = render(<LvDomainView projection={scenariusz(slug)} width={1400} height={1000} lod={2} theme="light_technical" {...props} />);
  return container;
}

function krawedz(ref: string): HTMLElement {
  return screen.getByTestId(`lv-domain-edge-${ref}`);
}

function kreska(ref: string): Element {
  const path = krawedz(ref).querySelector('path');
  if (!path) throw new Error(`krawędź ${ref} bez ścieżki`);
  return path;
}

describe('Otwarty wyłącznik — stan po obu stronach (§5)', () => {
  it('[10] QF-TB OTWARTY: kikut górny zasilony (ciągły), dolny bez napięcia (przerywany); sekcja RGnN-B NIEZASILONA (WG AKTUALNEJ TOPOLOGII)', () => {
    renderuj('10_deenergized_section');
    expect(krawedz('QF-TB#a')).toHaveAttribute('data-energization', 'ENERGIZED');
    expect(krawedz('QF-TB#b')).toHaveAttribute('data-energization', 'DEENERGIZED');
    expect(krawedz('QF-TB#a')).toHaveAttribute('data-connectivity', 'OPEN');
    expect(kreska('QF-TB#a').getAttribute('stroke-dasharray')).toBeNull();
    expect(kreska('QF-TB#b').getAttribute('stroke-dasharray')).not.toBeNull();
    expect(screen.getByTestId('lv-domain-node-QF-TB')).toHaveAttribute('data-device-state', 'OPEN');
    expect(screen.getByTestId('lv-domain-stan-QF-TB').textContent).toBe('OTWARTY');
    const sekcja = screen.getByTestId('lv-domain-node-RGnN-B');
    expect(sekcja).toHaveAttribute('data-energization', 'DEENERGIZED');
    expect(screen.getByTestId('lv-domain-bus-stan-RGnN-B').textContent).toBe(etykietaStanuZasilania('DEENERGIZED'));
    expect(sekcja.querySelector('line')?.getAttribute('stroke-dasharray')).not.toBeNull();
    // Odpływy martwej sekcji dziedziczą stan (oba kikuty), sekcja A pozostaje zasilona.
    expect(krawedz('QF-B1#a')).toHaveAttribute('data-energization', 'DEENERGIZED');
    expect(krawedz('QF-B1#b')).toHaveAttribute('data-energization', 'DEENERGIZED');
    expect(screen.getByTestId('lv-domain-node-RGnN-A')).toHaveAttribute('data-energization', 'ENERGIZED');
    expect(screen.queryByTestId('lv-domain-bus-stan-RGnN-A')).toBeNull();
  });

  it('[11] energizacja DWUSTRONNA: QF-B3 otwarty, oba kikuty ENERGIZED z różnych wysp — żadna strona nie jest wygaszona', () => {
    renderuj('11_double_sided_open');
    expect(krawedz('QF-B3#a')).toHaveAttribute('data-energization', 'ENERGIZED');
    expect(krawedz('QF-B3#b')).toHaveAttribute('data-energization', 'ENERGIZED');
    expect(kreska('QF-B3#a').getAttribute('stroke-dasharray')).toBeNull();
    expect(kreska('QF-B3#b').getAttribute('stroke-dasharray')).toBeNull();
    expect(screen.getByTestId('lv-domain-node-QF-B3')).toHaveAttribute('data-device-state', 'OPEN');
    const podrozdzielnica = screen.getByTestId('lv-domain-node-RGN-C_szyna');
    expect(podrozdzielnica).toHaveAttribute('data-energization', 'ENERGIZED');
    expect(podrozdzielnica).toHaveAttribute('data-islanded', 'true');
    expect(screen.getByTestId('lv-domain-bus-wyspa-RGN-C_szyna').textContent).toContain('Magazyn C');
  });
});

describe('Sprzęgło sekcji QBC (§7) — aparat rzeczywisty, kikuty w stanach swoich zacisków', () => {
  it('[02] QBC OTWARTE: obie sekcje zasilone z własnych transformatorów; glif otwarty; oba kikuty sprzęgła zasilone (nic nie jest przyciemnione)', () => {
    renderuj('02_two_tr_qbc_open');
    expect(screen.getByTestId('lv-domain-node-QBC')).toHaveAttribute('data-device-role', 'coupler');
    expect(screen.getByTestId('lv-domain-node-QBC')).toHaveAttribute('data-device-state', 'OPEN');
    expect(screen.getByTestId('lv-domain-stan-QBC').textContent).toBe('OTWARTY');
    expect(krawedz('QBC#a')).toHaveAttribute('data-energization', 'ENERGIZED');
    expect(krawedz('QBC#b')).toHaveAttribute('data-energization', 'ENERGIZED');
    expect(screen.getByTestId('lv-domain-node-RGnN-A')).toHaveAttribute('data-energization', 'ENERGIZED');
    expect(screen.getByTestId('lv-domain-node-RGnN-B')).toHaveAttribute('data-energization', 'ENERGIZED');
    expect(screen.queryByTestId('lv-domain-bus-stan-RGnN-A')).toBeNull();
  });

  it('[03] QBC ZAMKNIĘTE: zasilanie WIELOSTRONNE wykryte przez backend i podpisane nazwami transformatorów na obu sekcjach', () => {
    renderuj('03_two_tr_qbc_closed');
    expect(screen.getByTestId('lv-domain-node-QBC')).toHaveAttribute('data-device-state', 'CLOSED');
    expect(screen.getByTestId('lv-domain-stan-QBC').textContent).toBe('ZAMKNIĘTY');
    for (const ref of ['RGnN-A', 'RGnN-B']) {
      expect(screen.getByTestId(`lv-domain-node-${ref}`)).toHaveAttribute('data-energization', 'MULTISOURCE');
      const stan = screen.getByTestId(`lv-domain-bus-stan-${ref}`).textContent ?? '';
      expect(stan).toContain(etykietaStanuZasilania('MULTISOURCE'));
      expect(stan).toContain('TA');
      expect(stan).toContain('TB');
    }
    expect(krawedz('QBC#a')).toHaveAttribute('data-energization', 'MULTISOURCE');
  });

  it('[06] KONFLIKT ŹRÓDEŁ: niezależne systemy SN spięte sprzęgłem — etykieta konfliktu, podwójna kreska, znacznik audytu NN-AUD-06', () => {
    renderuj('06_conflict_parallel_sources');
    for (const ref of ['RGnN-A', 'RGnN-B']) {
      const sekcja = screen.getByTestId(`lv-domain-node-${ref}`);
      expect(sekcja).toHaveAttribute('data-energization', 'CONFLICT');
      expect(screen.getByTestId(`lv-domain-bus-stan-${ref}`).textContent).toBe(etykietaStanuZasilania('CONFLICT'));
      expect(sekcja.querySelectorAll('line')).toHaveLength(2);
    }
    // Dwa komunikaty: konflikt (BLOCKER) + sprzęgło bez klasy funkcjonalnej
    // aparatu (INFO, NN-AUD-18 — symbol ogólny łącznika); znacznik „!" TYLKO
    // dla blokującego, informacja żyje w panelu.
    expect(screen.getByTestId('lv-domain-warnings-toggle').textContent).toBe('Audyt: 2');
    expect(screen.getByTestId('lv-domain-warnings-toggle')).toHaveAttribute('data-blockers', '1');
    expect(document.querySelectorAll('[data-testid^="lv-domain-warning-marker-"]')).toHaveLength(1);
    const sprzeglo = screen.getByTestId('lv-domain-node-QBC').querySelector('g[data-symbol-family="cad"]');
    expect(sprzeglo).toHaveAttribute('data-symbol-canon', 'cad.lacznik');
    expect(sprzeglo).toHaveAttribute('data-switch-state', 'closed');
    fireEvent.click(screen.getByTestId('lv-domain-warnings-toggle'));
    expect(screen.getByTestId('lv-domain-warning-NN-AUD-18')).toHaveAttribute('data-severity', 'INFO');
  });
});

describe('Wyspy (§14–§16) — zdolność źródła rozstrzyga o napięciu', () => {
  it('[07] PV podążające za siecią za otwartym rozłącznikiem: wyspa BEZ napięcia (wg topologii), etykieta wyspy, kreski przerywane', () => {
    renderuj('07_island_grid_following');
    const sekcja = screen.getByTestId('lv-domain-node-RGN-D_szyna');
    expect(sekcja).toHaveAttribute('data-energization', 'DEENERGIZED');
    expect(sekcja).toHaveAttribute('data-islanded', 'true');
    expect(screen.getByTestId('lv-domain-bus-stan-RGN-D_szyna').textContent).toBe(etykietaStanuZasilania('DEENERGIZED'));
    expect(screen.getByTestId('lv-domain-bus-wyspa-RGN-D_szyna').textContent).toContain('podążające za siecią');
    expect(screen.getByTestId('lv-domain-der-zdolnosc-QF-D1_zrodlo').textContent).toContain('grid-following');
    expect(krawedz('QS-D#b')).toHaveAttribute('data-energization', 'DEENERGIZED');
  });

  it('[08] magazyn tworzący napięcie: wyspa ZASILONA z nazwą źródła, N/PE bez odniesienia, bilans, dopuszczalność z danych; JEDEN znacznik na komunikat audytu', () => {
    renderuj('08_island_grid_forming');
    const sekcja = screen.getByTestId('lv-domain-node-RGN-D_szyna');
    expect(sekcja).toHaveAttribute('data-energization', 'ENERGIZED');
    expect(sekcja).toHaveAttribute('data-islanded', 'true');
    const wyspa = screen.getByTestId('lv-domain-bus-wyspa-RGN-D_szyna').textContent ?? '';
    expect(wyspa).toContain('WYSPA');
    expect(wyspa).toContain('Magazyn D');
    expect(wyspa).not.toContain('QF-D1_zrodlo');
    expect(wyspa).toContain('N/PE: brak odniesienia w wyspie');
    expect(wyspa).toContain('bilans: nadwyżka');
    expect(wyspa).toContain('praca wyspowa: niedopuszczalna');
    expect(screen.queryByTestId('lv-domain-bus-stan-RGN-D_szyna')).toBeNull();
    expect(screen.getByTestId('lv-domain-der-zdolnosc-QF-D1_zrodlo').textContent).toContain('grid-forming');
    // NN-AUD-08 wylicza sześć referencji — znacznik jest JEDEN, na szynie wyspy.
    const znaczniki = document.querySelectorAll('[data-testid^="lv-domain-warning-marker-"]');
    expect(znaczniki).toHaveLength(1);
    expect(znaczniki[0]).toHaveAttribute('data-testid', 'lv-domain-warning-marker-RGN-D_szyna');
    expect(znaczniki[0]).toHaveAttribute('data-severity', 'IMPORTANT');
  });

  it('[09] zdolność źródła NIEZNANA: stan zasilania nieznany — kreski kropkowane ze znakiem „?", etykieta stanu, audyt NN-AUD-14', () => {
    renderuj('09_island_unknown');
    const sekcja = screen.getByTestId('lv-domain-node-RGN-D_szyna');
    expect(sekcja).toHaveAttribute('data-energization', 'UNKNOWN');
    expect(screen.getByTestId('lv-domain-bus-stan-RGN-D_szyna').textContent).toBe(etykietaStanuZasilania('UNKNOWN'));
    expect(screen.getByTestId('lv-domain-bus-wyspa-RGN-D_szyna').textContent).toContain('nieznana');
    expect(krawedz('QS-D#b')).toHaveAttribute('data-energization', 'UNKNOWN');
    expect(krawedz('QS-D#b').textContent).toContain('?');
    expect(kreska('QS-D#b').getAttribute('stroke-dasharray')).not.toBe(kreska('QS-D#a').getAttribute('stroke-dasharray'));
    expect(screen.getByTestId('lv-domain-der-zdolnosc-QF-D1_zrodlo').textContent).toContain('nieznana');
  });

  it('wyspa nie jest „stanem nieznanym": ENERGIZED/DEENERGIZED/UNKNOWN wyspy dają trzy RÓŻNE komplety nośników', () => {
    const komplety = new Set<string>();
    for (const slug of ['07_island_grid_following', '08_island_grid_forming', '09_island_unknown'] as const) {
      renderuj(slug);
      const sekcja = screen.getByTestId('lv-domain-node-RGN-D_szyna');
      komplety.add(`${sekcja.getAttribute('data-energization')}|${sekcja.querySelector('line')?.getAttribute('stroke-dasharray') ?? 'ciągła'}|${screen.getByTestId('lv-domain-bus-wyspa-RGN-D_szyna').textContent}`);
      cleanup();
    }
    expect(komplety.size).toBe(3);
  });
});

describe('Tożsamość zasilania SN (§10/§11) — wspólne źródło NIE jest duplikowane', () => {
  it('[04] dwa transformatory z jednej szyny SN: JEDNA kotwica (data-shared) z nazwą GPZ; audyt NN-AUD-10 to INFORMACJA bez znacznika „!"', () => {
    renderuj('04_shared_upstream_boundary');
    const kotwice = document.querySelectorAll('[data-node-kind="anchorBar"]');
    expect(kotwice).toHaveLength(1);
    expect(kotwice[0]).toHaveAttribute('data-shared', 'true');
    expect(kotwice[0].textContent).toContain('GPZ Północ');
    expect(kotwice[0].textContent).toContain('wspólne zasilanie transformatorów');
    expect(document.querySelectorAll('[data-testid^="lv-domain-warning-marker-"]')).toHaveLength(0);
    expect(screen.getByTestId('lv-domain-node-boundary:QS-B9').textContent).toContain('Stacja OBCA');
  });

  it('[05] dwa NIEZALEŻNE systemy SN: dwie kotwice „system SN 1 z 2 / 2 z 2", każda z własnym równoważnikiem (Sk″ SN) po polsku', () => {
    // CV-4.3 K3b: każda kotwica liczy równoważnik ze SWOJEJ wyspy (do K3b: „brak danych").
    renderuj('05_independent_upstream');
    const kotwice = [...document.querySelectorAll('[data-node-kind="anchorBar"]')];
    expect(kotwice).toHaveLength(2);
    expect(kotwice.map((k) => k.getAttribute('data-shared'))).toEqual(['false', 'false']);
    expect(kotwice.map((k) => k.getAttribute('data-anchor-status'))).toEqual(['OK', 'OK']);
    const tekst = kotwice.map((k) => k.textContent).join('\n');
    expect(tekst).toContain('system SN 1 z 2');
    expect(tekst).toContain('system SN 2 z 2');
    expect(tekst).toContain('GPZ Północ');
    expect(tekst).toContain('GPZ Południe');
    expect(tekst).toContain('Sk″ SN');
    expect(tekst).not.toContain('brak danych');
    expect(tekst).not.toContain('upstream_network_topology_invalid');
  });
});

describe('Świeżość wyniku (§13/§19/§36) — NIEAKTUALNY jest pokazywany, nigdy ukrywany', () => {
  it('[16] po zmianie modelu: status NIEAKTUALNY w linii wyniku, plakietki ΔU z wartością i dopiskiem, audyt NN-AUD-13', () => {
    renderuj('16_stale_result', { initialOverlay: 'voltageDrop' });
    const swiezosc = screen.getByTestId('lv-domain-result-freshness');
    expect(swiezosc).toHaveAttribute('data-result-status', 'OUTDATED');
    expect(swiezosc.textContent).toContain('NIEAKTUALNY');
    expect(swiezosc.textContent).toContain('przebieg 16_stale_result');
    expect(screen.getByTestId('lv-domain-overlay-status').textContent).toContain('NIEAKTUALNE');
    const plakietka = screen.getByTestId('lv-domain-badge-voltageDrop-RGnN-1');
    expect(plakietka).toHaveAttribute('data-outdated', 'true');
    expect(plakietka.textContent).toContain('ΔU = 0,08 %');
    expect(plakietka.textContent).toContain('NIEAKTUALNY');
    expect(screen.getByTestId('lv-domain-badge-voltageDrop-RGN-2_szyna').textContent).toContain('-0,06 %');
    expect(screen.getByTestId('lv-domain-warnings-toggle').textContent).toContain('1');
  });

  it('[17] wynik świeży: status „aktualny", plakietki Ik″ z pochodzeniem (norma · przebieg · aktualny)', () => {
    renderuj('17_sc_results', { initialOverlay: 'shortCircuit' });
    expect(screen.getByTestId('lv-domain-result-freshness')).toHaveAttribute('data-result-status', 'FRESH');
    const plakietka = screen.getByTestId('lv-domain-badge-shortCircuit-RGnN-1');
    expect(plakietka).toHaveAttribute('data-outdated', 'false');
    expect(plakietka.textContent).toContain('Ik″3 = 23,75 kA');
    expect(plakietka.querySelector('[data-testid="lv-domain-provenance"]')?.textContent).toContain('IEC 60909');
    expect(plakietka.querySelector('[data-testid="lv-domain-provenance"]')?.textContent).toContain('aktualny');
  });

  it('[01] brak przebiegu: linia wyniku mówi „brak przebiegu", nakładka zwarć mówi „brak wyniku (uruchom przebieg)" — zero fabrykacji liczb', () => {
    renderuj('01_single_tr', { initialOverlay: 'shortCircuit' });
    expect(screen.getByTestId('lv-domain-result-freshness')).toHaveAttribute('data-result-status', 'NONE');
    expect(screen.getByTestId('lv-domain-overlay-status').textContent).toContain('brak wyniku');
    expect(document.querySelectorAll('[data-testid^="lv-domain-badge-"]')).toHaveLength(0);
    expect(screen.getByTestId('lv-domain-energization-basis').textContent).toContain('topologiczne');
  });
});

describe('Tryb MONO (§26/§44) — bez koloru żaden fakt nie znika', () => {
  it('[10] mono: sekcja bez napięcia ma wzór kreski i etykietę; otwarty wyłącznik ma pusty glif i słowo OTWARTY; paleta jednotuszowa', () => {
    renderuj('10_deenergized_section', { mono: true });
    const root = screen.getByTestId('lv-domain-view-root');
    expect(root).toHaveAttribute('data-mono', 'true');
    const mono = paletaMono();
    expect(screen.getByTestId('lv-domain-svg').querySelector('rect')?.getAttribute('fill')).toBe(mono.tlo);
    const sekcja = screen.getByTestId('lv-domain-node-RGnN-B');
    expect(sekcja.querySelector('line')?.getAttribute('stroke-dasharray')).not.toBeNull();
    expect(screen.getByTestId('lv-domain-bus-stan-RGnN-B').textContent).toContain('NIEZASILONA');
    expect(screen.getByTestId('lv-domain-stan-QF-TB').textContent).toBe('OTWARTY');
    expect(kreska('QF-TB#b').getAttribute('stroke-dasharray')).not.toBeNull();
    // Stan OTWARTY z GEOMETRII noża symbolu CAD (kąt przegubu ≠ 0), nie z
    // wypełnienia ani koloru — w mono ten sam rysunek co w kolorze.
    const symbol = screen.getByTestId('lv-domain-node-QF-TB').querySelector('g[data-symbol-canon="cad.wylacznik"]');
    expect(symbol).not.toBeNull();
    expect(symbol).toHaveAttribute('data-switch-state', 'open');
    expect(symbol?.querySelector('[data-cad="pivot"]')?.getAttribute('data-cad-deg')).not.toBe('0');
    expect(symbol?.querySelectorAll('[fill]:not([fill="none"])')).toHaveLength(0);
    for (const kreskaSymbolu of symbol?.querySelectorAll('line, path, circle') ?? []) {
      expect(kreskaSymbolu.getAttribute('stroke')).toBe(mono.kreskaBazowa);
    }
  });

  it('[06] mono: konflikt niesiony podwójną kreską i etykietą, nie czerwienią', () => {
    renderuj('06_conflict_parallel_sources', { mono: true });
    const sekcja = screen.getByTestId('lv-domain-node-RGnN-A');
    expect(sekcja.querySelectorAll('line')).toHaveLength(2);
    expect(screen.getByTestId('lv-domain-bus-stan-RGnN-A').textContent).toBe(etykietaStanuZasilania('CONFLICT'));
  });
});
