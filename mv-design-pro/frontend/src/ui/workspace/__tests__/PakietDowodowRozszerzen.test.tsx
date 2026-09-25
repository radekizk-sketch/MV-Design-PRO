/**
 * Pakiet dowodów walidacji rozszerzeń na ekranach (karta PROOFPACK-KONTRAKT).
 *
 * INTENCJA: pakiet składa BACKEND (`POST …/audit2-station-config/_validate-all`) — ekran
 * nie sumuje mocy, nie wysyła specyfikacji i nie wybiera „pierwszej stacji". Tekst ekranu
 * mówi dokładnie to, co pakiet zawiera: pięć rodzajów uzasadnień per stacja, rodzaj bez
 * danych jawnie oznaczony z przyczyną (nie liczony jako spełniony), nazwy z modelu.
 *
 * ILOCZYN CECH: ekran (uzasadnienia E-36 × raport × przegląd techniczny E-04) × stacja
 * z kompletem dowodów / stacja z brakami × jedna / kilka stacji. Interakcje przez
 * `userEvent` (zdarzenia wskaźnika jak u użytkownika), nie syntetyczny `dispatchEvent`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../app-state';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useStationDerStore } from '../../network-build/station-der';
import type { Audit2ProjectProofPackResponse } from '../../network-build/station-der';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import { REPORT_SURFACE_SCREEN_CODE, type WorkspaceSurfaceDescriptor } from '../types';

const SURFACE_BASE = {
  entityRef: null,
  entityType: null,
  routeState: { payload: {} } as never,
  breadcrumbs: [],
  supportsMiniSld: false,
  supportsChildren: false,
  sizeClass: 'C',
  stackLevel: 0,
  openMode: 'expand_workspace',
  subjectKind: 'helper_context',
  subjectRef: null,
  saveMode: 'edit',
  hasUnsavedChanges: false,
  tabId: null,
};
const PROOF_SURFACE = { ...SURFACE_BASE, surfaceId: 'proof', screenCode: 'E-36', titlePl: 'U' } as never as WorkspaceSurfaceDescriptor;
const REPORT_SURFACE = { ...SURFACE_BASE, surfaceId: 'report', screenCode: REPORT_SURFACE_SCREEN_CODE, titlePl: 'R' } as never as WorkspaceSurfaceDescriptor;
const E04_SURFACE = { ...SURFACE_BASE, surfaceId: 'e04', screenCode: 'E-04', titlePl: 'P' } as never as WorkspaceSurfaceDescriptor;

const PAKIET: Audit2ProjectProofPackResponse = {
  project_id: 'proj-1',
  all_pass: true,
  station_count: 2,
  per_station: [
    {
      station_id: 'stn/1',
      station_nazwa: 'Stacja Łąkowa',
      all_pass: true,
      fail_count: 0,
      proof_count: 5,
      proofs: [
        ['AUDIT2_BESS_OPERATION_MODES', 'Tryby pracy magazynu energii', 'OK: DER Magazyn Łąkowa ma 1 trybów zgodnych ze zdolnościami PCS.'],
        ['AUDIT2_DEVICE_WITHSTAND', 'Wytrzymałość zwarciowa aparatury', 'Pole 02: OK: aparatura wytrzymała.'],
        ['AUDIT2_HOSTING_CAPACITY_EXPORT', 'Zdolność przyłączeniowa — eksport wobec importu', 'Eksport normalny: 100 kW eksportowanych do OSD (stosunek 1.20x).'],
        ['AUDIT2_TAP_CHANGER_PLAN', 'Plan regulacji zaczepów transformatora', 'OK: Tap-changer dla transformatora T1 Łąkowa jest zgodny z wymaganiami.'],
        ['AUDIT2_VT_GROUNDING_VALIDATION', 'Przekładniki napięciowe wobec uziemienia sieci', 'Pole 01: OK: VT U_th=1.9 pasuje.'],
      ].map(([proof_type, rodzaj_pl, summary_pl], i) => ({
        proof_id: `00000000-0000-0000-0000-00000000000${i}`,
        proof_type: proof_type as never,
        rodzaj_pl,
        pass_status: true,
        summary_pl,
        details:
          proof_type === 'AUDIT2_HOSTING_CAPACITY_EXPORT'
            ? { station_id: 'stn/1', p_export_kw: 600, p_import_kw: 500, p_net_export_kw: 100, export_to_import_ratio: 1.2, status: 'normal_export', message_pl: summary_pl }
            : {},
        formulas_latex: [],
        generated_at: '1970-01-01T00:00:00Z',
      })),
      braki_danych: [],
      generated_at: '1970-01-01T00:00:00Z',
    },
    {
      station_id: 'stn/2',
      station_nazwa: 'Stacja Polna',
      all_pass: true,
      fail_count: 0,
      proof_count: 0,
      proofs: [],
      braki_danych: [
        {
          proof_type: 'AUDIT2_HOSTING_CAPACITY_EXPORT',
          rodzaj_pl: 'Zdolność przyłączeniowa — eksport wobec importu',
          przyczyna_pl: 'Źródło PV Polna nie ma mocy znamionowej z katalogu — bilans eksportu byłby zaniżony.',
        },
        {
          proof_type: 'AUDIT2_TAP_CHANGER_PLAN',
          rodzaj_pl: 'Plan regulacji zaczepów transformatora',
          przyczyna_pl: 'Konfiguracja stacji nie przypisuje przełącznika zaczepów żadnemu transformatorowi.',
        },
      ],
      generated_at: '1970-01-01T00:00:00Z',
    },
  ],
};

interface Zapytanie {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

function renderZBackendem(zapytania: Zapytanie[]) {
  global.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
    const adres = url.toString();
    const method = init?.method ?? 'GET';
    zapytania.push({ url: adres, method, body: init?.body ? JSON.parse(init.body as string) : null });
    if (adres.endsWith('/audit2-station-config/_validate-all')) {
      return Promise.resolve({ ok: true, json: async () => PAKIET } as never);
    }
    if (adres.endsWith('/generate-report')) {
      const cialo = JSON.parse(init!.body as string) as { station_name: string };
      return Promise.resolve({
        ok: true,
        json: async () => ({ text_pl: `RAPORT\nStacja: ${cialo.station_name}\n` }),
      } as never);
    }
    if (adres.endsWith('/audit2-station-config')) {
      return Promise.resolve({ ok: true, json: async () => [] } as never);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as never);
  }) as never;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <WorkspaceSurfaceRouter region="main" />
    </QueryClientProvider>,
  );
}

function tekstEkranu(): string {
  return document.body.textContent ?? '';
}

describe('Pakiet dowodów walidacji rozszerzeń — ekrany (karta PROOFPACK-KONTRAKT)', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useStationDerStore.setState({ ders: {} } as never);
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeProjectName: 'Projekt Łąkowa' });
  });

  it('uzasadnienia: przycisk prosi backend o pakiet projektu i pokazuje każdą stację', async () => {
    const zapytania: Zapytanie[] = [];
    useNetworkBuildStore.setState({ activeSurface: PROOF_SURFACE } as never);
    renderZBackendem(zapytania);
    const uzytkownik = userEvent.setup();

    // Tekst mówi, co pakiet zawiera: pięć rodzajów i jawne braki (nie „pięć dowodów zawsze").
    expect(tekstEkranu()).toContain('pięć rodzajów uzasadnień');
    expect(tekstEkranu()).toContain('nie jest liczony jako spełniony');
    // Przycisk nie czeka na listę konfiguracji — zakres ustala backend (model ∪ konfiguracje).
    const przycisk = screen.getByTestId('audit2-proof-generate') as HTMLButtonElement;
    expect(przycisk.disabled).toBe(false);

    await uzytkownik.click(przycisk);
    await waitFor(() => expect(screen.getAllByTestId('audit2-pakiet-stacji')).toHaveLength(2));

    const wywolania = zapytania.filter((z) => z.method === 'POST');
    expect(wywolania.map((z) => z.url)).toContain(
      '/api/v1/projects/proj-1/audit2-station-config/_validate-all',
    );
    // Zero dawnej końcówki i zero specyfikacji składanych w interfejsie.
    expect(zapytania.some((z) => z.url.includes('generate-proof-pack'))).toBe(false);

    const [lakowa, polna] = screen.getAllByTestId('audit2-pakiet-stacji');
    expect(within(lakowa).getAllByTestId('audit2-proof')).toHaveLength(5);
    expect(within(lakowa).getByTestId('audit2-pakiet-status').textContent).toBe('Weryfikacja pozytywna');
    expect(within(polna).queryAllByTestId('audit2-proof')).toHaveLength(0);
    const braki = within(polna).getAllByTestId('audit2-brak-danych');
    expect(braki).toHaveLength(2);
    expect(braki[0].textContent).toContain('brak danych: Źródło PV Polna nie ma mocy znamionowej');
    // Brak danych ≠ spełnia: stacja bez dowodów nie jest „pozytywna".
    expect(within(polna).getByTestId('audit2-pakiet-status').textContent).not.toContain('pozytywna');

    // Nazwy z modelu i polskie nazwy rodzajów — nigdy identyfikator ani kod.
    expect(tekstEkranu()).toContain('Stacja Łąkowa');
    expect(tekstEkranu()).toContain('Plan regulacji zaczepów transformatora');
    expect(tekstEkranu()).not.toMatch(/stn\/1|stn\/2|AUDIT2_|aggregate/);
  });

  it('raport: pakiet z backendu, raport dla KAŻDEJ stacji z nazwą z pakietu, bez zmyślonego operatora', async () => {
    const zapytania: Zapytanie[] = [];
    useNetworkBuildStore.setState({ activeSurface: REPORT_SURFACE } as never);
    renderZBackendem(zapytania);
    const uzytkownik = userEvent.setup();

    const renderuj = screen.getByTestId('audit2-report-render') as HTMLButtonElement;
    expect(renderuj.disabled).toBe(true);
    await uzytkownik.click(screen.getByTestId('audit2-report-generate-pack'));
    await waitFor(() => expect(renderuj.disabled).toBe(false));
    await uzytkownik.click(renderuj);
    await waitFor(() => expect(screen.getByTestId('audit2-report-preview')).toBeInTheDocument());

    const raporty = zapytania.filter((z) => z.url.endsWith('/generate-report'));
    expect(raporty).toHaveLength(2);
    const ciala = raporty.map((z) => z.body as Record<string, unknown>);
    expect(ciala.map((c) => c.station_name)).toEqual(['Stacja Łąkowa', 'Stacja Polna']);
    expect(ciala.map((c) => c.station_id)).toEqual(['stn/1', 'stn/2']);
    expect(ciala.every((c) => !('operator_pl' in c))).toBe(true);
    expect((ciala[1].proof_pack as { braki_danych: unknown[] }).braki_danych).toHaveLength(2);
    const podglad = screen.getByTestId('audit2-report-preview').textContent ?? '';
    expect(podglad).toContain('Stacja: Stacja Łąkowa');
    expect(podglad).toContain('Stacja: Stacja Polna');
  });

  it('przegląd techniczny: bilans eksportu z pakietu backendu, brak bilansu z przyczyną', async () => {
    const zapytania: Zapytanie[] = [];
    // Obie stacje mają przyłączone źródła (zakres sekcji „nie sprawdzono" jak dotąd).
    for (const [id, stacja] of [['der-1', 'stn/1'], ['der-2', 'stn/2']] as const) {
      useStationDerStore.getState().attachDer({
        id,
        project_id: 'proj-1',
        station_id: stacja,
        der_kind: 'PV',
        name: `PV ${id}`,
        connection_side: 'nN',
      });
    }
    useNetworkBuildStore.setState({ activeSurface: E04_SURFACE } as never);
    renderZBackendem(zapytania);

    await waitFor(() => expect(screen.getAllByTestId('hosting-capacity-stacja')).toHaveLength(1));
    const wiersz = screen.getByTestId('hosting-capacity-stacja');
    expect(wiersz.getAttribute('data-status')).toBe('normal_export');
    expect(wiersz.textContent).toContain('Stacja: Stacja Łąkowa');
    expect(wiersz.textContent).toContain('P_export: 600 kW');
    expect(wiersz.textContent).toContain('P_import: 500 kW');
    const nieznane = screen.getAllByTestId('hosting-capacity-nieznane-stacja');
    expect(nieznane).toHaveLength(1);
    expect(nieznane[0].textContent).toContain('Stacja: Stacja Polna');
    expect(nieznane[0].textContent).toContain('nie ma mocy znamionowej z katalogu');
    expect(tekstEkranu()).not.toMatch(/stn\/1|stn\/2/);
    expect(zapytania.some((z) => z.url.includes('validate-hosting-capacity-export'))).toBe(false);
  });
});
