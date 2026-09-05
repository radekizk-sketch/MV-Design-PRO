/**
 * Testy napraw audytu eksperckiego (3 perspektywy: profesor + projektant SN +
 * specjalista zabezpieczeń). Pokrywa Naprawy A-D.
 */

import { describe, it, expect } from 'vitest';

import {
  // Naprawa A: DER_FAULT_CURRENT_DATA_CATALOG/computeKappa/getFaultCurrentDataForDevice
  // (Naprawa A.1/A.3) i DER_DYNAMIC_MODEL_CATALOG/getDynamicModelForDevice (Naprawa A.5)
  // USUNIĘTE (karta FAB-L, 2026-09-05) — zero konsumenta solvera (κ i składowe symetryczne
  // liczy WYŁĄCZNIE IEC 60909 z modelu sieci); model dynamiczny ma dziś realnego dostawcę
  // (`GET /api/catalog/der-dynamic-profiles`, `network_model.catalog.der_dynamic`), którego
  // front konsumuje przez `derRemoteCatalogs.ts`, nie przez statyk tego modułu. Patrz pin w
  // `__tests__/catalogs.test.ts`.
  // Naprawa B
  SN_CONNECTION_POINT_KIND_CATALOG,
  // Naprawa C
  isCtClassValidForProtection,
  // Naprawa D
  validateHostingCapacity,
  computeDerReadinessMatrix,
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  type StationDerConnection,
} from '..';

const FROZEN_NOW = '2026-05-06T10:00:00Z';

function makeDer(
  overrides: Partial<StationDerConnection> = {},
): StationDerConnection {
  return {
    id: 'der_x',
    project_id: 'p',
    station_id: 's',
    der_kind: 'PV',
    name: 'PV X',
    // Karta FAB-K (§0 R3): dawny gołosłowny wariant `'SN'` (bez transformatora
    // dedykowanego) USUNIĘTY — domyślnie nN (najmniej specjalnych gałęzi reguł
    // gotowości; ten plik testuje dane zwarciowe/ochronne, nie topologię SN).
    connection_side: 'nN',
    bus_przylaczenia_ref: 'pcc_x',
    bay_ref: 'bay_x',
    transformer_ref: null,
    lv_busbar_ref: null,
    sn_connection_bus_ref: null,
    sn_connection_point_kind: null,
    connection_voltage_kv: null,
    catalogs: { ...EMPTY_DER_CATALOGS, device_catalog_ref: 'pv_inv_sma_2500' },
    profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'ncrfg_pse' },
    nominal_power_kw: 2500,
    unit_count: null,
    completeness: 'complete',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: FROZEN_NOW,
    updated_at: FROZEN_NOW,
    ...overrides,
  };
}

// =============================================================================
// Naprawa A — profesor energetyki
// =============================================================================

// USUNIĘTE (karta FAB-L, 2026-09-05) — „Naprawa A.1 — składowe symetryczne (R₀/X₀/Z₀Z₁)".
// Testowała `DER_FAULT_CURRENT_DATA_CATALOG`/`getFaultCurrentDataForDevice` — katalog
// R₁/X₁/R₂/X₂/R₀/X₀/Z₀·Z₁⁻¹ per urządzenie, wpisywany z ręki bez konsumenta solvera.
// Inwentarz przed usunięciem (`enm/mapping.py`, `network_model/solvers/
// short_circuit_iec60909.py`): solver czyta z katalogu konwertera WYŁĄCZNIE `k_sc` i
// hardkoduje `contributes_negative_sequence=True`/`contributes_zero_sequence=False`
// niezależnie od jakiegokolwiek pola katalogowego — R₀/X₀/Z₀·Z₁⁻¹/κ nigdy nie docierały
// do solvera. Jeśli SC1F/SC2FG naprawdę wymagają modelu składowej zerowej źródła
// przekształtnikowego, to luka solvera (B-01 — rdzeń zamrożony, zgoda właściciela), nie
// coś do obejścia w UI. Patrz pin w `__tests__/catalogs.test.ts`.

// USUNIĘTE (karta FAB-J, 2026-09-05) — „Naprawa A.2 — c_max/c_min IEC 60909".
// Testowała `NC_RFG_PROFILE_CATALOG.c_max`/`.c_min`/`.sk_min_to_p_ratio_by_module` —
// drugą kopię profilu operatora, którego jedyne źródło jest dziś backend
// (`GET /api/ncrfg-tests/catalog`). c_max/c_min IEC 60909-0 Tab.1 to STAŁA
// normy używana bezpośrednio przez solver zwarciowy (`network_model/solvers/
// short_circuit_iec60909.py`), nie dana katalogowa operatora — front jej nie
// duplikuje. `sk_min_to_p_ratio_by_module` (NC RfG Art.17, Naprawa B.4 poniżej)
// backend nie niesie wcale (sprawdzone u źródła rozporządzenia), więc pole i
// katalog, którego jedynym celem było jej karmienie, zniknęły razem.

// USUNIĘTE (karta FAB-L, 2026-09-05) — „Naprawa A.3 — kappa (peak SC factor IEC 60909)".
// `computeKappa` liczył κ = 1,02 + 0,98·exp(-3·R/X) — DOKŁADNIE tym samym wzorem co solver
// IEC 60909 (`network_model/solvers/short_circuit_iec60909.py`), ale z danych, których
// solver nigdy nie czytał (patrz uzasadnienie przy „Naprawa A.1" powyżej). Ekran, który
// chce pokazać κ, czyta je z `ShortCircuitResult` (solver), nie liczy go drugi raz w UI.

describe('Karta K-Q → FAB-J — katalogi urządzeń mirrorowane z frontu USUNIĘTE', () => {
  // INTENCJA POPRZEDNICH TESTÓW (Naprawa A.4, potem Karta K-Q): pilnowały, że
  // pozycje mirrorowanych katalogów PV/BESS/FW NIE niosą wartości wpisanych z
  // ręki bez karty producenta (graniczny prąd zwarciowy, dane mechaniczne
  // turbiny, producent baterii). Karta FAB-J usuwa OSTATNI powód takiej
  // kontroli: front przestał mieć WŁASNĄ kopię tych katalogów w ogóle —
  // `PV_INVERTER_CATALOG`/`BESS_PCS_CATALOG`/`BESS_BATTERY_CATALOG`/
  // `WIND_TURBINE_CATALOG` są usunięte z `catalogs.ts` (pin niżej), więc nie ma
  // już DRUGIEGO miejsca, w którym taka fabrykacja mogłaby się schować.
  // Jedyne źródło jest dziś backend (`GET /api/catalog/converter-types`,
  // `GET /api/catalog/bess-battery-types`) — dyscyplinę „bez wartości z ręki"
  // pilnują testy backendu tych katalogów, nie ten plik.
  it('catalogs.ts NIE MA już mirrorowanych katalogów urządzeń PV/BESS/FW/baterii', async () => {
    const modul = (await import('../catalogs')) as Record<string, unknown>;
    expect(modul.PV_INVERTER_CATALOG).toBeUndefined();
    expect(modul.BESS_PCS_CATALOG).toBeUndefined();
    expect(modul.BESS_BATTERY_CATALOG).toBeUndefined();
    expect(modul.WIND_TURBINE_CATALOG).toBeUndefined();
  });

  // USUNIĘTE (karta FAB-L, 2026-09-05) — „DER_FAULT_CURRENT_DATA_CATALOG (zostaje —
  // wariant modelu, nie karta wyrobu) nie deklaruje granicznego prądu zwarciowego".
  // Katalog sam USUNIĘTY (zero konsumenta solvera — patrz „Naprawa A.1" powyżej), więc
  // pin jego zawartości nie ma już czego pilnować; zastąpiony pinem NIEOBECNOŚCI w
  // `__tests__/catalogs.test.ts` (`expect(modul.DER_FAULT_CURRENT_DATA_CATALOG).toBeUndefined()`).
});

// USUNIĘTE (karta FAB-L, 2026-09-05) — „Naprawa A.5 — modele dynamiczne DER". Testowała
// `DER_DYNAMIC_MODEL_CATALOG`/`getDynamicModelForDevice` — katalog statyczny frontu z
// auto-doborem „po urządzeniu" (`applicable_device_ids`). Backend MA dziś realnego
// dostawcę (`network_model.catalog.der_dynamic`, wystawiony przez
// `GET /api/catalog/der-dynamic-profiles`) — auto-dobór po urządzeniu backend NIE wyraża,
// więc front go nie odtwarza (wybór jawny albo brak, nigdy cichy domyślny). Pokrycie:
// `backend/tests/api/test_catalog_api.py::test_der_dynamic_profiles_endpoint_exposes_white_box_parameters`
// i `derRemoteCatalogs.test.ts` (front).

// USUNIĘTE (karta FAB-J, 2026-09-05) — „Naprawa B.4 — validateMinSkAtPcc (NC RfG
// Art.17)". Zależała wyłącznie od `sk_min_to_p_ratio_by_module` usuniętego profilu
// NC RfG (patrz komentarz przy „Naprawa A.2" powyżej) i nie miała konsumenta
// produkcyjnego poza własnym testem — backend nie niesie tego pola (sprawdzone na
// tekście rozporządzenia (UE) 2016/631: nie definiuje ono minimalnej mocy zwarciowej
// w PCC jako funkcji typu modułu w sposób, który dałoby się zredukować do jednej
// stałej ratio na typ), więc funkcja zniknęła razem z katalogiem, którego jedynym
// celem było jej karmienie.

// =============================================================================
// Naprawa B — projektant SN
// =============================================================================

// USUNIĘTE (karta FAB-L, 2026-09-05) — „Naprawa B.1 — uziemienie neutralne (4 typy)"
// (w tym pin klasy „KARTA K-O": żadna pozycja nie niesie zgadywanego I_k1/cudzej
// praktyki/liczbowego I_k1 w etykiecie). `MV_NEUTRAL_GROUNDING_CATALOG` USUNIĘTY
// z `catalogs.ts` jako bloк statyczny — front czyta go dziś WYŁĄCZNIE ze snapshotu
// audytu 2 (`useAudit2CatalogSnapshot`), więc katalog nie ma już frontowej kopii,
// której zawartość dałoby się tu przypiąć. Cała intencja (rozmiar/typy, zero
// zgadywanego I_k1, zero cudzej praktyki operatorów, zero liczbowego I_k1 w
// etykiecie) PRZENIESIONA na backend — jedyne miejsce, gdzie dane te dziś żyją:
// `backend/tests/network_model/test_audit2_katalogi_parytet.py`
// (`test_pole_bez_proweniencji_nie_wraca_do_zadnej_z_warstw`,
// `test_cudze_imie_nie_wraca_do_danych_katalogow_audytu2` — rozszerzony o PGE/PSE,
// `test_zadna_pozycja_uziemienia_sn_nie_podaje_liczbowego_ik1_w_etykiecie_ani_opisie`
// — nowy). Selektor `getMvNeutralGrounding` skasowany przy odbiorze FAB-L: zero
// konsumentów produktu (karta czyta uziemienie wprost z listy snapshotu w
// `StationConfigBasicCard`), a test bez produktu to dług (L4), nie pokrycie.

/**
 * Karta FAB-K (§0 R3, KLASA NIE INSTANCJA): `CONNECTION_VARIANT_CATALOG`
 * (6 „wariantów przyłączenia", w tym 3 „pozastacjonarne": `at_zksn`,
 * `at_branch_pole`, `at_cable_joint") mieszał POZIOM przyłączenia z PUNKTEM
 * przyłączenia SN w jednym enumie UI — cztery z sześciu wariantów dawały
 * gwarantowany 422 (brak pickera transformatora dedykowanego). Punkt
 * przyłączenia SN jest teraz `SnConnectionPointKind` — RODZAJ elementu modelu
 * (`SN_CONNECTION_POINT_KIND_CATALOG`, WYŁĄCZNIE etykiety, nie enum wyboru:
 * kandydaci pochodzą z migawki, `AddDerWizard.tsx::selectSnConnectionPointCandidates`).
 * `at_cable_joint` (mufa) zniknął całkowicie — mufa nie ma topologii w modelu.
 * Dawne ograniczenie „BESS nie może na słupie rozgałęźnym" nie ma odpowiednika
 * w nowym modelu: kandydatury punktu SN nie są filtrowane po rodzaju DER (żaden
 * fizyczny powód nie ogranicza BESS do konkretnego rodzaju punktu SN, skoro
 * `CONNECTION_LEVEL_CATALOG.level_dedicated.applicable_der_kinds` dopuszcza
 * PV/BESS/FW jednakowo) — test usunięty, nie przepisany na inny fakt.
 */
describe('SnConnectionPointKindCatalog (dawna Naprawa B.2 — punkt przyłączenia SN)', () => {
  it('katalog rodzajów punktu SN ma 4 pozycje (szyna stacji, ZK SN, słup rozgałęźny, odgałęzienie)', () => {
    expect(SN_CONNECTION_POINT_KIND_CATALOG.length).toBe(4);
    const kinds = SN_CONNECTION_POINT_KIND_CATALOG.map((v) => v.kind);
    expect(kinds).toContain('zksn');
    expect(kinds).toContain('branch_pole');
    expect(kinds).toContain('junction');
    expect(kinds).not.toContain('at_cable_joint');
  });

  it('ZK SN wymaga zabezpieczenia kierunkowego (67/67N)', () => {
    const zksn = SN_CONNECTION_POINT_KIND_CATALOG.find((v) => v.kind === 'zksn');
    expect(zksn?.description_pl).toMatch(/kierunkow/);
  });
});

// =============================================================================
// Naprawa C — specjalista zabezpieczeń
// =============================================================================

// USUNIĘTE (karta FAB-M, 2026-09-05) — całe „Naprawa C.1 — ANSI function
// catalog": `PROTECTION_FUNCTION_CATALOG` (+ typy `ProtectionFunctionItem`/
// `AnsiFunctionCode` + selektory `selectRequiredProtectionFunctionsForDer`/
// `selectRequiredProtectionFunctionsForGrounding`/
// `getProtectionFunctionByAnsiCode`) USUNIĘTE z `protection-catalogs.ts` —
// ZERO konsumentów produkcyjnych (zmierzone grepem: jedyny importer był ten
// plik). Historyczny konsument `derProtectionSummary()` (defekt P7,
// `docs/uiux/AUDYT_E21_KONFIGURATOR_FALOWNIKA_2026-07.md` — jedna,
// uniwersalna lista ANSI dla KAŻDEJ instalacji, bez uzasadnienia wg topologii/
// uziemienia/wymagań OSD) już nie istnieje w repo; dług widniał otwarty w
// `docs/v12xx/REJESTR_KONFLIKTOW.md` (wiersz K-O) i `docs/plan/
// PLAN_DOKONCZENIA_100_2026-08-14.md` (punkt 3 po K-O) — FAB-M go zamyka.
// Eksport bez konsumenta produktu = dług L4 (wzorzec FAB-L) — kasacja z
// testem, bez migracji (nie ma czego migrować — nikt tego nie woła).

describe('Naprawa C.6 — klasy CT (reguly normowe, bez katalogu syntetycznego)', () => {
  // V12K-239: `CT_CATALOG` (5 wpisow syntetycznych) USUNIETY — po wpieciu klasy jako
  // DANEJ nie mial juz zadnego konsumenta produkcyjnego, a jego pokrycie identyfikatorow
  // z katalogiem realnym (12 typow) bylo ZEROWE, wiec test jego rozmiaru mierzyl atrape.
  // `VT_CATALOG` USUNIETY (V12K-257): ten sam defekt co CT — identyfikatory syntetyczne
  // wpisywane do modelu przez picker. Dlug zapisany wtedy osobno zostal splacony:
  // picker bierze typy z katalogu backendu, a werdykt zgodnosci z jego reguly.
  // Tutaj zostaja reguly klasowe, ktore CZYTA regula gotowosci.
  it('isCtClassValidForProtection rozpoznaje 5P/10P', () => {
    expect(isCtClassValidForProtection('5P10')).toBe(true);
    expect(isCtClassValidForProtection('10P20')).toBe(true);
    expect(isCtClassValidForProtection('0.5')).toBe(false);
    expect(isCtClassValidForProtection('1.0')).toBe(false);
  });

  // USUNIĘTE (karta FAB-M, 2026-09-05) — „isCtClassValidForMetering rozpoznaje
  // 0.2/0.5/1.0": funkcja ZERO konsumentów produkcyjnych (zmierzone grepem —
  // jedyny importer był ten test; `readiness.ts` czyta wyłącznie
  // `isCtClassValidForProtection`, który zostaje). Kasacja z testem (wzorzec
  // L4 FAB-L), bez migracji. Test rozłączności niżej przepisany, żeby nie
  // czytać już usuniętej funkcji, z zachowaniem intencji (klasy pomiarowe
  // WPROST z unii `CtClass`, nie z drugiego predykatu).

  it('front NIE MA wlasnego katalogu VT ani wlasnej reguly wspolczynnika (V12K-257)', async () => {
    // Te dwa testy sprawdzaly wczesniej zawartosc `VT_CATALOG` i `selectVtForVoltage`
    // — czyli istnienie ROWNOLEGLEGO katalogu czterech typow, ktorych identyfikatory
    // nie istnialy w katalogu backendu, oraz TRZECIEJ kopii reguly IEC 61869-3
    // (z progami zanizonymi tak, jak poprawil je V12K-256). Zapisany wybor byl
    // referencja donikad, a werdykt móglby przeczyc backendowi i pakietowi dowodowemu.
    //
    // Intencja testu zostaje ta sama — pilnowac zrodla danych o przekladnikach —
    // ale odwrocona: front ma ich NIE MIEC. Typy pochodza z `/api/catalog/vt-types`,
    // werdykt z `/api/v1/catalog/audit2/validate-vt-grounding`.
    const modul = (await import('../protection-catalogs')) as Record<string, unknown>;
    expect(modul.VT_CATALOG).toBeUndefined();
    expect(modul.selectVtForVoltage).toBeUndefined();
    expect(modul.isVtVoltageFactorValidForGrounding).toBeUndefined();
  });

  it('rozlacznosc: zadna klasa pomiarowa (0.2/0.5/1.0) nie jest jednoczesnie zabezpieczeniowa', () => {
    // Karta FAB-M: `isCtClassValidForMetering` usunięty (zero konsumenta
    // produktu) — klasy pomiarowe wypisane WPROST z zamrożonej unii `CtClass`
    // (jedyne trzy, które NIE zaczynają się od „5P"/„10P"), nie z drugiego
    // predykatu. Intencja bez zmian: żadna klasa nie jest jednocześnie
    // zabezpieczeniowa i pomiarowa.
    for (const klasa of ['0.2', '0.5', '1.0'] as const) {
      expect(isCtClassValidForProtection(klasa)).toBe(false);
    }
  });
});

// USUNIĘTE (karta FAB-M, 2026-09-05) — całe „Naprawa C.3 — SPZ catalog" i
// „Naprawa C.4 — SZR catalog": `SPZ_CATALOG`/`SzrCatalogItem`+`SZR_CATALOG`
// (+ selektor `selectSpzCompatibleWithDer`) USUNIĘTE z `protection-
// catalogs.ts` — ZERO konsumentów produkcyjnych (zmierzone grepem: jedyny
// importer SPZ_CATALOG poza definicją to ten plik i `audit-round2-fixes.
// test.ts`; SZR_CATALOG tylko ten plik). Backendowy `application/analyses/
// protection/line_overcurrent_setting/spz_lookup.py` jest INNĄ zdolnością
// (progi blokady SPZ wg prądu/czasu zwarcia), nie katalogiem profili cykli —
// nie ma tu duplikatu do migracji. Dług widniał otwarty w `docs/v12xx/
// REJESTR_KONFLIKTOW.md` (wiersz K-O) i `docs/plan/
// PLAN_DOKONCZENIA_100_2026-08-14.md` (punkt 3 po K-O) — FAB-M go zamyka.
// Eksport bez konsumenta produktu = dług L4 (wzorzec FAB-L) — kasacja z
// testem, bez migracji.

// =============================================================================
// Naprawa D — readiness aware grounding + hosting capacity
// =============================================================================

describe('Naprawa D — readiness z grounding-aware (uwzględnia A.5)', () => {
  // Karta FAB-L (2026-09-05): dawne „SC1F → partial gdy brak fault_current_data (A.1)"
  // / „SC1F → ready gdy fault_current_data jest podany" USUNIĘTE razem z polem —
  // `fault_current_data_ref` nie miało ŻADNEGO konsumenta solvera (κ i składowe
  // symetryczne liczy IEC 60909 z modelu sieci, nie z deklaracji urządzenia), więc
  // blokowanie SC1F/SC2FG jego brakiem było fałszywą barierą. Obie osie dziś
  // ZAWSZE pokrywają się z SC3F/SC2F — pełne pokrycie iloczynu cech (stan
  // urządzenia × oś) jest w `readiness.test.ts`, nie tutaj (ten plik testuje
  // `computeDerReadinessMatrix` przez inny import — `..` zamiast `../readiness` —
  // ale to TA SAMA funkcja, patrz jej definicja).
  it('SC1F/SC2FG pokrywają się z SC3F/SC2F niezależnie od stanu urządzenia (dawna A.1)', () => {
    const matrix = computeDerReadinessMatrix(makeDer());
    expect(matrix.sc_1f).toBe(matrix.sc_3f);
    expect(matrix.sc_2fg).toBe(matrix.sc_2f);
    expect(matrix.sc_3f).toBe('ready');
  });

  it('FRT/HVRT → "partial" gdy brak dynamic_model_ref (A.5)', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        profiles: {
          ...EMPTY_DER_PROFILES,
          nc_rfg_profile_ref: 'ncrfg_pse',
          lvrt_curve_ref: 'lvrt_pse_b',
          hvrt_curve_ref: 'hvrt_pse_b',
        },
      }),
    );
    expect(matrix.frt).toBe('partial');
    expect(matrix.hvrt).toBe('partial');
  });

  it('FRT/HVRT → "ready" gdy dynamic_model_ref jest podany', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        profiles: {
          ...EMPTY_DER_PROFILES,
          nc_rfg_profile_ref: 'ncrfg_pse',
          lvrt_curve_ref: 'lvrt_pse_b',
          hvrt_curve_ref: 'hvrt_pse_b',
        },
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          dynamic_model_ref: 'dyn_pv_gfl_typical',
        },
      }),
    );
    expect(matrix.frt).toBe('ready');
    expect(matrix.hvrt).toBe('ready');
  });
});

describe('Naprawa D — validateHostingCapacity (B.3)', () => {
  it('utilization ≤ 80% → ok', () => {
    const result = validateHostingCapacity({
      station_id: 's',
      busbar_kind: 'lv_busbar',
      busbar_ref: 'bb_main',
      ders: [
        makeDer({ id: 'der_a', lv_busbar_ref: 'bb_main', nominal_power_kw: 200 }),
        makeDer({ id: 'der_b', lv_busbar_ref: 'bb_main', nominal_power_kw: 150 }),
      ],
      capacity_limit_kw: 630, // 630 kVA transformator
    });
    expect(result.status).toBe('ok');
    expect(result.utilization_percent).toBeCloseTo((350 / 630) * 100, 1);
  });

  it('utilization 80-100% → warning', () => {
    const result = validateHostingCapacity({
      station_id: 's',
      busbar_kind: 'lv_busbar',
      busbar_ref: 'bb_main',
      ders: [makeDer({ id: 'der_a', lv_busbar_ref: 'bb_main', nominal_power_kw: 550 })],
      capacity_limit_kw: 630,
    });
    expect(result.status).toBe('warning');
  });

  it('utilization > 100% → exceeded z polskim message', () => {
    const result = validateHostingCapacity({
      station_id: 's',
      busbar_kind: 'lv_busbar',
      busbar_ref: 'bb_main',
      ders: [
        makeDer({ id: 'a', lv_busbar_ref: 'bb_main', nominal_power_kw: 800 }),
        makeDer({ id: 'b', lv_busbar_ref: 'bb_main', nominal_power_kw: 800 }),
      ],
      capacity_limit_kw: 1000,
    });
    expect(result.status).toBe('exceeded');
    expect(result.message_pl).toContain('Przekroczona zdolność');
    expect(result.message_pl).toContain('redukcja mocy DER');
  });
});
