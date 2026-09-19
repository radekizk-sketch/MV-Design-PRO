/**
 * Testy modeli dynamicznych DER (karta FAB-L) — `derRemoteCatalogs.ts`.
 *
 * Katalog jest WYŁĄCZNIE backendowy (`GET /api/catalog/der-dynamic-profiles`,
 * `network_model.catalog.der_dynamic`) — front nie ma już własnej kopii
 * (`DER_DYNAMIC_MODEL_CATALOG` usunięty z `catalogs.ts`). Te testy pilnują
 * WYŁĄCZNIE funkcji czystych operujących na katalogu podanym przez wołającego
 * (`getDerDynamicProfile`, `selectDerDynamicProfilesForKind`,
 * `formatDerDynamicProfileLabelPl`) i kontraktu URL-a/uczciwego stanu pustego
 * `fetchDerDynamicProfiles` — nie duplikują pokrycia solvera (RMS/FRT-HVRT),
 * które jest po stronie backendu (`backend/tests/network_model/catalog/`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchDerDynamicProfiles,
  formatDerDynamicProfileLabelPl,
  formatProweniencjaZrodloLabelPl,
  getDerDynamicProfile,
  selectDerDynamicProfilesForKind,
  type DerDynamicProfileItem,
} from '../derRemoteCatalogs';

const PV_GFL: DerDynamicProfileItem = {
  profile_id: 'default_pv_gfl',
  profile_name_pl: 'PV grid-following domyślny',
  der_kind: 'PV',
  control_mode: 'grid_following',
  tp_s: 0.02,
  tq_s: 0.02,
  p_f_droop_pu: 0.05,
  p_f_dead_band_hz: 0.2,
  q_u_droop_pu: 4.0,
  q_u_dead_band_pu: 0.02,
  i_max_pu: 1.2,
  v_min_continuous_pu: 0.9,
  v_max_continuous_pu: 1.1,
  frt_response_time_ms: 20,
  iq_max_during_fault_pu: 1.0,
  iq_priority_during_fault: true,
  p_recovery_rate_pu_per_s: 0.2,
  p_recovery_delay_ms: 0,
  virtual_inertia_h_s: null,
  proweniencja: { zrodlo: 'profil_typowy_normy', odniesienie: 'IEEE 1547-2018 §5-8', data: null },
};

const BESS_GFM: DerDynamicProfileItem = {
  ...PV_GFL,
  profile_id: 'default_bess_gfm',
  profile_name_pl: 'BESS grid-forming domyślny',
  der_kind: 'BESS',
  control_mode: 'grid_forming',
};

const WIND_TYPE4: DerDynamicProfileItem = {
  profile_id: 'default_wind_type_4',
  profile_name_pl: 'Turbina typu 4 (pełny przekształtnik)',
  der_kind: 'FW',
  iec_type: 'type_4',
  h_total_s: 4.5,
  drive_train_stiffness_pu: 0.3,
  tp_s: 0.02,
  tq_s: 0.02,
  pitch_rate_deg_per_s: 8,
  pitch_min_deg: 0,
  pitch_max_deg: 27,
  frt_response_time_ms: 20,
  iq_max_during_fault_pu: 1.1,
  p_recovery_rate_pu_per_s: 0.2,
  p_recovery_delay_ms: 0,
  slip_steady_pu: 0,
  v_min_continuous_pu: 0.9,
  v_max_continuous_pu: 1.1,
  proweniencja: {
    zrodlo: 'profil_typowy_normy',
    odniesienie: 'IEC 61400-27-1:2020 (generyczne modele dynamiczne typ 1-4)',
    data: null,
  },
};

const KATALOG: readonly DerDynamicProfileItem[] = [PV_GFL, BESS_GFM, WIND_TYPE4];

describe('getDerDynamicProfile', () => {
  it('zwraca dopasowany profil po profile_id', () => {
    expect(getDerDynamicProfile(KATALOG, 'default_bess_gfm')).toBe(BESS_GFM);
  });

  it('zwraca null gdy profile_id jest null (brak wyboru, nie błąd)', () => {
    expect(getDerDynamicProfile(KATALOG, null)).toBeNull();
  });

  it('zwraca null gdy profile_id nie istnieje w podanym katalogu', () => {
    expect(getDerDynamicProfile(KATALOG, 'nie_istnieje')).toBeNull();
  });
});

describe('selectDerDynamicProfilesForKind', () => {
  it('filtruje WYŁĄCZNIE profile pasującego rodzaju DER — PV/BESS/FW rozłączne', () => {
    expect(selectDerDynamicProfilesForKind(KATALOG, 'PV')).toEqual([PV_GFL]);
    expect(selectDerDynamicProfilesForKind(KATALOG, 'BESS')).toEqual([BESS_GFM]);
    expect(selectDerDynamicProfilesForKind(KATALOG, 'FW')).toEqual([WIND_TYPE4]);
  });

  it('zwraca pustą listę, gdy katalog nie ma profilu danego rodzaju', () => {
    expect(selectDerDynamicProfilesForKind([PV_GFL], 'FW')).toEqual([]);
  });
});

describe('formatDerDynamicProfileLabelPl', () => {
  it('falownik (PV/BESS): pokazuje tryb regulacji + droop P/f + czas odpowiedzi + proweniencję', () => {
    expect(formatDerDynamicProfileLabelPl(PV_GFL)).toBe(
      'PV grid-following domyślny (grid-following, droop P/f=5%, t_odp=0.02 s)'
        + ' [profil typowy normy: IEEE 1547-2018 §5-8]',
    );
    expect(formatDerDynamicProfileLabelPl(BESS_GFM)).toBe(
      'BESS grid-forming domyślny (grid-forming, droop P/f=5%, t_odp=0.02 s)'
        + ' [profil typowy normy: IEEE 1547-2018 §5-8]',
    );
  });

  it('turbina (FW): pokazuje typ IEC + inercję H + czas odpowiedzi FRT + proweniencję — NIE tryb falownika', () => {
    expect(formatDerDynamicProfileLabelPl(WIND_TYPE4)).toBe(
      'Turbina typu 4 (pełny przekształtnik) (IEC typu 4, H=4.5 s, FRT 20 ms)'
        + ' [profil typowy normy: IEC 61400-27-1:2020 (generyczne modele dynamiczne typ 1-4)]',
    );
  });

  it('proweniencja karty producenta/certyfikatu/deklaracji ma osobną etykietę PL', () => {
    expect(formatProweniencjaZrodloLabelPl('karta_producenta')).toBe('karta producenta');
    expect(formatProweniencjaZrodloLabelPl('certyfikat_jednostki')).toBe('certyfikat jednostki');
    expect(formatProweniencjaZrodloLabelPl('profil_typowy_normy')).toBe('profil typowy normy');
    expect(formatProweniencjaZrodloLabelPl('deklaracja_uzytkownika')).toBe('deklaracja użytkownika');
  });

  it('etykieta profilu z karty producenta odzwierciedla proweniencję w nawiasie', () => {
    const zKartyProducenta: DerDynamicProfileItem = {
      ...PV_GFL,
      proweniencja: {
        zrodlo: 'karta_producenta',
        odniesienie: 'DS-SMA-2026-0417',
        data: '2026-04-17',
      },
    };
    expect(formatDerDynamicProfileLabelPl(zKartyProducenta)).toContain(
      '[karta producenta: DS-SMA-2026-0417]',
    );
  });
});

describe('fetchDerDynamicProfiles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('woła WYŁĄCZNIE `/api/catalog/der-dynamic-profiles` (jedyne źródło, karta FAB-L)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([PV_GFL]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const wynik = await fetchDerDynamicProfiles();

    expect(fetchMock).toHaveBeenCalledWith('/api/catalog/der-dynamic-profiles');
    expect(wynik).toEqual([PV_GFL]);
  });

  it('uczciwy stan pusty (nie undefined) gdy backend zwróci payload spoza kontraktu', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ nieoczekiwany: 'ksztalt' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchDerDynamicProfiles()).toEqual([]);
  });

  it('rzuca błąd (nie połyka go cicho) gdy backend odpowie statusem błędu', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve(null),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDerDynamicProfiles()).rejects.toThrow(/500/);
  });
});
