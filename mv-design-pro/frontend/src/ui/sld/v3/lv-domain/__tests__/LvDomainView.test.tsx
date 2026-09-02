/**
 * WIDOK DOMENY nN — nagłówek, nakładki wyników (§18/§19/§35), audyt (§34/§40),
 * wybór toru zasilania z `supply_paths` (§37/§38), panel odpływu, wąski ekran
 * (§43), stan błędu (§39). Scenariusze z backendu, ścieżka natywna (klik).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { scenariusz, type SlugScenariusza } from '../fixtures/scenariusze';
import { SLD_LABEL, SYMBOL_SCREEN_PX, celGlifuNaEkranie } from '../visualGrammar';

afterEach(cleanup);

function renderuj(slug: SlugScenariusza, props: Partial<Parameters<typeof LvDomainView>[0]> = {}): HTMLElement {
  const { container } = render(<LvDomainView projection={scenariusz(slug)} width={1400} height={1000} lod={2} {...props} />);
  return container;
}

function skalaFitu(): number {
  return Number(screen.getByTestId('lv-domain-svg').getAttribute('data-fit-scale'));
}

describe('Nagłówek i chrom (§19 dane źródłowe vs wynik)', () => {
  it('[08] opis domeny: napięcie, liczba TR, sekcje, podrozdzielnice, PV, magazyn, wyspa — po polsku, bez kryptonimów', () => {
    renderuj('08_island_grid_forming');
    const opis = screen.getByTestId('lv-domain-descriptor').textContent ?? '';
    expect(opis).toContain('0,4 kV');
    expect(opis).toContain('1×TR');
    expect(opis).toContain('1 sekcja');
    expect(opis).toContain('2 podrozdzielnice');
    expect(opis).toContain('PV');
    expect(opis).toContain('magazyn');
    expect(opis).toContain('1 wyspa');
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-status', 'ok');
  });

  it('przełącznik nakładek ma WYŁĄCZNIE kanały z realnym dostawcą; domyślnie schemat czysty; klik przełącza', () => {
    renderuj('18_swz_overlay');
    const przelacznik = screen.getByTestId('lv-domain-overlay-switcher');
    const przyciski = within(przelacznik).getAllByRole('button').map((b) => b.textContent);
    expect(przyciski).toEqual(['Brak', 'Obciążenia', 'Spadki napięcia', 'Zwarcia', 'SWZ']);
    expect(screen.getByTestId('lv-domain-overlay-status').textContent).toContain('schemat czysty');
    fireEvent.click(screen.getByTestId('lv-domain-overlay-swz'));
    expect(screen.getByTestId('lv-domain-overlay-status').textContent).toContain('IEC 60364-4-41');
    expect(screen.getByTestId('lv-domain-overlay-status').textContent).toContain('bez przebiegu');
    expect(screen.getByTestId('lv-domain-overlay-swz')).toHaveAttribute('aria-pressed', 'true');
  });

  it('stan „brak danych" projekcji renderuje uczciwy komunikat, zero wyjątku', () => {
    const p = scenariusz('01_single_tr');
    render(<LvDomainView projection={{ ...p, graph: { ...p.graph, status: 'brak danych', missing_data: ['station'] } as typeof p.graph }} width={1000} height={700} />);
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-status', 'brak-danych');
    expect(screen.getByTestId('lv-domain-view-root').textContent).toContain('brak danych');
  });
});

describe('SWZ i wyniki na odpływach — wartość == wartość backendu (§18)', () => {
  it('[18] plakietki SWZ: trzy werdykty (spełnia/nie spełnia/nierozstrzygalne) z Ik₁min, Ia wymaganym i t — bez przeliczeń w UI', () => {
    renderuj('18_swz_overlay', { initialOverlay: 'swz' });
    const ok = screen.getByTestId('lv-domain-badge-swz-QF-01');
    expect(ok).toHaveAttribute('data-swz-status', 'spełnia');
    expect(ok.textContent).toContain('SWZ ✓');
    expect(ok.textContent).toContain('Ik₁min 2496 A');
    expect(ok.textContent).toContain('t ≤ 0,40 s');
    const zle = screen.getByTestId('lv-domain-badge-swz-QF-02');
    expect(zle).toHaveAttribute('data-swz-status', 'nie spełnia');
    expect(zle.textContent).toContain('SWZ ✗');
    expect(zle.textContent).toContain('Ik₁min 61 A');
    expect(zle.textContent).toContain('Ia wym. 630 A');
    const nie = screen.getByTestId('lv-domain-badge-swz-FU-03');
    expect(nie).toHaveAttribute('data-swz-status', 'nierozstrzygalne');
    expect(nie.textContent).toContain('SWZ ?');
    expect(nie.textContent).toContain('291 A');
  });

  it('[18] klik w aparat odpływu otwiera panel z zaciskami, pętlą zwarcia liczoną od TR, SWZ i zabezpieczeniami', () => {
    renderuj('18_swz_overlay');
    fireEvent.click(screen.getByTestId('lv-domain-node-QF-02'));
    const panel = screen.getByTestId('lv-domain-feeder-panel');
    expect(panel).toHaveAttribute('data-feeder-ref', 'QF-02');
    expect(screen.getByTestId('lv-domain-feeder-terminals').textContent).toContain('zamknięty');
    expect(screen.getByTestId('lv-domain-feeder-terminals').textContent).toContain('zacisk A: ENERGIZED');
    expect(screen.getByTestId('lv-domain-feeder-transformer')).toHaveAttribute('data-transformer-ref', 'T1');
    expect(panel.textContent).toContain('SWZ: nie spełnia');
    expect(panel.textContent).toContain('Ia wymagane = 630 A');
    expect(panel.textContent).toContain('Model nie przypisuje zabezpieczenia');
    fireEvent.click(within(panel).getByText('Zamknij'));
    expect(screen.queryByTestId('lv-domain-feeder-panel')).toBeNull();
  });

  it('[12] panel odpływu DER wypisuje przekaźnik z pełną listą funkcji ANSI i przekładnikiem; glif niesie pierwszy kod + licznik', () => {
    renderuj('12_der_full_path');
    fireEvent.click(screen.getByTestId('lv-domain-node-QF-G1'));
    const relay = screen.getByTestId('lv-domain-feeder-relay-REL-QF-G1');
    expect(relay.textContent).toContain('81R · 81U · 78');
    expect(relay.textContent).toContain('CT: CT-QF-G1');
    const glif = screen.getByTestId('lv-domain-node-relay:REL-QF-G1');
    expect(glif.textContent).toContain('81R');
    expect(glif.textContent).toContain('+2');
    expect(glif.querySelector('title')?.textContent).toContain('81U');
  });
});

describe('Audyt topologii (§34/§40) — komunikaty backendu, jeden znacznik na komunikat, panel z referencjami', () => {
  it('[13] odbiór bez pola: NN-AUD-07 z „!" przy odbiorze; panel audytu otwiera się przyciskiem i pozwala wskazać element', () => {
    renderuj('13_loads_via_fields');
    const przycisk = screen.getByTestId('lv-domain-warnings-toggle');
    expect(przycisk.textContent).toBe('Audyt: 1');
    expect(screen.getByTestId('lv-domain-warning-marker-odbior_bez_pola')).toBeInTheDocument();
    fireEvent.click(przycisk);
    const panel = screen.getByTestId('lv-domain-warnings-panel');
    expect(screen.getByTestId('lv-domain-warning-NN-AUD-07')).toHaveAttribute('data-severity', 'IMPORTANT');
    fireEvent.click(within(panel).getByText('odbior_bez_pola'));
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-selected-ref', 'odbior_bez_pola');
  });

  it('[04] komunikat INFO (wspólne zasilanie SN) jest w panelu, ale NIE stawia znacznika „!" na kanwie', () => {
    renderuj('04_shared_upstream_boundary');
    fireEvent.click(screen.getByTestId('lv-domain-warnings-toggle'));
    expect(screen.getByTestId('lv-domain-warning-NN-AUD-10')).toHaveAttribute('data-severity', 'INFO');
    expect(document.querySelectorAll('[data-testid^="lv-domain-warning-marker-"]')).toHaveLength(0);
  });

  it('[01] brak komunikatów: panel mówi to wprost', () => {
    renderuj('01_single_tr');
    fireEvent.click(screen.getByTestId('lv-domain-warnings-toggle'));
    expect(screen.getByTestId('lv-domain-warnings-panel').textContent).toContain('Brak komunikatów');
  });
});

describe('Wybór toru zasilania (§37/§38) — pełna ścieżka z `supply_paths`, zero BFS w UI', () => {
  it('[14] klik w QF-31 (trzeci poziom) podświetla CAŁY tor: T1 → QF-T1 → RGnN-1 → QF-02 → kabel → RGN-2 → FU-22 → kabel → RGN-3 → QF-31', () => {
    renderuj('14_sub_boards');
    fireEvent.click(screen.getByTestId('lv-domain-node-QF-31'));
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-selected-ref', 'QF-31');
    for (const ref of ['T1#lv', 'QF-T1#a', 'QF-T1#b', 'QF-02#a', 'QF-02#b', 'QF-02_kabel', 'RGN-2_szyna#feed', 'FU-22#a', 'FU-22#b', 'FU-22_kabel', 'RGN-3_szyna#feed', 'QF-31#a', 'QF-31#b']) {
      expect(screen.getByTestId(`lv-domain-highlight-${ref}`), ref).toBeInTheDocument();
    }
    // Odpływy poza torem NIE są podświetlone.
    expect(screen.queryByTestId('lv-domain-highlight-QF-01#a')).toBeNull();
    expect(screen.queryByTestId('lv-domain-highlight-FU-21#a')).toBeNull();
    // Ponowny klik zdejmuje wybór.
    fireEvent.click(screen.getByTestId('lv-domain-node-QF-31'));
    expect(screen.getByTestId('lv-domain-highlight').children).toHaveLength(0);
  });

  it('[02] wybór odbioru na sekcji B podświetla tor od TB, nie od TA (sprzęgło otwarte)', () => {
    renderuj('02_two_tr_qbc_open');
    fireEvent.click(screen.getByTestId('lv-domain-node-QF-B1_odbior'));
    expect(screen.getByTestId('lv-domain-highlight-TB#lv')).toBeInTheDocument();
    expect(screen.getByTestId('lv-domain-highlight-QF-TB#a')).toBeInTheDocument();
    expect(screen.queryByTestId('lv-domain-highlight-TA#lv')).toBeNull();
    expect(screen.queryByTestId('lv-domain-highlight-QBC#a')).toBeNull();
  });
});

describe('Typografia i symbole (§21/§43) — screen-stable, z sufitem w slocie', () => {
  it('etykieta PRIMARY sekcji ma rozmiar EKRANOWY równy SLD_LABEL.PRIMARY przy DWÓCH viewportach', () => {
    for (const vp of [{ w: 1400, h: 1000 }, { w: 1000, h: 800 }]) {
      renderuj('01_single_tr', { width: vp.w, height: vp.h });
      const s = skalaFitu();
      const nazwa = [...screen.getByTestId('lv-domain-node-RGnN-1').querySelectorAll('text')].find((t) => (t.textContent ?? '').startsWith('RGnN-1'));
      expect(Number(nazwa?.getAttribute('font-size')) * s).toBeCloseTo(SLD_LABEL.PRIMARY, 6);
      cleanup();
    }
  });

  it('wąski ekran (390×844): scena mieści się w kadrze, symbole maleją z rozstawem slotów, nazwa sekcji zawija się', () => {
    renderuj('15_many_feeders', { width: 390, height: 844, lod: 0 });
    const s = skalaFitu();
    expect(s).toBeLessThan(0.4);
    const world = screen.getByTestId('lv-domain-world').getAttribute('transform') ?? '';
    const tx = Number(/translate\(([-\d.]+) /.exec(world)?.[1]);
    expect(tx).toBeGreaterThanOrEqual(0);
    expect(celGlifuNaEkranie('apparatus', s)).toBeLessThan(SYMBOL_SCREEN_PX.apparatus);
    const nazwa = [...screen.getByTestId('lv-domain-node-RGnN-1').querySelectorAll('text')][0];
    expect(nazwa.querySelectorAll('tspan').length).toBeGreaterThanOrEqual(3);
  });

  it('[15] gęsta rozdzielnica przy małej skali: oznaczenia aparatów pionowo (jedna orientacja dla całej sceny), żaden tekst poniżej TERTIARY, nazwy odbiorów zawinięte', () => {
    renderuj('15_many_feeders', { width: 1400, height: 1000 });
    const s = skalaFitu();
    const pionowe = document.querySelectorAll('text[data-orientacja="pionowa"]');
    expect(pionowe.length).toBe(13);
    for (const t of document.querySelectorAll('svg text')) {
      expect(Number(t.getAttribute('font-size')) * s).toBeGreaterThanOrEqual(SLD_LABEL.TERTIARY - 1e-6);
    }
    const odbior = screen.getByTestId('lv-domain-node-QF-01_odbior');
    expect(odbior.querySelectorAll('tspan').length).toBeGreaterThanOrEqual(2);
  });

  it('[01] luźna rozdzielnica: oznaczenia poziomo (zero tekstów pionowych)', () => {
    renderuj('01_single_tr');
    expect(document.querySelectorAll('text[data-orientacja="pionowa"]')).toHaveLength(0);
  });
});
