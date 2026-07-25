/**
 * D2 (RECENZJA_DER_SN_DOBORY_2026-07): test kroku DOBORU — realna ścieżka użytkownika
 * (Zero-Debt §5: natywny klik, nie syntetyczny). Backend (mock fetch) zwraca propozycję;
 * krok ją prezentuje, a „Zastosuj propozycję" przekazuje ją w górę (payload z propozycji).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConverterType } from '../../../../ui/catalog/types';
import { DoborToruSn } from '../DoborToruSn';
import { DANE_DER_SN_DOMYSLNE } from '../zrodloOzeModel';

const KONWERTER: ConverterType = {
  id: 'conv-pv-500',
  name: 'Falownik PV 500 kW',
  kind: 'PV',
  un_kv: 0.4,
  sn_mva: 0.5,
  pmax_mw: 0.499,
} as ConverterType;

const RESPONSE = {
  sum_apparent_power_mva: 0.998,
  transformer_current_a: 38.49,
  transformer: {
    proposal: {
      catalog_ref: 'tr-1000',
      name: 'TR 1000 kVA 15/0.4',
      sn_mva: 1.0,
      primary_kv: 15.0,
      secondary_kv: 0.4,
      uk_percent: 6.0,
      vector_group: 'Dyn11',
    },
    required_apparent_power_mva: 0.998,
    effective_load_mva: 0.998,
    rejected: [{ catalog_ref: 'tr-630', name: 'TR 630', reason_code: 'moc_niewystarczajaca', reason_pl: 'x' }],
    error_code: null,
    error_pl: null,
    available_vector_groups: ['Dyn11', 'Yd11'],
    formula_ref: 'S_wym',
  },
  cable: {
    proposal: {
      catalog_ref: 'cab-50',
      name: 'Kabel 50 mm²',
      cross_section_mm2: 50,
      rated_current_a: 160,
      delta_u_v: 10,
      delta_u_pct: 0.4,
    },
    required_ampacity_a: 38.49,
    max_delta_u_pct: 2.0,
    rejected: [],
    error_code: null,
    error_pl: null,
    formula_ref: 'Iz',
  },
  field_apparatus: {
    proposal: {
      catalog_ref: 'cb-400',
      name: 'Rozłącznik 400 A',
      equipment_kind: 'LOAD_SWITCH',
      un_kv: 12.0,
      in_a: 400,
      ik_ka: null,
    },
    required_current_a: 38.49,
    rejected: [],
    error_code: null,
    error_pl: null,
    formula_ref: 'In',
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => RESPONSE } as Response));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('DoborToruSn — krok doboru toru SN', () => {
  it('Zaproponuj dobór → prezentuje propozycję; Zastosuj → przekazuje odpowiedź (native click)', async () => {
    const user = userEvent.setup();
    const onZastosuj = vi.fn();
    const derSn = { ...DANE_DER_SN_DOMYSLNE, mv_cable_length_km: 1.0 };

    render(
      <DoborToruSn
        converter={KONWERTER}
        quantity={2}
        snBusVoltageKv={15}
        derSn={derSn}
        onCableLengthChange={() => {}}
        onVectorGroupChange={() => {}}
        onZastosuj={onZastosuj}
        applied={false}
      />,
    );

    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));

    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-dobor-propozycje')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/solver/der-selection-preview');
    expect(screen.getByText(/TR 1000 kVA 15\/0.4/)).toBeInTheDocument();
    expect(screen.getByText(/Kabel 50 mm²/)).toBeInTheDocument();
    expect(screen.getByText(/Rozłącznik 400 A/)).toBeInTheDocument();

    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zastosuj'));
    expect(onZastosuj).toHaveBeenCalledTimes(1);
    expect(onZastosuj.mock.calls[0][0].transformer.proposal.catalog_ref).toBe('tr-1000');
  });

  it('wybór układu połączeń z realnej listy katalogu → callback grupy (native change)', async () => {
    const user = userEvent.setup();
    const onVectorGroupChange = vi.fn();
    const derSn = { ...DANE_DER_SN_DOMYSLNE, mv_cable_length_km: 1.0 };

    render(
      <DoborToruSn
        converter={KONWERTER}
        quantity={2}
        snBusVoltageKv={15}
        derSn={derSn}
        onCableLengthChange={() => {}}
        onVectorGroupChange={onVectorGroupChange}
        onZastosuj={() => {}}
        applied={false}
      />,
    );

    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-dobor-grupa')).toBeInTheDocument());

    // Lista z realnych typów katalogu (nie hardcode): oba układy dostępne, domyślnie z propozycji.
    const select = screen.getByTestId('mvd-kreator-oze-dobor-grupa') as HTMLSelectElement;
    expect(select.value).toBe('Dyn11');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['Dyn11', 'Yd11']);

    await user.selectOptions(select, 'Yd11');
    expect(onVectorGroupChange).toHaveBeenCalledWith('Yd11');
  });

  it('bez długości kabla przycisk doboru jest zablokowany', () => {
    render(
      <DoborToruSn
        converter={KONWERTER}
        quantity={1}
        snBusVoltageKv={15}
        derSn={{ ...DANE_DER_SN_DOMYSLNE, mv_cable_length_km: null }}
        onCableLengthChange={() => {}}
        onVectorGroupChange={() => {}}
        onZastosuj={() => {}}
        applied={false}
      />,
    );
    expect(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Karta F-K5 / V12K-203: przypadek pracy toru DER (cos φ + charakter mocy biernej).
// Dług z V12K-190: backend liczył już wzrost napięcia, ale kreator nie miał czym
// go zamówić ani jak go nazwać — „−1,20 %" wyglądało w tabeli jak spadek.
// ---------------------------------------------------------------------------

/** Odpowiedź z WZROSTEM napięcia (tor generacji) — kształt 1:1 z backendem. */
const RESPONSE_WZROST = {
  ...RESPONSE,
  cable: {
    ...RESPONSE.cable,
    proposal: {
      ...RESPONSE.cable.proposal,
      delta_u_v: -142.68,
      delta_u_pct: -0.9511,
      is_voltage_rise: true,
    },
    flow_direction: 'generation',
    reactive_character: 'inductive',
  },
};

function wyrenderujKrok(onZastosuj = vi.fn()) {
  return render(
    <DoborToruSn
      converter={KONWERTER}
      quantity={2}
      snBusVoltageKv={15}
      derSn={{ ...DANE_DER_SN_DOMYSLNE, mv_cable_length_km: 8.0 }}
      onCableLengthChange={() => {}}
      onVectorGroupChange={() => {}}
      onZastosuj={onZastosuj}
      applied={false}
    />,
  );
}

describe('DoborToruSn — przypadek pracy toru (V12K-203)', () => {
  it('cos φ i charakter mocy biernej jadą do końcówki doboru (zero fizyki w UI)', async () => {
    const user = userEvent.setup();
    wyrenderujKrok();

    await user.clear(screen.getByTestId('mvd-kreator-oze-dobor-cos-phi'));
    await user.type(screen.getByTestId('mvd-kreator-oze-dobor-cos-phi'), '0.95');
    await user.selectOptions(
      screen.getByTestId('mvd-kreator-oze-dobor-charakter-q'),
      'capacitive',
    );
    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.cos_phi).toBe(0.95);
    expect(body.reactive_character).toBe('capacitive');
    // Kierunek mocy czynnej NIE jest polem formularza — tor DER oddaje moc do sieci
    // i backend przyjmuje „generation" jako stałą tego przelicznika.
    expect(body.flow_direction).toBeUndefined();
  });

  it('przy cos φ = 1 wybór charakteru Q jest zablokowany i powiedziany wprost', () => {
    wyrenderujKrok();

    // Domyślnie cos φ = 1 ⇒ sin φ = 0 ⇒ człon bierny zeruje się. Kontrolka, która nie
    // może nic zmienić, nie udaje działającej (zakaz kontrolek pozornych).
    expect(screen.getByTestId('mvd-kreator-oze-dobor-charakter-q')).toBeDisabled();
    expect(screen.getByText(/Przy cos φ = 1 falownik nie wymienia mocy biernej/)).toBeInTheDocument();
  });

  it('wzrost napięcia jest NAZWANY, a wartość pokazana jako moduł zmiany', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: true, json: async () => RESPONSE_WZROST } as Response);
    wyrenderujKrok();

    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-oze-dobor-propozycje')).toBeInTheDocument(),
    );

    // Nazwa wielkości pochodzi z pola is_voltage_rise backendu.
    expect(screen.getByText('Wzrost napięcia')).toBeInTheDocument();
    expect(screen.queryByText('Spadek napięcia')).toBeNull();
    // Moduł zmiany: 0,9511 % → „0.95 %" (bez wprowadzającego w błąd minusa).
    expect(screen.getByText('0.95 %')).toBeInTheDocument();
    expect(screen.getByText(/ograniczenie wiodące przy przyłączaniu OZE/)).toBeInTheDocument();
  });

  it('spadek napięcia (brak flagi wzrostu) zostaje spadkiem', async () => {
    const user = userEvent.setup();
    wyrenderujKrok();

    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-oze-dobor-propozycje')).toBeInTheDocument(),
    );

    expect(screen.getByText('Spadek napięcia')).toBeInTheDocument();
    expect(screen.queryByText('Wzrost napięcia')).toBeNull();
  });
});
