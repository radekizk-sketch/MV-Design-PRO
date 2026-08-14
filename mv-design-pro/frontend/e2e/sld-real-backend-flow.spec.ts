/**
 * E2E real-backend — operacyjny flow utworzenia projektu i przejścia do budowy
 * GPZ. Pokazuje wizualnie:
 * 1. Dashboard z formularzem "Utwórz projekt SN" (polski UI).
 * 2. Utworzenie projektu przez UI (klik "Nowy projekt").
 * 3. Po-utworzeniu screenshot dashboard z aktywnym projektem.
 * 4. Klik "Przejdź do budowy GPZ" — screenshot SLD canvas z aktywnym
 *    projektem (operacyjny widok bez ENM).
 *
 * Wymaga: backend na :8000 + dev server na :5173.
 * Uruchomienie:
 *   poetry run uvicorn src.api.main:app --port 8000 &
 *   npm run dev &
 *   PLAYWRIGHT_DISABLE_WEBSERVER=1 \
 *     ./node_modules/.bin/playwright test e2e/sld-real-backend-flow.spec.ts \
 *     --project=chromium
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'audits',
  'screenshots',
);

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', {
    state: 'attached',
    timeout: 15_000,
  });
}

test.describe('Real-backend: utworzenie projektu i przejście do SLD', () => {
  test('dashboard z aktywnym backendem — lista projektów ładuje się', async ({ page }) => {
    await page.goto('/#dashboard');
    await waitForAppReady(page);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(SCREENSHOT_DIR, 'dashboard-backend-live.png'),
      fullPage: true,
    });
    // Sprawdź że tytuł "Środowisko inżynierskie MV-DESIGN-PRO" widoczny.
    await expect(page.getByText(/Środowisko inżynierskie/i)).toBeVisible({ timeout: 5_000 });
  });

  test('API /api/catalog/manufacturers zwraca 5 producentów requires_catalog', async ({
    page,
  }) => {
    // 5. producent SCHNEIDER_ELECTRIC dodany w programie Reference Engine V1
    // (REFERENCE_ENGINE_SPEC_V1.md, rodzina SM6-24). Intencja testu bez
    // zmian: rejestr zawiera DOKŁADNIE znanych producentów, wszyscy
    // requires_catalog (nie fabrykuj danych producenta).
    const response = await page.request.get('/api/catalog/manufacturers');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      manufacturer_ref: string;
      status: string;
      source_refs: string[];
    }>;
    expect(body.length).toBe(5);
    const refs = body.map((m) => m.manufacturer_ref).sort();
    expect(refs).toEqual(['ABB', 'ELEKTROMETAL', 'SCHNEIDER_ELECTRIC', 'SIEMENS', 'ZPUE_WLOSZCZOWA']);
    // NIE fabrykuj — wszyscy startowi requires_catalog.
    for (const m of body) {
      expect(m.status).toBe('requires_catalog');
      expect(m.source_refs).toEqual([]);
    }
  });

  test('API /api/catalog/complete-bay-templates zwraca zweryfikowane szablony producentów', async ({
    page,
  }) => {
    const response = await page.request.get('/api/catalog/complete-bay-templates');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      template_ref: string;
      manufacturer_ref: string | null;
      source_status: string;
      bay_kind: string;
      source_refs?: string[];
    }>;
    expect(body.length).toBeGreaterThanOrEqual(30);
    for (const t of body) {
      expect(t.source_status).toBe('repo_verified');
      expect(t.manufacturer_ref).toBeTruthy();
      expect(t.source_refs?.length ?? 0).toBeGreaterThan(0);
    }
    // Wszystkie wymagane bay_kind kategorie pokryte.
    const kinds = new Set(body.map((t) => t.bay_kind));
    for (const required of [
      'liniowe_doplywowe',
      'liniowe_odplywowe',
      'pomiarowe',
      'sprzeglowe_poprzeczne',
      'transformatorowe',
    ]) {
      expect(kinds.has(required)).toBe(true);
    }
  });

  test('API /api/catalog/complete-bay-templates?manufacturer_ref=ABB zwraca tylko szablony ABB ze źródłami', async ({
    page,
  }) => {
    const response = await page.request.get(
      '/api/catalog/complete-bay-templates?manufacturer_ref=ABB',
    );
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      manufacturer_ref: string | null;
      source_status: string;
      source_refs?: string[];
    }>;
    expect(body.length).toBeGreaterThanOrEqual(8);
    for (const t of body) {
      expect(t.manufacturer_ref).toBe('ABB');
      expect(t.source_status).toBe('repo_verified');
      expect(t.source_refs?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('API /api/catalog/switchgear-families — każda rodzina z kompletem pól i uczciwym statusem źródła', async ({
    page,
  }) => {
    // INTENCJA (bez zmian): endpoint wystawia rodziny rozdzielnic SN, a KAŻDA
    // z nich nadaje się do użycia przez konfigurator — ma komplet pól i jawną,
    // udokumentowaną proweniencję (nigdy dane z głowy).
    //
    // DLACZEGO NIE „length === 7" (poprawka 2026-08-14): poprzednia wersja
    // zamrażała LICZBĘ i IMIENNĄ listę siedmiu rodzin. Po scaleniu kanonu
    // rozdzielnic rejestr ma ich 18 (dołączyły ZPUE TPM/TPM Air/Rotoblok
    // Air/Rotoblok VCB/RELF/RELF 2S/RXD, ABB SafePlus/UniSec, Schneider
    // RM6/RM AirSeT). Dokładny skład rejestru jest już PRZYPIĘTY po stronie
    // backendu (`tests/network_model/catalog/test_switchgear_families.py`
    // → `test_registry_has_all_known_families`); powielanie tej liczby tutaj
    // tworzyło DRUGIE źródło prawdy, które gniło przy każdym poszerzeniu
    // katalogu. E2E pinuje więc KLASĘ kontraktu API, a nie licznik.
    const response = await page.request.get('/api/catalog/switchgear-families');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{
      switchgear_family_ref: string;
      manufacturer_ref: string;
      family_name: string;
      status: string;
      source_refs: string[];
      source_document_refs: string[];
      notes_pl: string;
      network_voltages_kv: number[];
      um_classes_kv: number[];
      rated_current_options: number[];
      short_time_current_options: number[];
      allowed_bay_kinds: string[];
      tor_konfiguracji: string | null;
    }>;
    expect(body.length).toBeGreaterThan(0);

    // Wiązanie z rejestrem producentów — na tym stoi łańcuch UI
    // „wybierz producenta → wybierz rodzinę". `manufacturer_ref` rodziny musi
    // istnieć w `/api/catalog/manufacturers`, inaczej filtr producenta w
    // kreatorze pokaże pustkę bez żadnego komunikatu.
    const producenciResponse = await page.request.get('/api/catalog/manufacturers');
    expect(producenciResponse.ok()).toBe(true);
    const znaniProducenci = new Set(
      ((await producenciResponse.json()) as Array<{ manufacturer_ref: string }>).map(
        (m) => m.manufacturer_ref,
      ),
    );

    // Determinizm kolejności: rejestr jest sortowany po `switchgear_family_ref`.
    const refs = body.map((f) => f.switchgear_family_ref);
    expect(refs).toEqual([...refs].sort());
    // Brak duplikatów — ref jest kluczem rejestru.
    expect(new Set(refs).size).toBe(refs.length);

    for (const f of body) {
      const gdzie = f.switchgear_family_ref;
      // Tożsamość rodziny: ref w postaci kanonicznej `PRODUCENT__LINIA`
      // (człon producenta bywa skrótem handlowym — ZPUE_WLOSZCZOWA vs
      // SCHNEIDER dla SCHNEIDER_ELECTRIC — więc wiążące jest osobne pole
      // `manufacturer_ref`, sprawdzane niżej wobec rejestru producentów).
      expect(gdzie, gdzie).toMatch(/^[A-Z0-9_]+__[A-Z0-9_]+$/);
      expect(znaniProducenci.has(f.manufacturer_ref), `${gdzie} → ${f.manufacturer_ref}`).toBe(
        true,
      );
      expect(f.family_name.length, gdzie).toBeGreaterThan(0);
      expect(f.notes_pl.length, gdzie).toBeGreaterThan(0);

      // Proweniencja OBOWIĄZKOWA — publiczne adresy https, nigdy dane z głowy.
      expect(f.source_refs.length, gdzie).toBeGreaterThan(0);
      expect(f.source_document_refs.length, gdzie).toBeGreaterThan(0);
      for (const ref of [...f.source_refs, ...f.source_document_refs]) {
        expect(ref, gdzie).toMatch(/^https:\/\//);
      }

      // Status ze zbioru UCZCIWEGO: `repo_verified` = publiczna karta
      // producenta; `requires_catalog` = karta nie podaje kompletu klas.
      // `official_catalog` wymagałby zatwierdzonego PDF od producenta —
      // żadna rodzina nie może go dziś deklarować.
      expect(['repo_verified', 'requires_catalog'], gdzie).toContain(f.status);

      // Deklaracja napięciowa: karta podaje napięcia SIECI albo klasy
      // URZĄDZENIA (albo oba). Obie listy puste = rodzina, której nie da się
      // dopasować do żadnej szyny.
      expect(f.network_voltages_kv.length + f.um_classes_kv.length, gdzie).toBeGreaterThan(0);
      for (const napiecie of [...f.network_voltages_kv, ...f.um_classes_kv]) {
        expect(napiecie, gdzie).toBeGreaterThan(0);
      }

      if (f.status === 'requires_catalog') {
        // Zapadka polityki danych: brak karty deklarowany PUSTYMI listami,
        // nigdy zerami ani zmyślonymi klasami.
        expect(f.rated_current_options, gdzie).toEqual([]);
        expect(f.short_time_current_options, gdzie).toEqual([]);
      } else {
        // Rodzina oferowana MUSI mieć komplet klas znamionowych — inaczej
        // walidator zgodności nie ma czym odpowiedzieć projektantowi.
        expect(f.rated_current_options.length, gdzie).toBeGreaterThan(0);
        expect(f.short_time_current_options.length, gdzie).toBeGreaterThan(0);
        expect(Math.min(...f.rated_current_options), gdzie).toBeGreaterThan(0);
        expect(Math.min(...f.short_time_current_options), gdzie).toBeGreaterThan(0);
        expect(f.allowed_bay_kinds.length, gdzie).toBeGreaterThan(0);
      }

      // Tor konfiguracji jest WYLICZANY z konstrukcji — rodzina z zadeklarowaną
      // konstrukcją musi trafić do jednego z dwóch torów kreatora.
      expect([null, 'MODULARNY', 'BLOK_RMU'], gdzie).toContain(f.tor_konfiguracji);
    }
  });

  test('API /api/catalog/switchgear-families — rodziny, na których stoi kreator, są obecne', async ({
    page,
  }) => {
    // INTENCJA poprzedniej listy imiennej ZACHOWANA: rodziny, do których
    // odwołują się szablony pól i ścieżki kreatora, nie mogą zniknąć z
    // katalogu. Asercja jest PODZBIOREM (nie równością), więc poszerzenie
    // katalogu jej nie łamie, a usunięcie którejkolwiek — łamie.
    const response = await page.request.get('/api/catalog/switchgear-families');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as Array<{ switchgear_family_ref: string }>;
    const refs = new Set(body.map((f) => f.switchgear_family_ref));
    for (const wymagana of [
      'ABB__SAFERING',
      'ABB__UNIGEAR_ZS1',
      'ELEKTROMETAL__E2ALPHA',
      'SCHNEIDER__SM6_24',
      'SIEMENS__8DJH',
      'SIEMENS__NXAIR',
      'ZPUE_WLOSZCZOWA__ROTOBLOK',
    ]) {
      expect(refs.has(wymagana), wymagana).toBe(true);
    }
  });

  test('API ?manufacturer_ref=… → dokładna projekcja pełnej listy dla KAŻDEGO producenta', async ({
    page,
  }) => {
    // INTENCJA (bez zmian): filtr producenta zwraca rodziny tego producenta.
    //
    // POPRAWKA KLASY (2026-08-14): poprzednio były dwa testy z zamrożonymi
    // listami — ABB → [SafeRing, UniGear ZS1] i SIEMENS → [8DJH, NXAIR].
    // ABB ma dziś cztery rodziny (doszły SafePlus i UniSec), więc pierwsza
    // lista zgniła; druga zgnije przy następnym poszerzeniu. Zamiast dwóch
    // instancji pinujemy KLASĘ: dla KAŻDEGO producenta obecnego w pełnej
    // liście filtr musi zwrócić DOKŁADNIE jego podzbiór — nic nie ginie i nic
    // się nie dokleja. To mocniejsze niż obie zamrożone listy razem.
    const pelna = await page.request.get('/api/catalog/switchgear-families');
    expect(pelna.ok()).toBe(true);
    const wszystkie = (await pelna.json()) as Array<{
      switchgear_family_ref: string;
      manufacturer_ref: string;
    }>;
    const producenci = [...new Set(wszystkie.map((f) => f.manufacturer_ref))].sort();
    expect(producenci.length).toBeGreaterThan(1);

    for (const producent of producenci) {
      const odpowiedz = await page.request.get(
        `/api/catalog/switchgear-families?manufacturer_ref=${encodeURIComponent(producent)}`,
      );
      expect(odpowiedz.ok(), producent).toBe(true);
      const podzbior = (await odpowiedz.json()) as Array<{
        switchgear_family_ref: string;
        manufacturer_ref: string;
      }>;
      const oczekiwane = wszystkie
        .filter((f) => f.manufacturer_ref === producent)
        .map((f) => f.switchgear_family_ref);
      expect(podzbior.map((f) => f.switchgear_family_ref), producent).toEqual(oczekiwane);
      for (const f of podzbior) {
        expect(f.manufacturer_ref, producent).toBe(producent);
      }
    }

    // Producent nieistniejący → pusta lista (nie błąd, nie pełna lista).
    const pusty = await page.request.get(
      '/api/catalog/switchgear-families?manufacturer_ref=NIEISTNIEJACY_PRODUCENT',
    );
    expect(pusty.ok()).toBe(true);
    expect(await pusty.json()).toEqual([]);
  });
});
