/**
 * V12K-242: wybór wiązań katalogowych wytwórcy — ŚCIEŻKA REALNA.
 *
 * Ekran wytwórcy pokazywał wiązania wyłącznie do odczytu: backend przyjmował je kanoniczną
 * operacją, katalog wyprowadzał z klasy rodzaj rdzenia, reguła gotowości czytała wynik —
 * a projektant nie miał GDZIE ich wybrać. Te testy pilnują ogniwa, którego brakowało, i
 * jego dwóch granic: (1) zapisujemy WYŁĄCZNIE zmienione pole (pominięcie ≠ null, inaczej
 * jeden wybór kasowałby pozostałe wiązania), (2) wyczyszczenie wysyła JAWNY `null`, żeby
 * reguła gotowości znów zobaczyła brak danej zamiast starej wartości.
 *
 * Klikamy natywnie (`userEvent`), nie `fireEvent.click` na węźle — precedens martwego lewego
 * klika w kanwie SLD: syntetyczne zdarzenia latami maskowały defekt realnej ścieżki.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomainOpResponseV1 } from '../../../../types/enm';
import { DerWiazaniaEditor } from '../DerWiazaniaEditor';

/** Realne wpisy katalogu backendu — identyfikator wymyślony sprawdzałby atrapę (V12K-239). */
const CT_REALNY = {
  id: 'ct_200_5_5p10_10va_abb',
  name: 'CT 200/5 A kl. 5P10 10 VA',
  manufacturer: 'ABB',
  accuracy_class: '5P10',
};
const CT_REALNY_2 = {
  id: 'ct_150_1_0_5_10va_abb',
  name: 'CT 150/1 A kl. 0.5 10 VA',
  manufacturer: 'ABB',
  accuracy_class: '0.5',
};

const originalFetch = global.fetch;

interface ZapisaneZadanie {
  readonly url: string;
  readonly metoda: string;
  readonly body: Record<string, unknown>;
}

let zadania: ZapisaneZadanie[] = [];
let odpowiedzPatch: { ok: boolean; status: number; payload: unknown } = {
  ok: true,
  status: 200,
  payload: null,
};

function odpowiedzOperacji(): DomainOpResponseV1 {
  return {
    snapshot: { substations: [], generators: [] } as unknown as DomainOpResponseV1['snapshot'],
    logical_views: {} as DomainOpResponseV1['logical_views'],
    readiness: {} as DomainOpResponseV1['readiness'],
    fix_actions: [],
    changes: {} as DomainOpResponseV1['changes'],
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: {} as DomainOpResponseV1['materialized_params'],
    layout: {} as DomainOpResponseV1['layout'],
  };
}

function stubFetch(): void {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    const metoda = init?.method ?? 'GET';
    if (metoda === 'PATCH') {
      zadania.push({
        url,
        metoda,
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      });
      return {
        ok: odpowiedzPatch.ok,
        status: odpowiedzPatch.status,
        statusText: 'PATCH',
        json: async () => odpowiedzPatch.payload ?? odpowiedzOperacji(),
      } as unknown as Response;
    }
    if (url.startsWith('/api/catalog/ct-types')) {
      return { ok: true, status: 200, json: async () => [CT_REALNY, CT_REALNY_2] } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => [] } as unknown as Response;
  }) as unknown as typeof fetch;
}

function renderEditor(
  nadpisania: Partial<Parameters<typeof DerWiazaniaEditor>[0]> = {},
): { poZapisie: ReturnType<typeof vi.fn> } {
  const poZapisie = vi.fn();
  render(
    <DerWiazaniaEditor
      derId="DER-1"
      projectId="PRJ-1"
      caseId="CASE-1"
      wartosci={{
        protection_catalog_ref: 'ACME_REX200_v1',
        ct_catalog_ref: null,
        vt_catalog_ref: null,
      }}
      etykietaTypu={() => null}
      poZapisie={poZapisie}
      {...nadpisania}
    />,
  );
  return { poZapisie };
}

describe('DerWiazaniaEditor — wybór wiązań katalogowych wytwórcy', () => {
  beforeEach(() => {
    zadania = [];
    odpowiedzPatch = { ok: true, status: 200, payload: null };
    stubFetch();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('wybór przekładnika w pickerze zapisuje WYŁĄCZNIE zmienione pole', async () => {
    const uzytkownik = userEvent.setup();
    const { poZapisie } = renderEditor();

    await uzytkownik.click(screen.getByTestId('der-wiazanie-wybierz-ct_catalog_ref'));
    const wiersz = await screen.findByText(CT_REALNY.name);
    await uzytkownik.click(wiersz);

    await waitFor(() => expect(zadania).toHaveLength(1));
    expect(zadania[0].url).toBe('/api/projects/PRJ-1/cases/CASE-1/generators/DER-1/bindings');
    // Dokładnie JEDEN klucz: gdyby żądanie niosło komplet wiązań, wybór przekładnika
    // nadpisywałby zabezpieczenie i VT wartościami z ekranu (cicha utrata danych).
    expect(Object.keys(zadania[0].body)).toEqual(['ct_catalog_ref']);
    expect(zadania[0].body.ct_catalog_ref).toBe(CT_REALNY.id);
    expect(poZapisie).toHaveBeenCalledWith(
      'ct_catalog_ref',
      CT_REALNY.id,
      expect.objectContaining({ snapshot: expect.anything() }),
    );
  });

  it('„Wyczyść" wysyła JAWNY null, a nie pominięcie pola', async () => {
    const uzytkownik = userEvent.setup();
    renderEditor({
      wartosci: { ct_catalog_ref: CT_REALNY.id },
      etykietaTypu: () => CT_REALNY.name,
    });

    await uzytkownik.click(screen.getByTestId('der-wiazanie-wyczysc-ct_catalog_ref'));

    await waitFor(() => expect(zadania).toHaveLength(1));
    expect(zadania[0].body).toEqual({ ct_catalog_ref: null });
    // Kontrola odwrotna: pominięcie NIE kasuje — gdyby „Wyczyść" wysyłało `{}` albo
    // pomijało pole, backend zostawiłby stare wiązanie i ekran kłamałby o usunięciu.
    expect('ct_catalog_ref' in zadania[0].body).toBe(true);
  });

  it('bez wybranego przypisania nie ma czego czyścić (brak przycisku „Wyczyść")', () => {
    renderEditor();
    expect(screen.queryByTestId('der-wiazanie-wyczysc-ct_catalog_ref')).toBeNull();
    expect(screen.getByTestId('der-wiazanie-wyczysc-protection_catalog_ref')).toBeTruthy();
  });

  it('błąd zapisu jest POKAZANY, a wołający nie dostaje potwierdzenia', async () => {
    odpowiedzPatch = {
      ok: false,
      status: 422,
      payload: {
        detail: {
          code: 'der_bindings.catalog_ref_unknown',
          message_pl: 'Typ katalogowy nie istnieje: ct_widmo.',
        },
      },
    };
    const uzytkownik = userEvent.setup();
    const { poZapisie } = renderEditor({ wartosci: { ct_catalog_ref: CT_REALNY.id } });

    await uzytkownik.click(screen.getByTestId('der-wiazanie-wyczysc-ct_catalog_ref'));

    const blad = await screen.findByTestId('der-wiazania-blad');
    expect(blad.textContent).toContain('Typ katalogowy nie istnieje');
    expect(poZapisie).not.toHaveBeenCalled();
  });

  it('bez projektu i przypadku obliczeniowego zapis jest zablokowany, a powód nazwany', async () => {
    const uzytkownik = userEvent.setup();
    renderEditor({ projectId: null, caseId: null });

    expect(screen.getByTestId('der-wiazania-brak-kontekstu')).toBeTruthy();
    const przycisk = screen.getByTestId('der-wiazanie-wybierz-ct_catalog_ref') as HTMLButtonElement;
    expect(przycisk.disabled).toBe(true);
    await uzytkownik.click(przycisk).catch(() => undefined);
    expect(zadania).toHaveLength(0);
  });

  it('przypisanie znane katalogowi pokazuje NAZWĘ, nieznane — kreskę, brak — polecenie wyboru', () => {
    renderEditor({
      wartosci: {
        protection_catalog_ref: 'ACME_REX200_v1',
        ct_catalog_ref: CT_REALNY.id,
        vt_catalog_ref: null,
      },
      // Nazwa rozwiązana TYLKO dla CT: zabezpieczenie ma przypisanie, którego katalog nie
      // zna — ekran nie może wtedy kazać wybierać czegoś, co JUŻ wybrano.
      etykietaTypu: (pole) => (pole === 'ct_catalog_ref' ? CT_REALNY.name : null),
    });

    expect(screen.getByTestId('der-wiazanie-wartosc-ct_catalog_ref').textContent).toBe(
      CT_REALNY.name,
    );
    expect(screen.getByTestId('der-wiazanie-wartosc-protection_catalog_ref').textContent).toBe('—');
    expect(screen.getByTestId('der-wiazanie-wartosc-vt_catalog_ref').textContent).toBe(
      'wybierz wariant katalogowy',
    );
  });

  it('wiązania bez katalogu w backendzie są NAZWANE, a nie udawane pickerem', () => {
    renderEditor();
    const sekcja = screen.getByTestId('der-wiazania-editor');
    expect(sekcja.textContent).toContain('Dane prądu zwarciowego');
    expect(sekcja.textContent).toContain('Model dynamiczny');
    expect(screen.queryByTestId('der-wiazanie-wybierz-fault_current_data_ref')).toBeNull();
    expect(screen.queryByTestId('der-wiazanie-wybierz-dynamic_model_ref')).toBeNull();
  });
});
