/**
 * D2 (RECENZJA_DER_SN_DOBORY_2026-07): test kroku DOBORU — realna ścieżka użytkownika
 * (Zero-Debt §5: natywny klik, nie syntetyczny). Backend (mock fetch) zwraca propozycję;
 * krok ją prezentuje, a „Zastosuj propozycję" przekazuje ją w górę (payload z propozycji).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { ConverterType } from '../../../../ui/catalog/types';
import { DoborToruSn } from '../DoborToruSn';
import type { CableLayingConditions } from '../derSelectionApi';
import { DANE_DER_SN_DOMYSLNE, type DerSnFormData } from '../zrodloOzeModel';
import { uruchomObliczenie } from '../../../spaces/obliczenia/uruchomObliczenie';

vi.mock('../../../spaces/obliczenia/uruchomObliczenie', () => ({
  uruchomObliczenie: vi.fn(async () => true),
}));

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

/**
 * V12K-207 (karta F-K7): lista warunków ułożenia POCHODZI Z BACKENDU — kreator nie ma
 * własnej listy współczynników. Kształt 1:1 z `CableLayingConditionsResponse`.
 */
const WARUNKI = {
  sets: [
    {
      name: 'warunki_katalogowe',
      label_pl: 'Warunki katalogowe (bez korekty)',
      f_grunt: 1.0,
      f_wiazka: 1.0,
      f_grupa: 1.0,
      total: 1.0,
      basis: 'Karta katalogowa producenta.',
      assumption_pl: 'Obciazalnosc przyjeta dla WARUNKOW KATALOGOWYCH.',
    },
    {
      name: 'ziemia_3_kable_warstwa_200mm',
      label_pl: 'Ziemia, 3 kable jednozylowe, odstep 200 mm',
      f_grunt: 0.9,
      f_wiazka: 1.01,
      f_grupa: 0.82,
      total: 0.74538,
      basis: 'Arkusz doborowy MT880 v3, sekcja 1.',
      assumption_pl: 'Obciazalnosc skorygowana dla warunkow: ziemia, 3 kable.',
    },
  ],
  custom_name: 'wlasne',
  default_name: 'warunki_katalogowe',
  limitation_pl: 'System nie interpoluje miedzy zestawami.',
};

/** Wywołania końcówki DOBORU (bez wywołań listy warunków z montażu komponentu). */
function wywolaniaDoboru(): unknown[][] {
  return fetchMock.mock.calls.filter((call) =>
    String(call[0]).endsWith('/api/solver/der-selection-preview'),
  );
}

let fetchMock: Mock<[input: RequestInfo | URL], Promise<Response>>;
/** Odpowiedź końcówki doboru — testy podmieniają ją na własną. */
let odpowiedzDoboru: unknown = RESPONSE;

beforeEach(() => {
  odpowiedzDoboru = RESPONSE;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/solver/cable-laying-conditions')) {
      return { ok: true, json: async () => WARUNKI } as Response;
    }
    return { ok: true, json: async () => odpowiedzDoboru } as Response;
  });
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
        onLayingConditionsChange={() => {}}
        onScreenBondingChange={() => {}}
        onZastosuj={onZastosuj}
        applied={false}
      />,
    );

    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));

    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-dobor-propozycje')).toBeInTheDocument());
    expect(wywolaniaDoboru()).toHaveLength(1);
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
        onLayingConditionsChange={() => {}}
        onScreenBondingChange={() => {}}
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
        onLayingConditionsChange={() => {}}
        onScreenBondingChange={() => {}}
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

function wyrenderujKrok(
  onZastosuj = vi.fn(),
  opcje: {
    onLayingConditionsChange?: (v: CableLayingConditions | null) => void;
    derSn?: DerSnFormData;
  } = {},
) {
  return render(
    <DoborToruSn
      converter={KONWERTER}
      quantity={2}
      snBusVoltageKv={15}
      derSn={opcje.derSn ?? { ...DANE_DER_SN_DOMYSLNE, mv_cable_length_km: 8.0 }}
      onCableLengthChange={() => {}}
      onVectorGroupChange={() => {}}
      onLayingConditionsChange={opcje.onLayingConditionsChange ?? (() => {})}
      onScreenBondingChange={() => {}}
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

    await waitFor(() => expect(wywolaniaDoboru()).toHaveLength(1));
    const body = JSON.parse(String((wywolaniaDoboru()[0][1] as RequestInit).body));
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
    odpowiedzDoboru = RESPONSE_WZROST;
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

// ---------------------------------------------------------------------------
// Karta F-K7 / V12K-207: warunki UŁOŻENIA kabla w doborze obciążalności.
// Obciążalność katalogowa obowiązuje dla warunków ODNIESIENIA producenta — dotąd
// kreator nigdzie tego nie mówił, a dobór bez korekty jest optymistyczny.
// ---------------------------------------------------------------------------

/** Propozycja z KOREKTĄ obciążalności (kształt 1:1 z backendem). */
const RESPONSE_Z_KOREKTA = {
  ...RESPONSE,
  cable: {
    ...RESPONSE.cable,
    proposal: {
      ...RESPONSE.cable.proposal,
      rated_current_a: 340,
      effective_ampacity_a: 253.4292,
      derating_total: 0.74538,
    },
    derating_set: 'ziemia_3_kable_warstwa_200mm',
    derating_total: 0.74538,
    derating_assumption_pl:
      'Obciazalnosc skorygowana dla warunkow: ziemia, 3 kable jednozylowe, odstep 200 mm; '
      + 'iloczyn = 0.7454. Podstawa: arkusz doborowy MT880 v3.',
  },
};

describe('DoborToruSn — warunki ułożenia kabla (V12K-207)', () => {
  it('lista warunków ułożenia pochodzi z backendu (kreator nie ma własnej)', async () => {
    wyrenderujKrok();

    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-oze-dobor-warunki-ulozenia')).toBeInTheDocument(),
    );
    const select = screen.getByTestId(
      'mvd-kreator-oze-dobor-warunki-ulozenia',
    ) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'warunki_katalogowe',
      'ziemia_3_kable_warstwa_200mm',
    ]);
    // Domyślnie warunki katalogowe (brak korekty = dotychczasowe zachowanie).
    expect(select.value).toBe('warunki_katalogowe');
    // POWÓD krótkiej listy jedzie z backendu, żeby nie wyglądała na tablicę norm.
    expect(
      screen.getByText(/System nie interpoluje miedzy zestawami/),
    ).toBeInTheDocument();
  });

  it('wybór warunków ziemnych → callback do modelu i pole w żądaniu doboru', async () => {
    const user = userEvent.setup();
    const onLayingConditionsChange = vi.fn();
    const { unmount } = wyrenderujKrok(vi.fn(), { onLayingConditionsChange });

    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-oze-dobor-warunki-ulozenia')).toBeInTheDocument(),
    );
    await user.selectOptions(
      screen.getByTestId('mvd-kreator-oze-dobor-warunki-ulozenia'),
      'ziemia_3_kable_warstwa_200mm',
    );
    // Wybór jedzie DO MODELU (a nie tylko do podglądu) — raport zgodności liczy potem
    // propozycję dla tego samego założenia.
    expect(onLayingConditionsChange).toHaveBeenCalledWith({
      set_name: 'ziemia_3_kable_warstwa_200mm',
    });

    // Komponent jest bezstanowy w tej sprawie: warunki wchodzą przez `derSn`.
    unmount();
    wyrenderujKrok(vi.fn(), {
      derSn: {
        ...DANE_DER_SN_DOMYSLNE,
        mv_cable_length_km: 8.0,
        mv_cable_laying_conditions: { set_name: 'ziemia_3_kable_warstwa_200mm' },
      },
    });
    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));
    await waitFor(() => expect(wywolaniaDoboru()).toHaveLength(1));
    const body = JSON.parse(String((wywolaniaDoboru()[0][1] as RequestInit).body));
    expect(body.laying_conditions).toEqual({ set_name: 'ziemia_3_kable_warstwa_200mm' });
  });

  it('powrót do warunków katalogowych czyści pole w modelu (brak korekty ≠ zestaw)', async () => {
    const user = userEvent.setup();
    const onLayingConditionsChange = vi.fn();
    wyrenderujKrok(vi.fn(), {
      onLayingConditionsChange,
      derSn: {
        ...DANE_DER_SN_DOMYSLNE,
        mv_cable_length_km: 8.0,
        mv_cable_laying_conditions: { set_name: 'ziemia_3_kable_warstwa_200mm' },
      },
    });

    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-oze-dobor-warunki-ulozenia')).toBeInTheDocument(),
    );
    await user.selectOptions(
      screen.getByTestId('mvd-kreator-oze-dobor-warunki-ulozenia'),
      'warunki_katalogowe',
    );
    expect(onLayingConditionsChange).toHaveBeenCalledWith(null);
  });

  it('obciążalność po korekcie pokazana OBOK katalogowej + jawne założenie', async () => {
    const user = userEvent.setup();
    odpowiedzDoboru = RESPONSE_Z_KOREKTA;
    wyrenderujKrok();

    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-oze-dobor-propozycje')).toBeInTheDocument(),
    );

    // Dwie liczby, nie jedna — projektant musi widzieć, ile zabrała korekta.
    expect(screen.getByText('340 A')).toBeInTheDocument();
    expect(screen.getByText('253.4 A (× 0.7454)')).toBeInTheDocument();
    expect(screen.getByText(/Obciazalnosc skorygowana dla warunkow/)).toBeInTheDocument();
  });

  it('bez korekty wiersz obciążalności skorygowanej NIE pojawia się (zero szumu)', async () => {
    const user = userEvent.setup();
    wyrenderujKrok();

    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-oze-dobor-propozycje')).toBeInTheDocument(),
    );

    expect(screen.queryByText(/Obciążalność po korekcie/)).toBeNull();
  });
});

/**
 * Pakiet 6b: kryterium wytrzymałości zwarciowej kabla — rekord backendu ZAWSZE widoczny.
 * Iloczyn: stan rekordu {spełnione, nie oceniono bez biegu, niespełnione} × przypadek
 * {aktywny, brak}. Żądanie niesie przypadek i szynę przyłączenia; akcja „Uruchom obliczenia
 * zwarciowe” istnieje tylko przy braku prądu i aktywnym przypadku, a po biegu dobór liczy
 * się ponownie (drugie wywołanie końcówki) — natywne kliki.
 */
const PODSTAWA = 'wartość robocza 1 s — znamionowy czas trwania zwarcia (IEC 62271-1 §4.7).';
const REKORDY = {
  spelnione: {
    status: 'SPELNIA',
    wyjasnienie: {
      zdanie_pl:
        'Kabel 50 mm²: prąd cieplny 19618 A przy czasie trwania zwarcia 1 s nie przekracza prądu dopuszczalnego żyły 21450 A.',
      przyczyna_pl: null,
      czego_brakuje: [],
      zastrzezenia: [],
    },
    ikss_a: 19291.6,
    kappa: 1.746,
    fault_duration_s: 1,
    fault_duration_source: 'wartosc_robocza',
    fault_duration_basis_pl: PODSTAWA,
    ith_a: 19618,
    admissible_current_a: 21450,
    margin_a: 1832,
    action_pl: null,
    short_circuit_run_id: 'bieg-1',
    kompletnosc_dowodu: 'NIEPELNY',
  },
  nie_oceniono: {
    status: 'NIE_OCENIONO',
    wyjasnienie: {
      zdanie_pl: 'Wytrzymałości zwarciowej kabla nie oceniono.',
      przyczyna_pl: 'Przypadek nie ma zakończonego biegu zwarciowego.',
      czego_brakuje: ['prąd zwarciowy początkowy I″k i współczynnik κ szyny przyłączenia'],
      zastrzezenia: [],
    },
    ikss_a: null,
    kappa: null,
    fault_duration_s: 1,
    fault_duration_source: 'wartosc_robocza',
    fault_duration_basis_pl: PODSTAWA,
    ith_a: null,
    admissible_current_a: null,
    margin_a: null,
    action_pl: 'Uruchom obliczenia zwarciowe dla przypadku.',
    short_circuit_run_id: null,
    kompletnosc_dowodu: 'NIEPELNY',
  },
  niespelnione: {
    status: 'NIE_SPELNIA',
    wyjasnienie: {
      zdanie_pl:
        'Żaden kabel z katalogu nie wytrzyma prądu cieplnego 60000 A przez czas trwania zwarcia 1 s.',
      przyczyna_pl: 'Prąd cieplny przekracza prąd dopuszczalny żyły każdego kandydata.',
      czego_brakuje: [],
      zastrzezenia: [],
    },
    ikss_a: 60000,
    kappa: 1.8,
    fault_duration_s: 1,
    fault_duration_source: 'wartosc_robocza',
    fault_duration_basis_pl: PODSTAWA,
    ith_a: 60000,
    admissible_current_a: null,
    margin_a: null,
    action_pl: 'Skróć czas wyłączenia zwarcia w polu przyłączenia.',
    short_circuit_run_id: 'bieg-1',
    kompletnosc_dowodu: 'NIEPELNY',
  },
} as const;

describe('DoborToruSn — kryterium wytrzymałości zwarciowej kabla', () => {
  beforeEach(() => {
    (uruchomObliczenie as unknown as Mock).mockClear();
  });

  for (const stan of ['spelnione', 'nie_oceniono', 'niespelnione'] as const) {
    for (const przypadek of ['aktywny', 'brak'] as const) {
      it(`rekord ${stan} × przypadek ${przypadek}`, async () => {
        const user = userEvent.setup();
        odpowiedzDoboru = {
          ...RESPONSE,
          cable: { ...RESPONSE.cable, thermal_criterion: REKORDY[stan] },
        };
        render(
          <DoborToruSn
            converter={KONWERTER}
            quantity={2}
            snBusVoltageKv={15}
            derSn={{ ...DANE_DER_SN_DOMYSLNE, mv_cable_length_km: 1.0 }}
            onCableLengthChange={() => {}}
            onVectorGroupChange={() => {}}
            onLayingConditionsChange={() => {}}
            onScreenBondingChange={() => {}}
            onZastosuj={() => {}}
            applied={false}
            caseId={przypadek === 'aktywny' ? 'case-1' : null}
            snBusRef={przypadek === 'aktywny' ? 'bus_sn' : null}
          />,
        );
        await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));
        const blok = await screen.findByTestId('mvd-kreator-oze-dobor-zwarciowe');
        expect(blok.getAttribute('data-status')).toBe(REKORDY[stan].status);

        // Żądanie niesie przypadek i szynę przyłączenia tylko wtedy, gdy są znane.
        const zadanie = JSON.parse(String((wywolaniaDoboru()[0][1] as RequestInit).body));
        if (przypadek === 'aktywny') {
          expect([zadanie.case_id, zadanie.sn_bus_ref]).toEqual(['case-1', 'bus_sn']);
        } else {
          expect('case_id' in zadanie || 'sn_bus_ref' in zadanie).toBe(false);
        }

        // Wyjaśnienie werdyktu (zdanie, przyczyna, braki), podstawa czasu i akcja — 1:1
        // z backendu; status maszynowy nie ma w UI własnej etykiety.
        const { wyjasnienie } = REKORDY[stan];
        expect(blok.textContent).toContain(wyjasnienie.zdanie_pl);
        const przyczyna = screen.queryByTestId('mvd-kreator-oze-dobor-zwarciowe-wyjasnienie');
        expect(przyczyna?.textContent ?? null).toBe(wyjasnienie.przyczyna_pl);
        const braki = screen.queryByTestId('mvd-kreator-oze-dobor-zwarciowe-brakuje');
        expect(braki?.textContent ?? null).toBe(
          wyjasnienie.czego_brakuje.length > 0 ? `Brakuje: ${wyjasnienie.czego_brakuje.join('; ')}` : null,
        );
        expect(screen.getByTestId('mvd-kreator-oze-dobor-zwarciowe-podstawa-czasu').textContent).toBe(
          PODSTAWA,
        );
        const akcja = screen.queryByTestId('mvd-kreator-oze-dobor-zwarciowe-akcja');
        expect(akcja?.textContent ?? null).toBe(REKORDY[stan].action_pl);

        const przycisk = screen.queryByTestId('mvd-kreator-oze-dobor-zwarciowe-uruchom');
        const oczekiwanyPrzycisk = stan === 'nie_oceniono' && przypadek === 'aktywny';
        expect(przycisk !== null).toBe(oczekiwanyPrzycisk);
        if (!oczekiwanyPrzycisk) return;

        odpowiedzDoboru = {
          ...RESPONSE,
          cable: { ...RESPONSE.cable, thermal_criterion: REKORDY.spelnione },
        };
        await user.click(przycisk!);
        await waitFor(() =>
          expect(
            screen.getByTestId('mvd-kreator-oze-dobor-zwarciowe').getAttribute('data-status'),
          ).toBe('SPELNIA'),
        );
        expect(uruchomObliczenie).toHaveBeenCalledWith('SC_3F');
        expect(wywolaniaDoboru()).toHaveLength(2);
        expect(screen.queryByTestId('mvd-kreator-oze-dobor-zwarciowe-uruchom')).toBeNull();
      });
    }
  }

  it('bieg zwarciowy nieudany → dobór nie jest powtarzany', async () => {
    const user = userEvent.setup();
    (uruchomObliczenie as unknown as Mock).mockResolvedValueOnce(false);
    odpowiedzDoboru = {
      ...RESPONSE,
      cable: { ...RESPONSE.cable, thermal_criterion: REKORDY.nie_oceniono },
    };
    render(
      <DoborToruSn
        converter={KONWERTER}
        quantity={2}
        snBusVoltageKv={15}
        derSn={{ ...DANE_DER_SN_DOMYSLNE, mv_cable_length_km: 1.0 }}
        onCableLengthChange={() => {}}
        onVectorGroupChange={() => {}}
        onLayingConditionsChange={() => {}}
        onScreenBondingChange={() => {}}
        onZastosuj={() => {}}
        applied={false}
        caseId="case-1"
        snBusRef="bus_sn"
      />,
    );
    await user.click(screen.getByTestId('mvd-kreator-oze-dobor-zaproponuj'));
    await user.click(await screen.findByTestId('mvd-kreator-oze-dobor-zwarciowe-uruchom'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-oze-dobor-zwarciowe-uruchom')).not.toBeDisabled(),
    );
    expect(wywolaniaDoboru()).toHaveLength(1);
  });
});
