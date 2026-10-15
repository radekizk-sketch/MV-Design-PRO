/*
 * Sekcja „Obliczenia kabla nN" (karta OBIEKT-KABEL-NN) — testy na odpowiedziach PRAWDZIWEGO
 * backendu (`backend/schemas/kabel_nn_kontrakt_v1.json`; aktualność pliku pilnuje pytest
 * `test_kabel_nn_kontrakt_frontu.py`). Interakcje NATYWNE (`userEvent`): klik, wybór z listy.
 *
 * Iloczyn cech (oś frontu): rodzaj zabezpieczenia (MCB / gG / MCCB) × warunki ułożenia
 * (katalogowe / grunt) × wynik (spełnia / narusza Iz′ / narusza SWZ) — każda próbka:
 * komplet wielkości i ośmiu sprawdzeń, semantyka odczytu z backendu, każdy wzór renderowany
 * przez KaTeX (zero `math-fallback`), pierwszy plan bez statusów maszynowych i bez
 * identyfikatorów biegów. Do tego: warunki ułożenia → operacja modelu z wartościami z
 * rejestru, wybór wariantu → operacja wiązania katalogu + skutek zmiany, brak biegów →
 * akcje „Uruchom", odmowa nazwana, dowód obwodu z modelu i pakiet ZIP.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const uruchom = vi.fn();
vi.mock('../../spaces/obliczenia/uruchomObliczenie', () => ({
  useUruchomObliczenie: () => ({ uruchom, wToku: false }),
}));

import { useAppStateStore } from '../../../ui/app-state';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { SekcjaKablaNn, liczbaPl, skutekZmiany } from '../SekcjaKablaNn';
import type { ObliczeniaKablaOk } from '../kabelNnApi';

const KONTRAKT = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../../../backend/schemas/kabel_nn_kontrakt_v1.json'),
    'utf8',
  ),
) as {
  obliczenia: Record<string, ObliczeniaKablaOk>;
  warianty: Record<string, unknown>;
  dowod: Record<string, unknown>;
};

const PROBKI = ['mcb_katalogowe_spelnia', 'gg_grunt_narusza_iz', 'mccb_katalogowe_narusza_swz'] as const;
const STATUSY_MASZYNOWE = [
  'SPELNIA',
  'NIE_SPELNIA',
  'NIEJEDNOZNACZNY',
  'NIE_OCENIONO',
  'BRAK_PODSTAWY',
  'BRAK_DOWODU',
  'NIE_DOTYCZY',
];

const operacja = vi.fn();
let odpowiedzi: Record<string, unknown>;

function odpowiedzDla(url: string): unknown {
  const sciezka = url.split('?')[0];
  if (sciezka.endsWith('/nn-cable/warianty-przekroju')) return odpowiedzi.warianty;
  if (sciezka.endsWith('/nn-cable/dowod')) return odpowiedzi.dowod;
  return odpowiedzi.obliczenia;
}

beforeEach(() => {
  uruchom.mockReset();
  operacja.mockReset();
  operacja.mockResolvedValue({ error: null });
  odpowiedzi = {
    obliczenia: KONTRAKT.obliczenia.mcb_katalogowe_spelnia,
    warianty: KONTRAKT.warianty.mcb_katalogowe_spelnia,
    dowod: KONTRAKT.dowod.mcb_katalogowe_spelnia,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(odpowiedzDla(url)) } as Response),
    ),
  );
  useAppStateStore.setState({ activeCaseId: 'case-1', activeRunId: null });
  useSnapshotStore.setState({ rewizjaBiezacegoModelu: 1, executeDomainOperation: operacja } as never);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function zamontuj(trybEkspercki = false) {
  render(<SekcjaKablaNn cableRef="k1" trybEkspercki={trybEkspercki} />);
  await waitFor(() => expect(screen.getByTestId('mvd-kabel-nn')).toBeInTheDocument());
  return screen.getByTestId('mvd-kabel-nn');
}

describe('SekcjaKablaNn — iloczyn rodzaj zabezpieczenia × ułożenie × wynik', () => {
  for (const probka of PROBKI) {
    it(`${probka}: komplet wielkości i sprawdzeń z backendu, KaTeX bez błędów, czysty pierwszy plan`, async () => {
      odpowiedzi.obliczenia = KONTRAKT.obliczenia[probka];
      const dane = KONTRAKT.obliczenia[probka];
      const sekcja = await zamontuj();

      expect(within(sekcja).getByTestId('mvd-kabel-nn-aparat')).toHaveTextContent(
        dane.obwod.aparat_rodzaj_pl ?? '',
      );
      expect(within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-opis')).toHaveTextContent(
        dane.kabel.warunki_ulozenia_opis_pl,
      );
      for (const w of dane.wielkosci) {
        const wiersz = within(sekcja).getByTestId(`mvd-kabel-nn-wielkosc-${w.kod.replace(/_/g, '-')}`);
        if (w.wartosc !== null) expect(wiersz).toHaveTextContent(liczbaPl(w.wartosc, w.jednostka));
      }
      const wiersze = within(sekcja).getByTestId('mvd-kabel-nn-kryteria').querySelectorAll('[data-kryterium]');
      expect(wiersze).toHaveLength(8);
      for (const k of dane.kryteria) {
        const wiersz = within(sekcja).getByTestId(
          `mvd-kabel-nn-kryterium-${k.kryterium_id.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`,
        );
        expect(wiersz).toHaveAttribute('data-semantyka', k.ocena_semantyka);
        expect(wiersz).toHaveTextContent(k.ocena_techniczna_pl);
        expect(wiersz).toHaveTextContent(k.norma_pl);
      }
      // Pierwszy plan: zero statusów maszynowych i identyfikatorów biegu / odcisku modelu.
      for (const status of STATUSY_MASZYNOWE) expect(sekcja.textContent).not.toContain(status);
      expect(sekcja.textContent).not.toContain(dane.audyt.rewizja_modelu);
      expect(sekcja.querySelectorAll('[data-testid="math-fallback"]')).toHaveLength(0);

      // Szczegóły KAŻDEGO wiersza na żądanie (natywny klik): kroki + karta werdyktu,
      // wszystkie wzory parsowane przez KaTeX.
      const user = userEvent.setup();
      for (const k of dane.kryteria) {
        const id = `mvd-kabel-nn-kryterium-${k.kryterium_id.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
        await user.click(within(sekcja).getByTestId(`${id}-szczegoly`));
        const szczegol = within(sekcja).getByTestId(`${id}-szczegol`);
        expect(szczegol).toHaveTextContent(k.rekord.wyjasnienie.zdanie_pl);
        expect(szczegol.querySelectorAll('[data-testid^="' + id + '-krok-"]')).toHaveLength(k.szczegoly.length);
      }
      for (const w of dane.wielkosci.filter((x) => x.szczegoly.length > 0)) {
        await user.click(within(sekcja).getByTestId(`mvd-kabel-nn-wielkosc-${w.kod.replace(/_/g, '-')}-szczegoly`));
      }
      expect(sekcja.querySelectorAll('[data-testid="math-fallback"]')).toHaveLength(0);
    }, 60_000);
  }

  it('warunki ułożenia: wybór z rejestru backendu → operacja modelu `set_nn_cable_laying_conditions`', async () => {
    const sekcja = await zamontuj();
    const user = userEvent.setup();
    await user.click(within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-zmien'));
    await user.selectOptions(within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-srodowisko'), 'grunt');
    const opcje = KONTRAKT.obliczenia.mcb_katalogowe_spelnia.opcje_ulozenia;
    // Lista temperatur = WYŁĄCZNIE wartości rejestru dla gruntu i izolacji (wybór, nie wpis).
    const temperatury = within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-temperatura') as HTMLSelectElement;
    expect(Array.from(temperatury.options).map((o) => Number(o.value))).toEqual(
      opcje.temperatury.grunt.PVC,
    );
    await user.selectOptions(temperatury, '20');
    await user.selectOptions(within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-obwody'), '2');
    await user.selectOptions(within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-rezystywnosc'), '2.5');
    await user.click(within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-zapisz'));
    expect(operacja).toHaveBeenCalledWith('case-1', 'set_nn_cable_laying_conditions', {
      segment_ref: 'k1',
      cable_laying_conditions: {
        environment: 'grunt',
        insulation: 'PVC',
        ambient_temperature_c: 20,
        circuit_count: 2,
        soil_thermal_resistivity_km_w: 2.5,
      },
    });
  });

  it('powrót do warunków katalogowych dla kabla z zapisanymi warunkami', async () => {
    odpowiedzi.obliczenia = KONTRAKT.obliczenia.gg_grunt_narusza_iz;
    const sekcja = await zamontuj();
    const user = userEvent.setup();
    await user.click(within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-zmien'));
    await user.click(within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-katalogowe'));
    expect(operacja).toHaveBeenCalledWith('case-1', 'set_nn_cable_laying_conditions', {
      segment_ref: 'k1',
      cable_laying_conditions: 'warunki_katalogowe',
    });
  });

  it('dobór przekroju: tabela wariantów → wybór = wiązanie katalogu → skutek zmiany z backendu', async () => {
    const sekcja = await zamontuj();
    const user = userEvent.setup();
    await user.click(within(sekcja).getByTestId('mvd-kabel-nn-dobierz'));
    await waitFor(() => expect(within(sekcja).getByTestId('mvd-kabel-nn-warianty')).toBeInTheDocument());
    const warianty = KONTRAKT.warianty.mcb_katalogowe_spelnia as {
      rekomendacja: string;
      warianty: { catalog_item_id: string; catalog_binding: unknown; biezacy: boolean }[];
    };
    const tabela = within(sekcja).getByTestId('mvd-kabel-nn-warianty');
    expect(tabela.querySelectorAll('[data-wariant]')).toHaveLength(warianty.warianty.length);
    const rekomendowany = warianty.warianty.find((w) => w.catalog_item_id === warianty.rekomendacja)!;
    const slug = rekomendowany.catalog_item_id.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    expect(within(tabela).getByTestId(`mvd-kabel-nn-wariant-${slug}`)).toHaveAttribute('data-rekomendowany', 'true');
    // Wariant bieżący nie ma przycisku wyboru.
    const biezacy = warianty.warianty.find((w) => w.biezacy)!;
    expect(
      within(tabela).queryByTestId(`mvd-kabel-nn-wybierz-${biezacy.catalog_item_id.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`),
    ).toBeNull();

    await user.click(within(tabela).getByTestId(`mvd-kabel-nn-wybierz-${slug}`));
    expect(operacja).toHaveBeenCalledWith('case-1', 'assign_catalog_to_element', {
      element_ref: 'k1',
      catalog_binding: rekomendowany.catalog_binding,
      source_mode: 'KATALOG',
    });
    // Model po operacji: nowa rewizja → obliczenia od nowa → skutek (oba stany z backendu).
    odpowiedzi.obliczenia = KONTRAKT.obliczenia.mcb_katalogowe_po_wyborze;
    act(() => useSnapshotStore.setState({ rewizjaBiezacegoModelu: 2 } as never));
    await waitFor(() => expect(within(sekcja).getByTestId('mvd-kabel-nn-skutek')).toBeInTheDocument());
    const przed = KONTRAKT.obliczenia.mcb_katalogowe_spelnia;
    const po = KONTRAKT.obliczenia.mcb_katalogowe_po_wyborze;
    const skutek = within(sekcja).getByTestId('mvd-kabel-nn-skutek');
    expect(skutek).toHaveTextContent(`${przed.kabel.typ_nazwa} → ${po.kabel.typ_nazwa}`);
    const izPrzed = przed.wielkosci.find((w) => w.kod === 'iz_prim')!;
    const izPo = po.wielkosci.find((w) => w.kod === 'iz_prim')!;
    expect(within(skutek).getByTestId('mvd-kabel-nn-skutek-iz-prim')).toHaveTextContent(
      `${liczbaPl(izPrzed.wartosc, 'A')} → ${liczbaPl(izPo.wartosc, 'A')}`,
    );
    expect(within(sekcja).getByTestId('mvd-kabel-nn-typ')).toHaveTextContent(po.kabel.typ_nazwa ?? '');
  });

  it('nieudana operacja: komunikat backendu, bez skutku zmiany', async () => {
    operacja.mockResolvedValue({ error: 'Pozycja katalogu niedostępna.' });
    const sekcja = await zamontuj();
    const user = userEvent.setup();
    await user.click(within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-zmien'));
    await user.click(within(sekcja).getByTestId('mvd-kabel-nn-ulozenie-zapisz'));
    await waitFor(() =>
      expect(within(sekcja).getByTestId('mvd-kabel-nn-blad-operacji')).toHaveTextContent('Pozycja katalogu niedostępna.'),
    );
    expect(within(sekcja).queryByTestId('mvd-kabel-nn-skutek')).toBeNull();
  });

  it('brak biegów przypadku: liczby nieobliczone z powodem i akcje „Uruchom" tego samego toru co „Oblicz"', async () => {
    odpowiedzi.obliczenia = KONTRAKT.obliczenia.mcb_bez_biegow;
    const sekcja = await zamontuj();
    expect(within(sekcja).getByTestId('mvd-kabel-nn-brak-biegow')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(sekcja).getByTestId('mvd-kabel-nn-uruchom-LOAD_FLOW'));
    expect(uruchom).toHaveBeenCalledWith('LOAD_FLOW', undefined);
    await user.click(within(sekcja).getByTestId('mvd-kabel-nn-uruchom-SC_3F'));
    expect(uruchom).toHaveBeenCalledWith('SC_3F', undefined);
    const ib = within(sekcja).getByTestId('mvd-kabel-nn-wielkosc-ib');
    expect(ib).toHaveTextContent('nie obliczono');
  });

  it('dowód obwodu nN z modelu i biegu + pakiet ZIP z adresu obiektu', async () => {
    const sekcja = await zamontuj();
    const user = userEvent.setup();
    await user.click(within(sekcja).getByTestId('mvd-kabel-nn-dowod'));
    await waitFor(() => expect(within(sekcja).getByTestId('mvd-kabel-nn-dowod-pakiet')).toBeInTheDocument());
    const kroki = (KONTRAKT.dowod.mcb_katalogowe_spelnia as { kroki: unknown[] }).kroki;
    expect(within(sekcja).getByTestId('mvd-kabel-nn-dowod-blok').querySelectorAll('[data-testid^="mvd-kabel-nn-dowod-krok-"]')).toHaveLength(kroki.length);
    expect(within(sekcja).getByTestId('mvd-kabel-nn-dowod-pakiet')).toHaveAttribute(
      'href',
      '/api/cases/case-1/enm/nn-cable/dowod/pakiet?cable_ref=k1',
    );
    expect(sekcja.querySelectorAll('[data-testid="math-fallback"]')).toHaveLength(0);
  });

  it('odmowa nazwana (kabel poza pasmem nN) — powód zamiast liczb', async () => {
    odpowiedzi.obliczenia = { status: 'nie dotyczy', cable_ref: 'k1', reason_pl: 'Odcinek nie jest kablem nN.' };
    render(<SekcjaKablaNn cableRef="k1" trybEkspercki={false} />);
    await waitFor(() => expect(screen.getByTestId('mvd-kabel-nn-odmowa')).toHaveTextContent('Odcinek nie jest kablem nN.'));
  });

  it('informacje audytowe wyłącznie w trybie eksperckim', async () => {
    const sekcja = await zamontuj(true);
    expect(within(sekcja).getByTestId('mvd-kabel-nn-audyt')).toBeInTheDocument();
    cleanup();
    const zwykla = await zamontuj(false);
    expect(within(zwykla).queryByTestId('mvd-kabel-nn-audyt')).toBeNull();
  });
});

describe('skutekZmiany — porównanie dwóch odpowiedzi backendu', () => {
  it('ta sama odpowiedź = brak zmian; zmiana typu na początku listy', () => {
    const a = KONTRAKT.obliczenia.mcb_katalogowe_spelnia;
    const b = KONTRAKT.obliczenia.mcb_katalogowe_po_wyborze;
    expect(skutekZmiany(a, a)).toEqual([]);
    const zmiany = skutekZmiany(a, b);
    expect(zmiany[0].kod).toBe('typ');
    expect(zmiany.length).toBeGreaterThan(1);
  });
});
