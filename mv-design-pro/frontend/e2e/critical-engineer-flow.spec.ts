/**
 * K30-28: Critical engineer workflow E2E test.
 *
 * Verifies the full engineer flow added in K30-16..K30-27:
 * 1. Backend API: station-templates listing + categories
 * 2. Template preview endpoint (live preview)
 * 3. Template apply endpoint (creates station)
 * 4. Resulting ENM has expected elements (station + bays + transformer + feeders)
 *
 * Korekta 2026-10-28: końcówka podpowiedzi katalogu (K30-23) skasowana
 * (zero konsumentów produkcyjnych — jedynymi były trzy testy API tego pliku);
 * typy elementów wybiera projektant z katalogu w formularzach, a zgodność napięć, mocy
 * i izolacji ocenia operacja domenowa (odmowa nazwana, próba `dry_run`).
 *
 * This test runs against running mock or real backend (E2E:RUN=real).
 * Per project conventions: vitest files run in the forks pool (vite.config.ts), Playwright
 * z mock backend by default.
 */

import { test, expect } from '@playwright/test';

// Adres backendu z TEJ SAMEJ zmiennej co pozostale specy real-backend i runner
// (`scripts/playwright-run-real.mjs`): wlasna zmienna `API_BASE` sprawiala, ze przy biegu
// na innym porcie testy API tego pliku trafialy w cudzy/zastany backend na 8000.
const API_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';

test.describe('critical engineer flow — station templates end-to-end', () => {
  test('GET /api/station-templates returns 71 templates across 15 categories', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/station-templates`);
    expect(response.ok()).toBe(true);
    const data = await response.json();
    // 73 z planu minus 2 szablony wiatrowe wycofane 2026-10-15 (backend
    // `wiatrowe.SZABLONY_WIATROWE_WYCOFANE`) — liczba dokładna, jak w testach backendu.
    expect(data.total).toBe(71);
    expect(data.templates.length).toBe(data.total);
    // Verify all 15 categories represented (K30-16's 10 + V12T-016's 5: rola
    // A GPZ_110_SN/ROZDZIELNIA_SIECIOWA, rola C STACJA_ABONENCKA, rola E
    // KOMPENSACJA/REZERWA_ZASILANIA).
    const categories = new Set(data.templates.map((t: { category: string }) => t.category));
    expect(categories.size).toBe(15);
    expect(categories.has('gpz_110_sn')).toBe(true);
    expect(categories.has('rozdzielnia_sieciowa')).toBe(true);
    expect(categories.has('stacja_abonencka')).toBe(true);
    expect(categories.has('kompensacja')).toBe(true);
    expect(categories.has('rezerwa_zasilania')).toBe(true);
  });

  test('GET /api/station-templates/categories returns 15 categories incl. rola A', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/station-templates/categories`);
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.categories.length).toBe(15);
    expect(data.total_templates).toBe(71);

    // Verify icons present per category
    for (const cat of data.categories) {
      expect(cat.id).toBeTruthy();
      expect(cat.label_pl).toBeTruthy();
      expect(cat.icon).toBeTruthy();
      expect(cat.template_count).toBeGreaterThan(0);
    }

    // V12T-016 (rola A „Zasilanie sieci" — licznik ZERO przed tą kartą):
    // GPZ_110_SN musi mieć ≥1 szablon, żeby przeglądarka nie pokazała
    // ponownie zerowego licznika roli A.
    const gpz = data.categories.find((c: { id: string }) => c.id === 'gpz_110_sn');
    expect(gpz).toBeTruthy();
    expect(gpz.template_count).toBeGreaterThanOrEqual(1);
    expect(gpz.label_pl).toBe('GPZ 110/SN');
  });

  test('GET /api/station-templates/{id} returns full schema z editable params', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/station-templates/tpl_sn_nn_630kva`);
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.id).toBe('tpl_sn_nn_630kva');
    expect(data.schema.transformer_options.length).toBeGreaterThan(0);
    expect(data.schema.sn_bays_count.min_value).toBeLessThanOrEqual(data.schema.sn_bays_count.default);
    expect(data.schema.sn_bays_count.max_value).toBeGreaterThanOrEqual(data.schema.sn_bays_count.default);
    expect(data.schema.nn_feeders_count.min_value).toBeLessThanOrEqual(data.schema.nn_feeders_count.default);
    // E2Tango protection must be present
    const protectionRefs = data.schema.sn_bay_protection_options.map(
      (p: { device_catalog_ref: string }) => p.device_catalog_ref,
    );
    expect(protectionRefs.some((p: string) => p.includes('E2TANGO'))).toBe(true);
  });

  test('POST /api/station-templates/{id}/preview returns live config dry-run', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/station-templates/tpl_sn_nn_630kva/preview`, {
      data: {
        params_override: { nn_feeders_count: 6, sn_bays_count: 4 },
        catalog_profile: 'ZPUE Włoszczowa',
      },
    });
    expect(response.ok()).toBe(true);
    const preview = await response.json();
    expect(preview.template_id).toBe('tpl_sn_nn_630kva');
    expect(preview.effective_config.nn_feeders_count).toBe(6);
    expect(preview.effective_config.sn_bays_count).toBe(4);
    expect(preview.catalog_profile_applied).toBe('ZPUE Włoszczowa');
    expect(preview.estimated_elements_count).toBeGreaterThan(6);
  });

  // V12T-016 (karta SZABLONY-ROLA-A): dokumentacja u góry pliku obiecuje
  // krok „Template apply endpoint (creates station)" od K30-28, ale ŻADEN
  // test w tym pliku nigdy nie wywoływał `/apply` — luka między deklaracją a
  // pokryciem. GPZ_110_SN (rola A) jest tu wybrany CELOWO: to jedyna
  // kategoria, dla której `target_segment_id` jest opcjonalny (GPZ jest
  // korzeniem modelu — `add_grid_source_sn`, nie wcięcie w istniejący
  // segment) — test dowodzi końca do końca, że kontrakt API (`target_
  // segment_id: str | None`) i domena (`apply_template_to_case`) działają
  // razem na PRAWDZIWYM backendzie, nie tylko w testach jednostkowych.
  test('POST /api/station-templates/tpl_gpz_sn_15_2s_4p/apply creates GPZ without target_segment_id', async ({
    request,
  }) => {
    const suffix = String(Date.now());
    const projectResponse = await request.post(`${API_BASE}/api/projects`, {
      data: {
        name: `E2E GPZ ${suffix}`,
        description: 'V12T-016 rola A — apply GPZ_110_SN na pustym projekcie',
        mode: 'TO-BE',
        voltage_level_kv: 15.0,
        frequency_hz: 50.0,
      },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()) as { id: string };

    const caseResponse = await request.post(`${API_BASE}/api/study-cases`, {
      data: {
        project_id: project.id,
        name: `Przypadek GPZ ${suffix}`,
        description: '',
        config: {},
        set_active: true,
      },
    });
    expect(caseResponse.ok()).toBe(true);
    const studyCase = (await caseResponse.json()) as { id: string };

    const applyResponse = await request.post(
      `${API_BASE}/api/station-templates/tpl_gpz_sn_15_2s_4p/apply`,
      {
        data: {
          case_id: studyCase.id,
          target_segment_id: null,
          params_override: {},
        },
      },
    );
    expect(applyResponse.ok(), await applyResponse.text()).toBe(true);
    const result = await applyResponse.json();
    expect(result.template_id).toBe('tpl_gpz_sn_15_2s_4p');
    expect(typeof result.station_ref).toBe('string');
    expect(result.station_ref.length).toBeGreaterThan(0);
    expect(result.created_element_refs.length).toBeGreaterThan(0);
    expect(result.snapshot_hash).toBeTruthy();
  });

  // Endpoint zweryfikowany jako WPIĘTY (karta FE-HIGIENA, 2026-09-05):
  // `backend/src/api/catalog.py::list_protection_device_types`
  // (`@router.get("/protection/device-types")`) odpowiada 200 na żywym
  // backendzie i — gdy aktywna biblioteka jest pusta — spada na katalog
  // analityczny `backend/src/application/analyses/protection/catalog/
  // catalog_store.py::list_devices` (źródło danych: `data/devices_v0.json`,
  // 51 urządzeń / 10 nazwanych producentów + 1 profil referencyjny bez marki
  // = 11 unikalnych wartości `vendor` łącznie z `None`). Dawny bezwarunkowy
  // skip wewnątrz testu (gałąź „if (!response.ok())") maskował to na stałe
  // niezależnie od realnej odpowiedzi backendu — usunięty; test wywołuje
  // końcówkę naprawdę.
  test('protection database covers 51+ devices / 10 vendors', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/catalog/protection/device-types`);
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.length).toBeGreaterThanOrEqual(51);
    const vendors = new Set(data.map((d: { vendor?: string; params?: { vendor?: string } }) =>
      d.vendor || d.params?.vendor,
    ));
    expect(vendors.size).toBeGreaterThanOrEqual(10);
  });
});
