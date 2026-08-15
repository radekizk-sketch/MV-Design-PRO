import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildStationBatchPlan, StationBatchPlanner } from '../StationBatchPlanner';
import type { StationTemplateSummary } from '../api';

const templates: StationTemplateSummary[] = [
  {
    id: 'tpl_sn_nn_630kva',
    name_pl: 'Stacja SN/nN 630 kVA',
    category: 'typowa_sn_nn',
    description_pl: 'Typowa stacja',
    use_case_pl: 'Dystrybucja',
    nc_rfg_type: null,
    tags: [],
    icon: 'station',
  },
  {
    id: 'tpl_pv_500kw',
    name_pl: 'Stacja PV 500 kW',
    category: 'farma_pv',
    description_pl: 'Stacja PV',
    use_case_pl: 'OZE',
    nc_rfg_type: 'B',
    tags: [],
    icon: 'pv',
  },
  {
    id: 'tpl_bess_500kw',
    name_pl: 'Stacja BESS 500 kW',
    category: 'bess',
    description_pl: 'Stacja BESS',
    use_case_pl: 'Magazyn',
    nc_rfg_type: 'B',
    tags: [],
    icon: 'bess',
  },
];

function response(data: unknown): Response {
  return {
    ok: true,
    json: async () => data,
  } as Response;
}

/* REF-PAKIET: profile dostawcy pochodzą ze SCHEMATU szablonu. Backend
   (`station_templates/schema.py`) wymienia PIĘĆ profili — planer miał własną
   kopię czterech, więc SCHNEIDER był dla projektanta nieosiągalny. */
const PROFILE_ZE_SCHEMATU = [
  'ZPUE_WLOSZCZOWA',
  'ELEKTROMETAL',
  'ABB',
  'SIEMENS',
  'SCHNEIDER',
] as const;

/** Mock rozróżniający listę szablonów od pełnego szablonu (ze schematem). */
function mockSzablonow() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/station-templates\/[^/?]+$/.test(url)) {
      return response({
        ...templates[0],
        schema: {
          sn_switchgear_manufacturers: PROFILE_ZE_SCHEMATU,
          manufacturer_profile_default: 'ZPUE_WLOSZCZOWA',
        },
      });
    }
    return response({ templates, total: templates.length });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StationBatchPlanner', () => {
  it('buduje deterministyczny plan i blokuje wiersze bez odcinka docelowego', () => {
    const plan = buildStationBatchPlan(templates, ['seg/1', 'seg/2'], 4);

    expect(plan).toHaveLength(4);
    expect(plan[0].templateId).toBe('tpl_sn_nn_630kva');
    expect(plan[0].targetSegmentRef).toBe('seg/1');
    expect(plan[0].status).toBe('gotowe');
    expect(plan[2].status).toBe('brak_segmentu');
    expect(plan[2].missingFields).toContain('odcinek docelowy');
    expect(plan.every((row) => row.lengthM !== 0)).toBe(true);
  });

  it('renderuje tabelę planu 50+ jako powierzchnię roboczą z powodem blokady zapisu', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ templates, total: templates.length }));

    render(
      <StationBatchPlanner
        caseId="case-1"
        segmentRefs={['seg/1', 'seg/2', 'seg/3']}
        targetCount={5}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('station-batch-planner')).toBeInTheDocument();
      expect(screen.getByTestId('station-batch-row-1')).toBeInTheDocument();
      expect(screen.getByText((_, element) => element?.textContent === 'Gotowe wiersze: 3/5')).toBeInTheDocument();
    });
    expect(screen.getByTestId('station-batch-apply')).toBeDisabled();
    expect(screen.getByTestId('station-batch-disabled-reason').textContent).toContain('2 wierszy z brakami');
  });

  it('pozwala edytować długość odcinka i pokazuje brak danych zamiast wartości zerowej', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ templates, total: templates.length }));

    render(
      <StationBatchPlanner
        caseId="case-1"
        segmentRefs={['seg/1', 'seg/2', 'seg/3']}
        targetCount={3}
      />,
    );

    // Czekamy na wiersz Z SZABLONEM, a nie na sam wiersz: wiersze powstają zanim dojdą
    // szablony, więc samo `station-batch-row-1` nie znaczy, że plan jest już ustalony.
    // Poprzednia wersja tego oczekiwania przepuszczała wyścig i test padał losowo w
    // pełnym biegu (V12K-208).
    await waitFor(() => {
      expect(screen.getByTestId('station-batch-row-1').textContent).toContain('Stacja SN/nN 630 kVA');
    });

    const firstLengthInput = screen.getByLabelText('Długość odcinka wiersza 1') as HTMLInputElement;
    fireEvent.change(firstLengthInput, { target: { value: '0' } });

    expect(screen.getByTestId('station-batch-row-1').textContent).toContain('brak długości');
    expect(screen.getByTestId('station-batch-apply')).toBeDisabled();
  });

  it('edycja wpisana PRZED dojściem szablonów nie przepada po ich dojściu (V12K-208)', async () => {
    // REALNY DEFEKT, nie tylko chwiejny test: wiersze planu renderują się od razu (bez
    // szablonu, ze statusem „brak szablonu"), więc projektant może zacząć uzupełniać
    // długości w trakcie pobierania. Spóźnione `setTemplates` przestawiało wtedy CAŁY
    // plan od zera i jego wpisy przepadały bez żadnego komunikatu.
    let wypuscSzablony: (() => void) | null = null;
    const oczekiwanie = new Promise<Response>((resolve) => {
      wypuscSzablony = () => resolve(response({ templates, total: templates.length }));
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValue(oczekiwanie);

    render(
      <StationBatchPlanner
        caseId="case-1"
        segmentRefs={['seg/1', 'seg/2', 'seg/3']}
        targetCount={3}
      />,
    );

    // Plan bez szablonów: wiersz istnieje i ma edytowalną długość.
    await waitFor(() => {
      expect(screen.getByTestId('station-batch-row-1')).toBeInTheDocument();
    });
    const lengthInput = screen.getByLabelText('Długość odcinka wiersza 1') as HTMLInputElement;
    fireEvent.change(lengthInput, { target: { value: '777' } });
    expect((screen.getByLabelText('Długość odcinka wiersza 1') as HTMLInputElement).value).toBe('777');

    // Teraz szablony dochodzą — plan jest przebudowywany.
    wypuscSzablony?.();
    await waitFor(() => {
      expect(screen.getByTestId('station-batch-row-1').textContent).toContain('Stacja SN/nN 630 kVA');
    });

    // Wpis projektanta MUSI przeżyć przebudowę planu.
    expect((screen.getByLabelText('Długość odcinka wiersza 1') as HTMLInputElement).value).toBe('777');
  });

  it('„Odtwórz plan" porzuca edycje projektanta (przycisk robi to, co obiecuje)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ templates, total: templates.length }));

    render(
      <StationBatchPlanner
        caseId="case-1"
        segmentRefs={['seg/1', 'seg/2', 'seg/3']}
        targetCount={3}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('station-batch-row-1').textContent).toContain('Stacja SN/nN 630 kVA');
    });

    const wejscie = screen.getByLabelText('Długość odcinka wiersza 1') as HTMLInputElement;
    const dlugoscZPlanu = wejscie.value;
    fireEvent.change(wejscie, { target: { value: '777' } });
    expect((screen.getByLabelText('Długość odcinka wiersza 1') as HTMLInputElement).value).toBe('777');

    fireEvent.click(screen.getByText(/Odtwórz plan/));
    await waitFor(() => {
      expect((screen.getByLabelText('Długość odcinka wiersza 1') as HTMLInputElement).value).toBe(
        dlugoscZPlanu,
      );
    });
  });
});

describe('StationBatchPlanner — profil dostawcy z DANYCH (REF-PAKIET)', () => {
  it('lista profili pochodzi ze schematu szablonu — komplet, w tym profil pomijany przez zaszytą kopię', async () => {
    mockSzablonow();
    render(<StationBatchPlanner caseId="case-1" segmentRefs={['seg/1']} targetCount={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('station-batch-row-1').textContent).toContain('Stacja SN/nN 630 kVA');
    });
    const select = (await screen.findByLabelText('Profil katalogowy wiersza 1')) as HTMLSelectElement;
    await waitFor(() => {
      expect(Array.from(select.options).map((o) => o.value)).toEqual([
        '',
        ...PROFILE_ZE_SCHEMATU,
      ]);
    });
  });

  it('wartość domyślna to `manufacturer_profile_default` — jednakowa dla wierszy (koniec rotacji po indeksie)', async () => {
    mockSzablonow();
    render(<StationBatchPlanner caseId="case-1" segmentRefs={['seg/1', 'seg/2']} targetCount={3} />);

    await waitFor(() => {
      const w1 = screen.getByLabelText('Profil katalogowy wiersza 1') as HTMLSelectElement;
      expect(w1.value).toBe('ZPUE_WLOSZCZOWA');
    });
    const w2 = screen.getByLabelText('Profil katalogowy wiersza 2') as HTMLSelectElement;
    const w3 = screen.getByLabelText('Profil katalogowy wiersza 3') as HTMLSelectElement;
    // Rotacja `index % length` dawała tu trzy RÓŻNE profile bez żadnej podstawy.
    expect([w2.value, w3.value]).toEqual(['ZPUE_WLOSZCZOWA', 'ZPUE_WLOSZCZOWA']);
  });

  it('brak schematu (błąd pobrania) ⇒ wiersz bez profilu — UI nie zgaduje producenta', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/\/station-templates\/[^/?]+$/.test(url)) {
        return { ok: false, statusText: 'Not Found', json: async () => ({}) } as Response;
      }
      return response({ templates, total: templates.length });
    });
    render(<StationBatchPlanner caseId="case-1" segmentRefs={['seg/1']} targetCount={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('station-batch-row-1').textContent).toContain('Stacja SN/nN 630 kVA');
    });
    const select = screen.getByLabelText('Profil katalogowy wiersza 1') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['bez profilu']);
  });

  it('jawny wybór „bez profilu" przeżywa przebudowę planu (null ≠ brak edycji)', async () => {
    mockSzablonow();
    render(<StationBatchPlanner caseId="case-1" segmentRefs={['seg/1', 'seg/2']} targetCount={2} />);

    const select = (await screen.findByLabelText('Profil katalogowy wiersza 1')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('ZPUE_WLOSZCZOWA'));

    fireEvent.change(select, { target: { value: '' } });
    // Przebudowa planu (zmiana długości innego wiersza) nie może przywrócić profilu.
    fireEvent.change(screen.getByLabelText('Długość odcinka wiersza 2'), { target: { value: '120' } });

    await waitFor(() => {
      expect((screen.getByLabelText('Profil katalogowy wiersza 1') as HTMLSelectElement).value).toBe('');
    });
  });

  it('plan zbudowany bez znanego profilu ma `catalogProfile === null` (kontrakt wiersza)', () => {
    const plan = buildStationBatchPlan(templates, ['seg/1'], 2);
    expect(plan.map((w) => w.catalogProfile)).toEqual([null, null]);

    const zProfilem = buildStationBatchPlan(templates, ['seg/1'], 2, 'ELEKTROMETAL');
    expect(zProfilem.map((w) => w.catalogProfile)).toEqual(['ELEKTROMETAL', 'ELEKTROMETAL']);
  });
});
