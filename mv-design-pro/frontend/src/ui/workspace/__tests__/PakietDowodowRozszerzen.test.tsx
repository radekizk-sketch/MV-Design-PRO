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
import rekordyAudytu2 from '../../network-build/station-der/__tests__/rekordyAudytu2.json';
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

// Pakiet z TYCH SAMYCH generatorów co końcówka `_validate-all` (fixtura generowana przez
// `backend/tests/uczciwosc/generuj_fixtury_ocen_fe.py`, parytet pilnuje
// `test_fixtury_ocen_fe.py`): stacja z pięcioma dowodami o pięciu statusach rekordu W
// (BRAK_DOWODU ×2, NIE_SPELNIA, BRAK_PODSTAWY, NIE_OCENIONO) i stacja z samymi brakami.
const PAKIET = rekordyAudytu2.pakiet_projektu as unknown as Audit2ProjectProofPackResponse;

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
    const dowody = within(lakowa).getAllByTestId('audit2-proof');
    expect(dowody).toHaveLength(5);
    // Karta WERDYKT-MIGRACJA-190: każdy dowód pokazuje etykietę SWOJEGO rekordu W (tekst
    // i semantyka koloru z backendu) — iloczyn pięciu statusów rekordu.
    const rekordy = PAKIET.per_station[0].proofs;
    dowody.forEach((dowod, i) => {
      const w = rekordy[i].wymaganie;
      expect(dowod.getAttribute('data-status')).toBe(w.status_maszynowy);
      const etykieta = within(dowod).getByTestId('audit2-proof-etykieta');
      expect(etykieta.textContent).toBe(w.etykieta.etykieta_pl);
      expect(etykieta.getAttribute('data-semantyka')).toBe(w.etykieta.semantyka);
      expect(dowod.textContent).toContain(w.wyjasnienie.zdanie_pl);
    });
    expect(new Set(dowody.map((d) => d.getAttribute('data-status')))).toEqual(
      new Set(['BRAK_DOWODU', 'NIE_SPELNIA', 'BRAK_PODSTAWY', 'NIE_OCENIONO']),
    );
    // Brak werdyktu zbiorczego pakietu (agregat nie zastępuje składników) i brak własnego
    // „OK"/„pozytywna" z flagi.
    expect(screen.queryByTestId('audit2-pakiet-status')).toBeNull();
    expect(tekstEkranu()).not.toMatch(/Weryfikacja pozytywna|Wymaga sprawdzenia|\bOK\b/);
    expect(within(polna).queryAllByTestId('audit2-proof')).toHaveLength(0);
    const braki = within(polna).getAllByTestId('audit2-brak-danych');
    expect(braki).toHaveLength(2);
    expect(braki[0].textContent).toContain('brak danych: Źródło PV Polna nie ma mocy znamionowej');
    expect(within(polna).getByTestId('audit2-pakiet-naglowek').textContent).toContain(
      '0 dowodów, 2 braków danych',
    );

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
    // Granica eksportu z warunków OSD nie jest w modelu: rekord BRAK_PODSTAWY z etykietą
    // rekordu (dawne słowo „normal_export" z progów bez podstawy usunięte).
    expect(wiersz.getAttribute('data-status')).toBe('BRAK_PODSTAWY');
    const rekordEksportu = PAKIET.per_station[0].proofs.find(
      (d) => d.proof_type === 'AUDIT2_HOSTING_CAPACITY_EXPORT',
    )!.wymaganie;
    expect(within(wiersz).getByTestId('hosting-capacity-etykieta').textContent).toBe(
      rekordEksportu.etykieta.etykieta_pl,
    );
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
