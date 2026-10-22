/**
 * Dane projektu szablonu GPZ H5 w kreatorze stacji — ścieżka NATYWNA (`userEvent`: klik,
 * pisanie, wybór z listy), bez wymuszania stanu kreatora.
 *
 * Fikstura `fixtures/tplGpzH5_110_15.json` to odpowiedź `GET /api/station-templates/
 * tpl_gpz_h5_110_15_2x25mva` scalonego backendu (pomiar 2026-10-22; listy opcji katalogu
 * skrócone do pozycji domyślnych i dwóch aparatów SN) — `dane_projektu` dosłownie z backendu.
 *
 * Iloczyn cech:
 *  - rodzaj danej (lista wartości z kontraktu × tekst × tory 110 kV × numer transformatora ×
 *    aparat SN × dana nieobsługiwana) — każdy rodzaj ma pole i swój kształt w ładunku;
 *  - stan danej (pusta × wypełniona × nieprawidłowa liczba × wyczyszczona po wypełnieniu) —
 *    blokada zastosowania pojawia się i znika parami z wypełnieniem;
 *  - wymagalność (zawsze × z warunkiem tekstowym) — dana z warunkiem nie blokuje, ale gdy
 *    wypełniona, trafia do ładunku w kształcie operacji;
 *  - lokalizacja (szablon korzenia modelu × szablon wpinany w odcinek) — GPZ przechodzi krok
 *    lokalizacji bez odcinka i wysyła `target_segment_id: null`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StationTemplateWizard } from '../StationTemplateWizard';
import { brakiDanychProjektu, odczytajDana, zapiszDana } from '../DaneProjektuSzablonu';
import type { StationTemplateFull } from '../api';
import TPL_H5_JSON from './fixtures/tplGpzH5_110_15.json';

const TPL_H5 = TPL_H5_JSON as unknown as StationTemplateFull;
const CASE_ID = '00000000-0000-0000-0000-0000000000a5';
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

let zadaniaZastosowania: Array<Record<string, unknown>> = [];

function odpowiedz(data: unknown): Response {
  return { ok: true, json: async () => data } as unknown as Response;
}

function zFetch(template: StationTemplateFull) {
  return (url: string, init?: RequestInit) => {
    if (url === '/api/station-templates/categories') {
      return Promise.resolve(odpowiedz({ categories: [], total_templates: 0 }));
    }
    if (url === `/api/station-templates/${template.id}`) return Promise.resolve(odpowiedz(template));
    if (url === `/api/station-templates/${template.id}/apply` && init?.method === 'POST') {
      zadaniaZastosowania.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Promise.resolve(
        odpowiedz({
          template_id: template.id,
          template_name_pl: template.name_pl,
          station_ref: 'stn/h5',
          created_element_refs: ['stn/h5'],
          operations_log: [{ op: 'add_grid_source_sn' }],
          catalog_profile_applied: null,
          snapshot_hash: 'h',
        }),
      );
    }
    if (url === `/api/station-templates/${template.id}/preview`) {
      return Promise.resolve({ ok: false, status: 422, json: async () => ({ detail: 'podgląd' }) } as unknown as Response);
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({ detail: 'Not found' }) } as unknown as Response);
  };
}

beforeEach(() => {
  zadaniaZastosowania = [];
  mockFetch.mockReset();
  mockFetch.mockImplementation(zFetch(TPL_H5));
});

async function doParametrow(user: ReturnType<typeof userEvent.setup>) {
  render(<StationTemplateWizard caseId={CASE_ID} initialTemplateId={TPL_H5.id} />);
  await waitFor(() => screen.getByTestId('lokalizacja-korzen-modelu'));
  await user.click(screen.getByTestId('wizard-next'));
  await waitFor(() => screen.getByTestId('dane-projektu'));
}

async function doZatwierdzenia(user: ReturnType<typeof userEvent.setup>) {
  for (const krok of ['profile', 'preview', 'apply'] as const) {
    await user.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId(`wizard-step-content-${krok}`));
  }
}

const TOR = {
  line_name: ['L1', 'L2'],
  supplying_station_name: ['Stacja A', 'Stacja B'],
  hv_voltage_kv: ['110', '110'],
  sk3_hv_mva: ['2500', '1800'],
  rx_ratio: ['0,1', '0.1'],
} as const;

async function wypelnijTory(user: ReturnType<typeof userEvent.setup>) {
  for (const [pole, wartosci] of Object.entries(TOR)) {
    for (const [i, w] of wartosci.entries()) {
      await user.type(screen.getByTestId(`tor-110-${i + 1}-${pole}`), w);
    }
  }
}

function pole(klucz: string): HTMLElement {
  return within(screen.getByTestId(`dana-projektu-${klucz}`)).getByRole(
    klucz === 'hv_coupler.justification' ? 'textbox' : 'combobox',
  );
}

describe('Dane projektu szablonu GPZ H5 — formularz kreatora', () => {
  it('każda dana z kontraktu ma pole z etykietą, podpowiedzią, podstawą i wymagalnością; listy bez domyślnej', async () => {
    const user = userEvent.setup();
    await doParametrow(user);
    const rodzaje = TPL_H5.schema.dane_projektu.map((d) => [
      d.klucz,
      screen.getByTestId(`dana-projektu-${d.klucz}`).getAttribute('data-rodzaj'),
    ]);
    expect(rodzaje).toEqual([
      ['hv_sections', 'tory_110'],
      ['hv_coupler.normal_state', 'wybor'],
      ['hv_coupler.justification', 'tekst'],
      ['reserve_mode', 'wybor'],
      ['reserve_transformer', 'numer_transformatora'],
      ['reserve_transformer_apparatus', 'aparat_sn'],
    ]);
    for (const d of TPL_H5.schema.dane_projektu) {
      const blok = within(screen.getByTestId(`dana-projektu-${d.klucz}`));
      expect(blok.getByText(d.label_pl.replace(/^„|”$/g, ''))).toBeTruthy();
      expect(blok.getByText(d.podpowiedz_pl)).toBeTruthy();
      expect(blok.getByText(`Podstawa: ${d.podstawa_pl}`)).toBeTruthy();
      expect(screen.getByTestId(`dana-projektu-warunek-${d.klucz}`).textContent).toBe(
        d.warunek_pl === '' ? 'Wymagalność: zawsze' : `Wymagalność: ${d.warunek_pl}`,
      );
    }
    // Listy wyboru startują od „— wybierz —” (brak wartości domyślnej w kontrakcie).
    for (const klucz of ['hv_coupler.normal_state', 'reserve_mode', 'reserve_transformer', 'reserve_transformer_apparatus']) {
      expect((pole(klucz) as HTMLSelectElement).value).toBe('');
    }
    expect(
      within(pole('hv_coupler.normal_state')).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['— wybierz —', 'otwarty', 'zamknięty']);
    expect(
      within(pole('reserve_transformer')).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['— wybierz —', 'Transformator 1', 'Transformator 2']);
  });

  it('zastosowanie zablokowane do wypełnienia danych wymaganych zawsze; blokada wraca po wyczyszczeniu', async () => {
    const user = userEvent.setup();
    await doParametrow(user);
    const braki = () =>
      Array.from(screen.queryByTestId('dane-projektu-braki')?.querySelectorAll('li') ?? []).map((li) =>
        li.getAttribute('data-testid'),
      );
    expect(braki()).toEqual([
      'dane-projektu-brak-hv_sections.1',
      'dane-projektu-brak-hv_sections.2',
      'dane-projektu-brak-hv_coupler.normal_state',
      'dane-projektu-brak-reserve_mode',
    ]);
    await wypelnijTory(user);
    expect(braki()).toEqual([
      'dane-projektu-brak-hv_coupler.normal_state',
      'dane-projektu-brak-reserve_mode',
    ]);
    // Nieprawidłowa liczba: pole oznaczone, dana usunięta, brak toru wraca.
    const sk = screen.getByTestId('tor-110-2-sk3_hv_mva');
    await user.clear(sk);
    await user.type(sk, '-5');
    expect(sk.getAttribute('aria-invalid')).toBe('true');
    expect(braki()[0]).toBe('dane-projektu-brak-hv_sections.2');
    expect(screen.getByTestId('dane-projektu-brak-hv_sections.2').textContent).toContain('Sk″ max [MVA]');
    await user.clear(sk);
    await user.type(sk, '1800');
    await user.selectOptions(pole('hv_coupler.normal_state'), 'open');
    await user.selectOptions(pole('reserve_mode'), 'hidden');
    expect(screen.queryByTestId('dane-projektu-braki')).toBeNull();

    // Wyczyszczenie danej po wypełnieniu przywraca blokadę (para: wypełnij / wyczyść).
    await user.selectOptions(pole('reserve_mode'), '');
    expect(braki()).toEqual(['dane-projektu-brak-reserve_mode']);
    await doZatwierdzenia(user);
    expect((screen.getByTestId('wizard-apply') as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByTestId('wizard-step-content-apply')).getByTestId('dane-projektu-braki')).toBeTruthy();
    await user.click(screen.getByTestId('wizard-apply'));
    expect(zadaniaZastosowania).toEqual([]);
  });

  it('rezerwa ukryta, ŁS 110 kV otwarty: ładunek w kształcie operacji, bez odcinka, bez danych warunkowych', async () => {
    const user = userEvent.setup();
    await doParametrow(user);
    await wypelnijTory(user);
    await user.selectOptions(pole('hv_coupler.normal_state'), 'open');
    await user.selectOptions(pole('reserve_mode'), 'hidden');
    await doZatwierdzenia(user);
    await user.click(screen.getByTestId('wizard-apply'));
    await waitFor(() => screen.getByTestId('apply-success'));
    expect(zadaniaZastosowania).toHaveLength(1);
    const [zadanie] = zadaniaZastosowania;
    expect(zadanie.case_id).toBe(CASE_ID);
    expect(zadanie.target_segment_id).toBeNull();
    const nadpisania = zadanie.params_override as Record<string, unknown>;
    expect(nadpisania.hv_sections).toEqual([
      {
        supply: {
          line_name: 'L1',
          supplying_station_name: 'Stacja A',
          manual_equivalent: { hv_voltage_kv: 110, sk3_hv_mva: 2500, rx_ratio: 0.1 },
        },
      },
      {
        supply: {
          line_name: 'L2',
          supplying_station_name: 'Stacja B',
          manual_equivalent: { hv_voltage_kv: 110, sk3_hv_mva: 1800, rx_ratio: 0.1 },
        },
      },
    ]);
    expect(nadpisania.hv_coupler).toEqual({ normal_state: 'open' });
    expect(nadpisania.reserve_mode).toBe('hidden');
    expect('reserve_transformer' in nadpisania).toBe(false);
    expect('reserve_transformer_apparatus' in nadpisania).toBe(false);
  });

  it('rezerwa jawna i ŁS 110 kV zamknięty: dane warunkowe w kształcie operacji (liczba, wiązanie katalogu, tekst)', async () => {
    const user = userEvent.setup();
    await doParametrow(user);
    await wypelnijTory(user);
    for (const [i, w] of ['1800', '1200'].entries()) {
      await user.type(screen.getByTestId(`tor-110-${i + 1}-sk3_min_mva`), w);
      await user.type(screen.getByTestId(`tor-110-${i + 1}-z0_z1_ratio`), '1,2');
    }
    await user.selectOptions(pole('hv_coupler.normal_state'), 'closed');
    await user.type(pole('hv_coupler.justification'), 'Wspólny punkt zasilania');
    await user.selectOptions(pole('reserve_mode'), 'explicit');
    await user.selectOptions(pole('reserve_transformer'), '2');
    await user.selectOptions(pole('reserve_transformer_apparatus'), 'sw-cb-abb-vd4-17kv-630a');
    await doZatwierdzenia(user);
    await user.click(screen.getByTestId('wizard-apply'));
    await waitFor(() => screen.getByTestId('apply-success'));
    const nadpisania = zadaniaZastosowania[0].params_override as Record<string, unknown>;
    expect(nadpisania.hv_coupler).toEqual({ normal_state: 'closed', justification: 'Wspólny punkt zasilania' });
    expect(nadpisania.reserve_mode).toBe('explicit');
    expect(nadpisania.reserve_transformer).toBe(2);
    expect(nadpisania.reserve_transformer_apparatus).toEqual({ catalog_ref: 'sw-cb-abb-vd4-17kv-630a' });
    const tory = nadpisania.hv_sections as Array<{ supply: { manual_equivalent: Record<string, number> } }>;
    expect(tory.map((t) => [t.supply.manual_equivalent.sk3_min_mva, t.supply.manual_equivalent.z0_z1_ratio])).toEqual([
      [1800, 1.2],
      [1200, 1.2],
    ]);
  });

  it('dana spoza rejestru pól i bez listy wartości blokuje zastosowanie z przyczyną (bez cichego pominięcia)', async () => {
    const obca = {
      ...TPL_H5,
      schema: {
        ...TPL_H5.schema,
        dane_projektu: [
          ...TPL_H5.schema.dane_projektu,
          // Z warunkiem tekstowym: dana nieobsługiwana blokuje niezależnie od wymagalności
          // (formularz nie umie jej podać, więc nie może też ocenić, że jest zbędna).
          { ...TPL_H5.schema.dane_projektu[2], klucz: 'nowa_dana', label_pl: '„Nowa dana”', warunek_pl: 'wymagane przy X' },
        ],
      },
    } as StationTemplateFull;
    mockFetch.mockImplementation(zFetch(obca));
    const user = userEvent.setup();
    await doParametrow(user);
    expect(screen.getByTestId('dana-projektu-nowa_dana').getAttribute('data-rodzaj')).toBe('nieobslugiwana');
    await wypelnijTory(user);
    await user.selectOptions(pole('hv_coupler.normal_state'), 'open');
    await user.selectOptions(pole('reserve_mode'), 'hidden');
    expect(screen.getByTestId('dane-projektu-brak-nowa_dana').textContent).toBe(
      '„Nowa dana”: kreator nie ma pola wejścia dla tej danej szablonu — zastosowanie zablokowane, zgłoś brak.',
    );
    await doZatwierdzenia(user);
    expect((screen.getByTestId('wizard-apply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('szablon wpinany w odcinek bez danych projektu: brak sekcji, krok lokalizacji wymaga odcinka', async () => {
    const wpinany = {
      ...TPL_H5,
      id: 'tpl_wpinany',
      category: 'typowa_sn_nn',
      wchodzi_w_segment: true,
      schema: { ...TPL_H5.schema, gpz_uklad: null, dane_projektu: [] },
    } as StationTemplateFull;
    mockFetch.mockImplementation(zFetch(wpinany));
    const user = userEvent.setup();
    render(<StationTemplateWizard caseId={CASE_ID} initialTemplateId="tpl_wpinany" />);
    await waitFor(() => screen.getByTestId('wizard-step-content-location'));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/station-templates/tpl_wpinany'));
    expect(screen.queryByTestId('lokalizacja-korzen-modelu')).toBeNull();
    expect((screen.getByTestId('wizard-next') as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByTestId('wizard-next'));
    expect(screen.queryByTestId('wizard-step-content-params')).toBeNull();
    expect(brakiDanychProjektu(wpinany, {})).toEqual([]);
  });
});

describe('Ścieżka danej w params_override (zapis / odczyt parami)', () => {
  it('zapis zagnieżdżony, odczyt, usunięcie z pustym obiektem nadrzędnym', () => {
    const a = zapiszDana({ x: 1 }, 'hv_coupler.normal_state', 'open');
    expect(a).toEqual({ x: 1, hv_coupler: { normal_state: 'open' } });
    const b = zapiszDana(a, 'hv_coupler.justification', 'u');
    expect(odczytajDana(b, 'hv_coupler.justification')).toBe('u');
    const c = zapiszDana(zapiszDana(b, 'hv_coupler.justification', undefined), 'hv_coupler.normal_state', undefined);
    expect(c).toEqual({ x: 1 });
    expect(odczytajDana(c, 'hv_coupler.normal_state')).toBeUndefined();
    expect(a).toEqual({ x: 1, hv_coupler: { normal_state: 'open' } });
  });
});
