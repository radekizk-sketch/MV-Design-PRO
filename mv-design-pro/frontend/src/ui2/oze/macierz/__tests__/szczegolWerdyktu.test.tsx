/**
 * Ocena komórki macierzy (karta AB-1a Pakiet D2 §3): pełny rekord `ocena` przez
 * `KartaWerdyktu` (bez osobnej osi „ocena dowodowa" i bez listy akcji naprawczych), definicja testu,
 * wartości biegu i ślad; nawigacja do elementu tylko gdy rekord niesie `przedmiot.element_ref`.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { useSelectionStore } from '../../../../ui/selection/store';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { ustawMigawkeZElementami } from '../../../../test/schematTestowy';
import { SzczegolWerdyktu, nazwaRodzajuTwierdzenia } from '../SzczegolWerdyktu';
import { mapujMacierz, zbudujModuly, type KomorkaMacierzy } from '../macierzModel';
import { MACIERZ_STRINGS } from '../strings';
import { biegFixture, derFixture, deryScenyMacierz, katalogFixture, wejsciaFixture, wejsciaZ } from './fixtures';

const BIEG = biegFixture();
const MODULY = [
  ...zbudujModuly(deryScenyMacierz(), { stan: 'gotowe', wejscia: wejsciaFixture() }),
  // DER pominięty przez most modelu (brak napięcia szyny) — powód blokady z serwera.
  ...zbudujModuly(
    [derFixture({ id: 'zz-bez-napiecia', connection_voltage_kv: null })],
    { stan: 'gotowe', wejscia: wejsciaZ({ pominiete: [{ derRef: 'zz-bez-napiecia', powod: 'brak_napiecia' }] }) },
  ),
];
const WIERSZE = mapujMacierz(BIEG.test_catalog, BIEG, MODULY);

function komorka(indeksWiersza: number, derRef: string): KomorkaMacierzy {
  return WIERSZE[indeksWiersza].komorki.find((k) => k.derRef === derRef)!;
}


afterEach(() => {
  useSnapshotStore.setState({ snapshot: null });
  useSelectionStore.getState().clearSelection();
});

describe('SzczegolWerdyktu', () => {
  it('bez wybranej komórki → podpowiedź wyboru', () => {
    render(<SzczegolWerdyktu komorka={null} definicja={null} nazwaModulu={null} slad={[]} wzoryLatex={{}} jednostkiSladu={{}} szczegolyAudytowe={false} />);
    expect(screen.getByTestId('mvd-oze-szczegol-pusty')).toHaveTextContent(MACIERZ_STRINGS.szczegolWybierz);
  });

  it('komórka modułu bez danych → jawny powód', () => {
    render(
      <SzczegolWerdyktu komorka={komorka(0, 'zz-bez-napiecia')} definicja={null} nazwaModulu="x" slad={[]} wzoryLatex={{}} jednostkiSladu={{}} szczegolyAudytowe={false} />,
    );
    expect(screen.getByTestId('mvd-oze-szczegol-blokada')).toHaveTextContent('napięcie przyłączenia');
  });

  it('komórka z rekordem → karta rekordu, definicja z rodzajem twierdzenia, wartości biegu', () => {
    const pv = BIEG.modules[1];
    const k = komorka(0, pv.der_ref);
    const definicja = BIEG.test_catalog[0];
    render(<SzczegolWerdyktu komorka={k} definicja={definicja} nazwaModulu={pv.der_name} slad={BIEG.white_box_trace} wzoryLatex={{}} jednostkiSladu={{}} szczegolyAudytowe={false} />);
    if (k.stan !== 'wynik') throw new Error('oczekiwano rekordu');
    expect(screen.getByTestId(`mvd-werdykt-${k.wynik.ocena.kryterium_id}`)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-szczegol-definicja')).toHaveTextContent(definicja.procedure_basis_pl);
    expect(screen.getByTestId('mvd-oze-szczegol-definicja')).toHaveTextContent(
      nazwaRodzajuTwierdzenia(definicja.rodzaj_twierdzenia),
    );
    expect(screen.getByTestId('mvd-oze-szczegol-metryki')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Akcje naprawcze');
  });

  it.each([
    [false, false],
    [true, true],
  ] as const)(
    'identyfikator zdolności dowodowej (metadana audytowa, nie język inżynierski) — tryb ekspercki %s → widoczny %s',
    (szczegolyAudytowe, widoczny) => {
      const pv = BIEG.modules[1];
      const definicja = BIEG.test_catalog[0];
      render(
        <SzczegolWerdyktu
          komorka={komorka(0, pv.der_ref)}
          definicja={definicja}
          nazwaModulu={pv.der_name}
          slad={[]}
          wzoryLatex={{}}
          jednostkiSladu={{}}
          szczegolyAudytowe={szczegolyAudytowe}
        />,
      );
      expect(screen.queryByTestId('mvd-oze-szczegol-zdolnosc') !== null).toBe(widoczny);
      // Karta #145: identyfikator wyłącznie w „Informacjach audytowych" — zwinięte, więc
      // pierwszy plan nie niesie go w żadnym trybie.
      expect(document.body.textContent?.includes(definicja.zdolnosc_id)).toBe(false);
      // Definicja testu (podstawa, rodzaj twierdzenia) — w obu trybach.
      expect(screen.getByTestId('mvd-oze-szczegol-definicja')).toHaveTextContent(definicja.procedure_basis_pl);
    },
  );

  it('rekord z odnośnikiem przedmiotu → natywny klik zaznacza element modelu', async () => {
    const pv = BIEG.modules[1];
    const indeks = BIEG.test_catalog.findIndex(
      (d) => pv.tests.find((t) => t.test_id === d.test_id)?.ocena.przedmiot.element_ref,
    );
    const k = komorka(indeks, pv.der_ref);
    if (k.stan !== 'wynik') throw new Error('oczekiwano rekordu');
    const ref = k.wynik.ocena.przedmiot.element_ref as string;
    // Bez elementu w modelu akcji nie ma (jeden predykat z akcją: `elementNaSchemacie`).
    const { unmount } = render(<SzczegolWerdyktu komorka={k} definicja={null} nazwaModulu={pv.der_name} slad={[]} wzoryLatex={{}} jednostkiSladu={{}} szczegolyAudytowe={false} />);
    expect(screen.queryByTestId('mvd-oze-szczegol-pokaz-element')).toBeNull();
    unmount();
    // Przedmiot oceny modułu wytwórczego istnieje w migawce modelu.
    ustawMigawkeZElementami([{ kolekcja: 'generators', id: ref }]);
    const uzytkownik = userEvent.setup();
    render(<SzczegolWerdyktu komorka={k} definicja={null} nazwaModulu={pv.der_name} slad={[]} wzoryLatex={{}} jednostkiSladu={{}} szczegolyAudytowe={false} />);
    await uzytkownik.click(screen.getByTestId('mvd-oze-szczegol-pokaz-element'));
    expect(useSelectionStore.getState().selectedElement?.id).toBe(ref);
    expect(useSelectionStore.getState().sldWskazanie).toMatchObject({ ref, tryb: 'kadruj' });
  });

  it('ślad: przycisk rozwija kroki TEGO testu', async () => {
    const pv = BIEG.modules[1];
    const indeks = BIEG.test_catalog.findIndex((d) => (pv.tests.find((t) => t.test_id === d.test_id)?.trace_refs.length ?? 0) > 0);
    const k = komorka(indeks, pv.der_ref);
    const uzytkownik = userEvent.setup();
    render(<SzczegolWerdyktu komorka={k} definicja={null} nazwaModulu={pv.der_name} slad={BIEG.white_box_trace} wzoryLatex={{}} jednostkiSladu={{}} szczegolyAudytowe={false} />);
    await uzytkownik.click(screen.getByTestId('mvd-oze-slad-przelacz'));
    expect(screen.getByTestId('mvd-oze-slad-przelacz')).toHaveAttribute('aria-expanded', 'true');
    const kroki = BIEG.white_box_trace.filter((krok) => krok.test_id === k.testId);
    // Karta #145: ślad silnika prób to zapis techniczny z jawnym podpisem.
    expect(screen.getByTestId('mvd-oze-slad')).toHaveTextContent('Zapis techniczny');
    if (kroki.length > 0) expect(screen.getByTestId('mvd-oze-slad-kroki').children).toHaveLength(kroki.length);
    else expect(screen.getByTestId('mvd-oze-slad-pusty')).toBeInTheDocument();
  });

  // Iloczyn cech: {wzór z wpisem rejestru LaTeX, wzór bez wpisu} × {wszystkie testy sceny z
  // krokami}. Mapa pochodzi z katalogu backendu (`ncrfg_katalog.json`, generator fixtur) — ta
  // sama ścieżka co w MacierzNcRfg (`katalog.wzory_sladu_latex`).
  it('ślad: każdy wzór kroku sceny renderuje się przez KaTeX z katalogu (bez zapisu ASCII)', async () => {
    const wzory = katalogFixture().wzory_sladu_latex;
    const pv = BIEG.modules[1];
    const indeksy = BIEG.test_catalog
      .map((d, i) => ((pv.tests.find((t) => t.test_id === d.test_id)?.trace_refs.length ?? 0) > 0 ? i : -1))
      .filter((i) => i >= 0);
    expect(indeksy.length).toBeGreaterThan(0);
    for (const indeks of indeksy) {
      const k = komorka(indeks, pv.der_ref);
      const uzytkownik = userEvent.setup();
      const { unmount } = render(
        <SzczegolWerdyktu komorka={k} definicja={null} nazwaModulu={pv.der_name} slad={BIEG.white_box_trace} wzoryLatex={wzory} jednostkiSladu={katalogFixture().jednostki_sladu} szczegolyAudytowe={false} />,
      );
      await uzytkownik.click(screen.getByTestId('mvd-oze-slad-przelacz'));
      const kroki = BIEG.white_box_trace.filter((krok) => krok.test_id === k.testId);
      const lista = screen.getByTestId('mvd-oze-slad-kroki');
      expect(lista.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(kroki.length);
      for (const krok of kroki) expect(wzory[krok.formula]).toBeDefined();
      expect(lista.querySelectorAll('code').length).toBe(
        kroki.filter((krok) => krok.substitution).length,
      );
      unmount();
    }
    // Limit z pomiaru (2026-10-30, izolowany bieg pliku): 20 testów sceny z krokami × pełny montaż
    // karty werdyktu i natywny klik przełącznika śladu — 2,2 s bez KaTeX, 2,8 s z KaTeX po
    // współdzielonej pamięci renderu (`renderLatexToHtml`; przed nią 3,6 s). Koszt rośnie z liczbą
    // testów sceny, nie z KaTeX; w puli równoległej plików czas ściany rośnie 2–3×, stąd 15 s.
  }, 15_000);

  // Iloczyn cech: {weryfikacja jednostek z algebrą jednostek (wpis z LaTeX), zdanie rdzenia bez
  // algebry (wpis `latex: null`)} × {wszystkie testy sceny z krokami}. Mapa z katalogu backendu
  // (`ncrfg_katalog.json`) — ta sama ścieżka co w MacierzNcRfg (`katalog.jednostki_sladu`).
  it('ślad: weryfikacja jednostek stoi słowami, a algebra jednostek renderuje się przez KaTeX', async () => {
    const katalog = katalogFixture();
    const pv = BIEG.modules[1];
    const indeksy = BIEG.test_catalog
      .map((d, i) => ((pv.tests.find((t) => t.test_id === d.test_id)?.trace_refs.length ?? 0) > 0 ? i : -1))
      .filter((i) => i >= 0);
    let zAlgebra = 0;
    let bezAlgebry = 0;
    for (const indeks of indeksy) {
      const k = komorka(indeks, pv.der_ref);
      const uzytkownik = userEvent.setup();
      const { unmount } = render(
        <SzczegolWerdyktu komorka={k} definicja={null} nazwaModulu={pv.der_name} slad={BIEG.white_box_trace} wzoryLatex={katalog.wzory_sladu_latex} jednostkiSladu={katalog.jednostki_sladu} szczegolyAudytowe={false} />,
      );
      await uzytkownik.click(screen.getByTestId('mvd-oze-slad-przelacz'));
      const kroki = BIEG.white_box_trace.filter((krok) => krok.test_id === k.testId && krok.unit_check);
      const pola = screen.getAllByTestId('mvd-oze-slad-jednostki');
      expect(pola).toHaveLength(kroki.length);
      kroki.forEach((krok, i) => {
        const wpis = katalog.jednostki_sladu[krok.unit_check];
        expect(wpis).toBeDefined();
        expect(pola[i]).toHaveTextContent(wpis.opis_pl);
        if (wpis.latex !== null) {
          zAlgebra += 1;
          expect(pola[i].querySelectorAll('.katex')).toHaveLength(1);
          // Algebra jednostek rdzenia („% − % = pp.") nie stoi na ekranie jako tekst.
          expect(pola[i].textContent).not.toContain(krok.unit_check);
        } else {
          bezAlgebry += 1;
          expect(pola[i].querySelectorAll('.katex')).toHaveLength(0);
        }
      });
      unmount();
    }
    expect(zAlgebra).toBeGreaterThan(0);
    expect(bezAlgebry).toBeGreaterThan(0);
  }, 15_000);

  it('ślad: wzór bez wpisu w katalogu zostaje zapisem rdzenia (stan awaryjny, bez KaTeX)', async () => {
    const pv = BIEG.modules[1];
    const indeks = BIEG.test_catalog.findIndex((d) => (pv.tests.find((t) => t.test_id === d.test_id)?.trace_refs.length ?? 0) > 0);
    const k = komorka(indeks, pv.der_ref);
    const uzytkownik = userEvent.setup();
    render(<SzczegolWerdyktu komorka={k} definicja={null} nazwaModulu={pv.der_name} slad={BIEG.white_box_trace} wzoryLatex={{}} jednostkiSladu={{}} szczegolyAudytowe={false} />);
    await uzytkownik.click(screen.getByTestId('mvd-oze-slad-przelacz'));
    const kroki = BIEG.white_box_trace.filter((krok) => krok.test_id === k.testId);
    const lista = screen.getByTestId('mvd-oze-slad-kroki');
    expect(lista.querySelectorAll('.katex')).toHaveLength(0);
    for (const krok of kroki) expect(lista.textContent).toContain(krok.formula);
    // Weryfikacja jednostek bez wpisu: zapis rdzenia jako zapis techniczny (kod), nie zdanie.
    for (const krok of kroki.filter((krok) => krok.unit_check)) expect(lista.textContent).toContain(krok.unit_check);
    expect(screen.queryAllByTestId('mvd-oze-slad-jednostki')).toHaveLength(0);
  });
});
