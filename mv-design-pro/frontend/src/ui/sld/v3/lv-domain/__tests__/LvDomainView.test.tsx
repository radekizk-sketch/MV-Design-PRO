/**
 * WIDOK DOMENY nN — nagłówek, nakładki wyników (§18/§19/§35), audyt (§34/§40),
 * wybór toru zasilania z `supply_paths` (§37/§38), panel odpływu, wąski ekran
 * (§43), stan błędu (§39). Scenariusze z backendu, ścieżka natywna (klik).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { LvDomainView, SZEROKOSC_KARTY_OBWODU_PX } from '../LvDomainView';
import { scenariusz, type SlugScenariusza } from '../fixtures/scenariusze';
import { CAD_U_PX, MIN_FIELD_WIDTH_PX, SLD_LABEL, TOKENY_GEOMETRII, skalaMinimalna, skalaSymboluNaEkranie } from '../visualGrammar';

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

  it('brak danych nazywa przyczyny słowami i stację nazwą — nigdy kodem braku ani identyfikatorem', () => {
    // Iniekcja: kody braków (strukturalny, z przedrostkiem równoważnika SN, spoza słownika)
    // i identyfikatory stacji oraz transformatora — tekst niesie opisy z lustra
    // `opis_braku_danych_nn` i nazwy (transformator po nazwie z widoku domeny nN).
    const p = scenariusz('01_single_tr');
    const graph = {
      ...p.graph,
      status: 'brak danych',
      station_name: 'Stacja Zielona',
      transformers: p.graph.transformers.map((tr) => ({ ...tr, name: 'Transformator główny' })),
      missing_data: ['lv_bus', 'upstream:T1:upstream_network_source', 'kod_spoza_slownika'],
    } as typeof p.graph;
    render(<LvDomainView projection={{ ...p, station_ref: 'stn_ref_7', graph }} width={1000} height={700} />);
    const tekst = screen.getByTestId('lv-domain-view-root').textContent ?? '';
    expect(tekst).toBe(
      'Domena nN stacji „Stacja Zielona” — brak danych: stacja bez szyny w paśmie nN; '
        + 'brak źródła zasilania sieci SN (równoważnik sieci SN transformatora „Transformator główny”); '
        + 'brak danej spoza słownika aplikacji.',
    );
    for (const kod of ['lv_bus', 'upstream_network_source', 'kod_spoza_slownika', 'stn_ref_7', 'T1']) {
      expect(tekst).not.toContain(kod);
    }
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
    expect(screen.getByTestId('lv-domain-feeder-lacznik').textContent).toContain('zamknięty');
    // Stan zacisku słowem polskim (nie kodem enum), każdy zacisk nazwany — karta obwodu B-02.
    expect(screen.getByTestId('lv-domain-feeder-terminals').textContent).toContain('zacisk A zasilony, zacisk B zasilony');
    expect(screen.getByTestId('lv-domain-feeder-transformer')).toHaveAttribute('data-transformer-ref', 'T1');
    // Tabelka SWZ (warunek · wynik · limit · ocena) z wartościami backendu, bez przeliczeń.
    const swzTn = screen.getByTestId('lv-domain-feeder-swz-tn');
    expect(swzTn).toHaveAttribute('data-swz-status', 'nie spełnia');
    const wiersz = within(swzTn).getByTestId('karta-obwodu-warunek-swz.tn');
    expect(wiersz.textContent).toContain('61 A');
    expect(wiersz.textContent).toContain('630 A');
    expect(wiersz.textContent).toContain('nie spełnia');
    expect(swzTn.textContent).toContain('Tab. 41.1');
    expect(panel.textContent).toContain('Model nie przypisuje zabezpieczenia');
    fireEvent.click(within(panel).getByText('Zamknij'));
    expect(screen.queryByTestId('lv-domain-feeder-panel')).toBeNull();
  });

  it('[19] układ TT: panel odpływu z RCD pokazuje werdykt wyjaśnialny (rekord W, kryteria, limit bez podstawy), bez RCD — odmowę nazwaną kodem', () => {
    renderuj('19_swz_tt');
    fireEvent.click(screen.getByTestId('lv-domain-node-QF-01'));
    const werdykt = screen.getByTestId('lv-domain-feeder-werdykt-tt-it');
    expect(werdykt).toHaveAttribute('data-uklad', 'TT');
    expect(werdykt).toHaveAttribute('data-status-wymagania', 'BRAK_PODSTAWY');
    // Karta obwodu (werdykt B-02): tabelka warunków z rekordów K — wynik, limit z przypisem
    // podstawy, ocena z etykiety backendu; jeden wiersz na kryterium.
    const wiersze = within(werdykt).getAllByTestId(/^karta-obwodu-warunek-swz\.tt\./);
    expect(wiersze.map((w) => w.getAttribute('data-testid'))).toEqual([
      'karta-obwodu-warunek-swz.tt.prad_rcd',
      'karta-obwodu-warunek-swz.tt.czas_wylaczenia',
      'karta-obwodu-warunek-swz.tt.napiecie_dotykowe',
    ]);
    expect(wiersze[0].textContent).toContain('0,03 A');
    expect(wiersze[1].textContent).toContain('s');
    // Warunki z backendu renderowane wzorem (KaTeX), nie tekstem LaTeX.
    expect(werdykt.querySelector('[data-testid="math-fallback"]')).toBeNull();
    expect(screen.getByTestId('karta-obwodu-ocena-wymagania').textContent).toContain('Brak zweryfikowanej podstawy wymagania');
    // Ocena kryterium = kanoniczna plakietka etykiety rekordu (tekst i semantyka z backendu,
    // status maszynowy tylko w atrybucie), w wariancie zwartym arkusza — zero mapy statusu w UI.
    for (const kryterium of ['swz.tt.prad_rcd', 'swz.tt.czas_wylaczenia', 'swz.tt.napiecie_dotykowe']) {
      const plakietka = screen.getByTestId(`karta-obwodu-ocena-${kryterium}`);
      expect(plakietka.className).toContain('mvd-werdykt-plakietka--zwarta');
      expect(plakietka.getAttribute('data-semantyka')).toBeTruthy();
      expect(plakietka.getAttribute('data-status')).toBeTruthy();
      expect((plakietka.textContent ?? '').length).toBeGreaterThan(0);
    }
    // Pełny rekord dowodu dostępny, ale zwinięty (nie na pierwszym planie).
    expect(screen.getByTestId('karta-obwodu-rekord-dowodu')).not.toHaveAttribute('open');
    // Limit napięcia dotykowego spoza repozytorium — nazwany kod, nie liczba z pamięci.
    expect(screen.getByTestId('lv-domain-feeder-werdykt-tt-it-limit').textContent).toContain('swz.limit_tt_it_brak_tekstu_normy');
    // Rekord werdyktu wyjaśnialnego: kryteria składowe z podstawą (IEC 60364-4-41, Tab. 41.1).
    expect(werdykt.textContent).toContain('IEC 60364-4-41');
    expect(werdykt.textContent).toContain('Tab. 41.1');
    expect(werdykt.textContent).toContain('Brak zweryfikowanej podstawy wymagania');
    fireEvent.click(within(screen.getByTestId('lv-domain-feeder-panel')).getByText('Zamknij'));

    fireEvent.click(screen.getByTestId('lv-domain-node-QF-02'));
    const odmowa = screen.getByTestId('lv-domain-feeder-swz-odmowa');
    expect(odmowa).toHaveAttribute('data-kod-odmowy', 'nn.brak_rcd');
    expect(odmowa.textContent).toContain('nn.brak_rcd');
    expect(screen.queryByTestId('lv-domain-feeder-werdykt-tt-it')).toBeNull();
  });

  it('[19] karta obwodu stoi OBOK rysunku (rysunek się zwęża, nic nie zasłania); na wąskim ekranie — nakładka', () => {
    renderuj('19_swz_tt');
    const szerokoscPrzed = Number(screen.getByTestId('lv-domain-scroll').style.width.replace('px', ''));
    fireEvent.click(screen.getByTestId('lv-domain-node-QF-01'));
    const panel = screen.getByTestId('lv-domain-feeder-panel');
    expect(panel).toHaveAttribute('data-ulozenie', 'dok');
    const szerokoscPo = Number(screen.getByTestId('lv-domain-scroll').style.width.replace('px', ''));
    expect(szerokoscPrzed - szerokoscPo).toBe(SZEROKOSC_KARTY_OBWODU_PX);
    cleanup();
    render(<LvDomainView projection={scenariusz('19_swz_tt')} width={390} height={844} lod={2} />);
    fireEvent.click(screen.getByTestId('lv-domain-node-QF-01'));
    expect(screen.getByTestId('lv-domain-feeder-panel')).toHaveAttribute('data-ulozenie', 'nakladka');
  });

  it('[19] RCD na rysunku: symbol wyłącznika różnicowoprądowego (nie rozłącznika) i tabliczka IΔn z katalogu', () => {
    renderuj('19_swz_tt');
    const rcd = screen.getByTestId('lv-domain-node-RCD-01');
    expect(rcd.querySelector('g[data-symbol-canon="cad.wylacznikRoznicowopradowy"]')).not.toBeNull();
    expect(rcd.querySelector('g[data-symbol-canon="cad.rozlacznik"]')).toBeNull();
    expect(screen.getByTestId('lv-domain-tabliczka-rcd-RCD-01').textContent).toBe('IΔn 30 mA · A · 40 A');
  });

  it('[12] panel odpływu DER wypisuje przekaźnik ze znakami IEC, numerami ANSI, nazwami polskimi funkcji i przekładnikiem; symbol niesie pierwszy znak IEC + licznik; panel nazywa aparat po polsku', () => {
    renderuj('12_der_full_path');
    fireEvent.click(screen.getByTestId('lv-domain-node-QF-G1'));
    const relay = screen.getByTestId('lv-domain-feeder-relay-REL-QF-G1');
    expect(relay.textContent).toContain('df/dt · f< · Δφ');
    expect(relay.textContent).toContain('ANSI 81R, 81U, 78');
    expect(relay.textContent).toContain('pochodna częstotliwości (LoM)');
    expect(relay.textContent).toContain('CT: CT-QF-G1');
    const symbol = screen.getByTestId('lv-domain-node-relay:REL-QF-G1');
    expect(symbol.querySelector('g[data-symbol-canon="cad.zabezpieczenie"]')).not.toBeNull();
    const znaki = [...symbol.querySelectorAll('text[data-cad="mark"]')].map((t) => t.textContent);
    expect(znaki).toEqual(['df/dt', '+2']);
    expect(symbol.querySelector('title')?.textContent).toContain('81U');
    // Aparat pola nazwany po polsku (§18): WYŁĄCZNIK, QF jako identyfikator.
    const aparat = screen.getByTestId('lv-domain-feeder-aparat');
    expect(aparat.textContent).toContain('Wyłącznik');
    expect(aparat.textContent).toContain('zamknięty');
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

  it('wąski ekran (390×844, przegląd): pole odpływu NIE schodzi poniżej MIN_FIELD_WIDTH przeglądu — kanwa PRZEWIJA zamiast ściskać; symbole z sufitem slotu', () => {
    renderuj('15_many_feeders', { width: 390, height: 844, lod: 0 });
    const s = skalaFitu();
    expect(s).toBeCloseTo(skalaMinimalna(0), 9);
    expect(TOKENY_GEOMETRII.feederGap * s).toBeGreaterThanOrEqual(MIN_FIELD_WIDTH_PX[0]);
    expect(screen.getByTestId('lv-domain-scroll')).toHaveAttribute('data-scroll', 'true');
    expect(Number(screen.getByTestId('lv-domain-svg').getAttribute('width'))).toBeGreaterThan(390);
    const world = screen.getByTestId('lv-domain-world').getAttribute('transform') ?? '';
    expect(Number(/translate\(([-\d.]+) /.exec(world)?.[1])).toBe(0);
    expect(skalaSymboluNaEkranie('apparatus', 16, s)).toBeLessThan(CAD_U_PX);
    for (const t of document.querySelectorAll('svg text')) {
      expect(Number(t.getAttribute('font-size')) * s).toBeGreaterThanOrEqual(SLD_LABEL.TERTIARY - 1e-6);
    }
  });

  it('[15] gęsta rozdzielnica (12 odpływów) na 1400×1000: pole ≥ 96 px, oznaczenia POZIOMO w jednym wierszu (zero tekstów pionowych), żaden tekst poniżej TERTIARY, nazwy odbiorów ≤ 2 wiersze bez łamania słów, kanwa przewijalna', () => {
    renderuj('15_many_feeders', { width: 1400, height: 1000 });
    const s = skalaFitu();
    expect(TOKENY_GEOMETRII.feederGap * s).toBeGreaterThanOrEqual(MIN_FIELD_WIDTH_PX[2] - 1e-9);
    expect(screen.getByTestId('lv-domain-scroll')).toHaveAttribute('data-scroll', 'true');
    expect(document.querySelectorAll('text[data-orientacja="pionowa"]')).toHaveLength(0);
    for (const t of document.querySelectorAll('svg text')) {
      expect(Number(t.getAttribute('font-size')) * s).toBeGreaterThanOrEqual(SLD_LABEL.TERTIARY - 1e-6);
      for (const tspan of t.querySelectorAll('tspan')) expect(tspan.textContent?.endsWith('-'), tspan.textContent ?? '').toBe(false);
    }
    const odbior = screen.getByTestId('lv-domain-node-QF-01_odbior');
    const wierszeNazwy = [...odbior.querySelectorAll('text')][0].querySelectorAll('tspan').length;
    expect(wierszeNazwy).toBeGreaterThanOrEqual(1);
    expect(wierszeNazwy).toBeLessThanOrEqual(2);
    // Pełna nazwa odbioru w podpowiedzi elementu (inspektor); na kanwie uczciwie skrócona „…".
    expect(odbior.querySelector('title')?.textContent).toBe('Oświetlenie zewnętrzne parkingu północnego');
    const naKanwie = [...odbior.querySelectorAll('tspan')].map((t) => t.textContent ?? '').join(' ');
    expect(naKanwie).not.toContain('północnego');
    expect(naKanwie).toContain('…');
    expect(document.querySelectorAll('[data-device-role="feeder"] g[data-symbol-family="cad"]').length).toBe(12);
  });

  it('[01] luźna rozdzielnica: oznaczenia poziomo, kanwa bez przewijania (scena mieści się w celu zajętości)', () => {
    renderuj('01_single_tr');
    expect(document.querySelectorAll('text[data-orientacja="pionowa"]')).toHaveLength(0);
    expect(screen.getByTestId('lv-domain-scroll')).toHaveAttribute('data-scroll', 'false');
  });
});

describe('Oznaczenie aparatu na arkuszu — dwa wiersze po słowach w realnym wolnym pasie (werdykt właściciela: rysunek jak CAD, bez obciętych nazw)', () => {
  function zNazwami(nazwy: Readonly<Record<string, string>>) {
    const p = scenariusz('15_many_feeders');
    return {
      ...p,
      graph: {
        ...p.graph,
        branches: p.graph.branches.map((b) => (nazwy[b.ref_id] ? { ...b, name: nazwy[b.ref_id] } : b)),
      },
    } as typeof p;
  }
  function wiersze(ref: string): string[] {
    const el = screen.getByTestId(`lv-domain-oznaczenie-${ref}`);
    return Array.from(el.querySelectorAll('tspan')).map((t) => t.textContent ?? '');
  }

  it('iloczyn cech: kolumna ostatnia × kolumna środkowa × nazwa krótka / dwuwyrazowa / jeden zbyt długi wyraz', () => {
    const qf = scenariusz('15_many_feeders').graph.branches.map((b) => b.ref_id).filter((r) => /^QF-\d+$/.test(r)).sort();
    const srodkowy = qf[1];
    const ostatni = qf[qf.length - 1];
    const pierwszy = qf[0];
    render(
      <LvDomainView
        projection={zNazwami({
          [pierwszy]: 'Wyłącznik główny',
          [srodkowy]: 'Rozdzielnicoodpływonapędowy',
          [ostatni]: 'Odpływ nN 1 gospodarstwo',
        })}
        width={1400}
        height={1000}
        lod={2}
      />,
    );
    // Dwa krótkie wyrazy: pełna nazwa w najwyżej dwóch wierszach, zero wielokropka.
    const w1 = wiersze(pierwszy);
    expect(w1.length).toBeLessThanOrEqual(2);
    expect(w1.join(' ')).toBe('Wyłącznik główny');
    // Ostatnia kolumna: pas sięga rezerwy arkusza — pełna nazwa bez skrótu.
    const wN = wiersze(ostatni);
    expect(wN.join(' ')).toBe('Odpływ nN 1 gospodarstwo');
    expect(wN.join(' ')).not.toContain('…');
    // Jeden wyraz dłuższy niż pas kolumny środkowej: uczciwy skrót „…" (pełna nazwa w podpowiedzi), bez łamania wyrazu.
    const wS = wiersze(srodkowy);
    expect(wS).toHaveLength(1);
    expect(wS[0].endsWith('…')).toBe(true);
    expect('Rozdzielnicoodpływonapędowy'.startsWith(wS[0].slice(0, -1))).toBe(true);
  });
});
