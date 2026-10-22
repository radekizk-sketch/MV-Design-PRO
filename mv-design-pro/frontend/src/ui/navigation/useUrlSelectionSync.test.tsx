import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../types/enm';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { resolveSelectedElementFromSnapshot } from '../shared/selectionResolution';
import { useSelectionStore } from '../selection/store';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useUrlSelectionSync } from './useUrlSelectionSync';
import { navigateToSld } from './routes';

const snapshot = {
  header: {} as never,
  buses: [
    {
      id: 'bus-sn',
      ref_id: 'bus-sn',
      name: 'Szyna SN',
      tags: [],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
    },
  ],
  branches: [
    {
      id: 'brk-1',
      ref_id: 'stn/1/sn_field_breaker/000',
      name: 'Wyłącznik pola SN 1',
      tags: [],
      meta: {},
      from_bus_ref: 'bus-sn',
      to_bus_ref: 'bus-sn',
      status: 'closed',
      type: 'breaker',
    },
    {
      id: 'kab-1',
      ref_id: 'kab-1',
      name: 'Kabel K1',
      tags: [],
      meta: {},
      from_bus_ref: 'bus-sn',
      to_bus_ref: 'bus-sn',
      status: 'closed',
      type: 'cable',
    },
  ],
  transformers: [],
  sources: [],
  loads: [],
  generators: [],
  substations: [
    {
      id: 'stn/abc/station',
      ref_id: 'stn/abc/station',
      name: 'Stacja inline',
      tags: [],
      meta: {},
      // Deklaracja „przelotowa" przy stacji BEZ pól — podpis idzie za rodzajem z topologii
      // (jedna reguła `ui/shared/rodzajStacji.ts`: 0 pól liniowych ⇒ końcowa), nie za deklaracją.
      station_type: 'inline',
      bus_refs: [],
      transformer_refs: [],
    },
  ],
  bays: [],
  junctions: [],
  branch_points: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
} as unknown as EnergyNetworkModel;

function UrlSelectionSyncProbe() {
  useUrlSelectionSync();
  return null;
}

describe('useUrlSelectionSync', () => {
  beforeEach(() => {
    act(() => {
      window.history.replaceState(
        null,
        '',
        '/#sld?sel=stn%2F1%2Fsn_field_breaker%2F000&type=LineBranch&name=Wy%C5%82%C4%85cznik+pola+SN+1',
      );
      useSelectionStore.getState().clearSelection();
      useSnapshotStore.setState({ snapshot } as never);
    });
  });

  afterEach(() => {
    act(() => {
      useSelectionStore.getState().clearSelection();
      useSnapshotStore.getState().reset();
      useNetworkBuildStore.getState().reset();
      window.history.replaceState(null, '', '/');
    });
  });

  it('canonicalizes a stale breaker deep link from LineBranch to Switch', async () => {
    act(() => {
      render(<UrlSelectionSyncProbe />);
    });

    await waitFor(() => {
      expect(useSelectionStore.getState().selectedElement).toMatchObject({
        id: 'stn/1/sn_field_breaker/000',
        type: 'Switch',
        name: 'Wyłącznik pola SN 1',
      });
    });

    expect(new URLSearchParams(window.location.hash.split('?')[1]).get('type')).toBe('Switch');
  });

  it('replaces generic station route names with public station labels', async () => {
    act(() => {
      window.history.replaceState(
        null,
        '',
        '/#sld?sel=stn%2Fabc%2Fstation&type=Station&name=Stacja+inline',
      );
      useSelectionStore.getState().clearSelection();
    });

    act(() => {
      render(<UrlSelectionSyncProbe />);
    });

    await waitFor(() => {
      expect(useSelectionStore.getState().selectedElement).toMatchObject({
        id: 'stn/abc/station',
        type: 'Station',
        name: 'S01 · Stacja końcowa',
      });
    });

    expect(new URLSearchParams(window.location.hash.split('?')[1]).get('name'))
      .toBe('S01 · Stacja końcowa');
    expect(useNetworkBuildStore.getState().activeSurface).toMatchObject({
      screenCode: 'E-13',
      entityRef: 'stn/abc/station',
      entityType: 'station',
    });
  });
  it('replaces raw station-scoped apparatus route names with public technical labels', async () => {
    act(() => {
      window.history.replaceState(
        null,
        '',
        '/#sld?sel=stn%2Fabc%2Fstation%2Fpv%2Fnn-breaker%2FQ2&type=Station&name=stn%2Fabc%2Fstation%2Fpv%2Fnn-breaker%2FQ2',
      );
      useSelectionStore.getState().clearSelection();
    });

    act(() => {
      render(<UrlSelectionSyncProbe />);
    });

    await waitFor(() => {
      expect(useSelectionStore.getState().selectedElement).toMatchObject({
        id: 'stn/abc/station/pv/nn-breaker/Q2',
        type: 'Station',
      });
      expect(useSelectionStore.getState().selectedElement?.name).toContain('Stacja końcowa');
      expect(useSelectionStore.getState().selectedElement?.name).toContain('PV Q2');
      expect(useSelectionStore.getState().selectedElement?.name).not.toContain('stn/');
    });

    const name = new URLSearchParams(window.location.hash.split('?')[1]).get('name');
    expect(name).toContain('Stacja końcowa');
    expect(name).toContain('PV Q2');
    expect(name).not.toContain('stn/');
  });

  it('clears a stale route selection when the object is not present in ENM', async () => {
    act(() => {
      window.history.replaceState(
        null,
        '',
        '/#sld?sel=stn%2Fmissing%2Fstation&type=Station&name=Stacja+SN%2FnN+6',
      );
      useSelectionStore.getState().clearSelection();
    });

    act(() => {
      render(<UrlSelectionSyncProbe />);
    });

    await waitFor(() => {
      expect(useSelectionStore.getState().selectedElement).toBeNull();
    });

    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    expect(params.get('sel')).toBeNull();
    expect(params.get('type')).toBeNull();
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });

  // K9-A (regresja naprawy): porządkowanie NIEUDANEJ selekcji nie może zamykać
  // otwartego formularza operacji (kreatora w trakcie pracy). Precedens: wskazanie
  // niekanoniczne po zapisie źródła OZE składało stos powierzchni i podsumowanie
  // po zapisie nigdy nie było widoczne w żywej aplikacji.
  it('does not collapse an open operation form when selection canonicalization fails', async () => {
    act(() => {
      window.history.replaceState(null, '', '/#sld');
      useSelectionStore.getState().clearSelection();
      useNetworkBuildStore.getState().openOperationForm('add_converter_source', {});
    });

    act(() => {
      render(<UrlSelectionSyncProbe />);
    });
    expect(useNetworkBuildStore.getState().activeSurface?.routeState.payload?.delegate).toBe(
      'operation_form',
    );

    // Selekcja niekanoniczna (elementu nie ma w modelu) przy otwartym kreatorze.
    act(() => {
      useSelectionStore.getState().selectElement({
        id: 'nn/deadbeef/source_field',
        type: 'BaySN',
        name: 'Pole PV nN',
      });
    });

    await waitFor(() => {
      expect(useSelectionStore.getState().selectedElement).toBeNull();
    });
    // Formularz operacji przeżył porządkowanie selekcji.
    expect(useNetworkBuildStore.getState().activeSurface?.routeState.payload?.delegate).toBe(
      'operation_form',
    );
  });

  /**
   * Karta UI-02 PANEL-DOLNY — okno techniczne idzie za selekcją z KAŻDEGO źródła.
   * Iloczyn: źródło selekcji (kanoniczna z panelu `zaznaczElementModelu` × niekanoniczna
   * ze schematu: nazwa = ref) × cel (z oknem: stacja/odcinek × bez okna: szyna) × okno
   * (otwarte przez synchronizację selekcji × otwarte przez użytkownika — formularz operacji).
   * Bez naprawy selekcja kanoniczna zostawiała w inspektorze okno poprzedniej stacji.
   */
  describe('okno techniczne idzie za selekcją', () => {
    async function oknoStacji() {
      act(() => {
        window.history.replaceState(null, '', '/#sld?sel=stn%2Fabc%2Fstation&type=Station&name=Stacja+inline');
        useSelectionStore.getState().clearSelection();
      });
      act(() => {
        render(<UrlSelectionSyncProbe />);
      });
      await waitFor(() => {
        expect(useNetworkBuildStore.getState().activeSurface).toMatchObject({
          screenCode: 'E-13',
          entityRef: 'stn/abc/station',
        });
      });
    }
    const kanoniczny = (ref: string) => {
      const element = resolveSelectedElementFromSnapshot(snapshot, ref);
      expect(element, ref).not.toBeNull();
      return element!;
    };

    it.each([
      ['kanoniczna (wiersz panelu)', () => kanoniczny('bus-sn')],
      ['niekanoniczna (klik w schemat)', () => ({ id: 'bus-sn', type: 'Bus' as const, name: 'bus-sn' })],
    ])('szyna bez okna technicznego (%s) zamyka okno poprzedniej stacji', async (_opis, selekcja) => {
      await oknoStacji();
      act(() => {
        useSelectionStore.getState().selectElement(selekcja());
      });
      await waitFor(() => {
        expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
      });
      expect(useSelectionStore.getState().selectedElement?.id).toBe('bus-sn');
    });

    it.each([
      ['kanoniczna (wiersz panelu)', () => kanoniczny('kab-1')],
      ['niekanoniczna (klik w schemat)', () => ({ id: 'kab-1', type: 'LineBranch' as const, name: 'kab-1' })],
    ])('odcinek z oknem technicznym (%s) przestawia okno na ten odcinek', async (_opis, selekcja) => {
      await oknoStacji();
      act(() => {
        useSelectionStore.getState().selectElement(selekcja());
      });
      await waitFor(() => {
        expect(useNetworkBuildStore.getState().activeSurface).toMatchObject({
          screenCode: 'E-12',
          entityRef: 'kab-1',
        });
      });
    });

    it('ponowne wskazanie tego samego obiektu nie otwiera okna od nowa', async () => {
      await oknoStacji();
      const przed = useNetworkBuildStore.getState().activeSurface?.surfaceId;
      act(() => {
        useSelectionStore.getState().selectElement(kanoniczny('stn/abc/station'));
      });
      await waitFor(() => {
        expect(useSelectionStore.getState().selectedElement?.name).toBe('S01 · Stacja końcowa');
      });
      expect(useNetworkBuildStore.getState().activeSurface?.surfaceId).toBe(przed);
    });

    it('zdjęcie selekcji (Escape, klik w tło) zamyka okno otwarte przez selekcję', async () => {
      await oknoStacji();
      // Odtwarzanie z adresu blokuje reakcje do następnej klatki.
      await act(() => new Promise<void>((koniec) => requestAnimationFrame(() => koniec())));
      act(() => {
        useSelectionStore.getState().clearSelection();
      });
      await waitFor(() => {
        expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
      });
    });

    it('zdjęcie selekcji nie zamyka formularza otwartego przez użytkownika', async () => {
      act(() => {
        window.history.replaceState(null, '', '/#sld');
        useSelectionStore.getState().clearSelection();
        useNetworkBuildStore.getState().openOperationForm('add_converter_source', {});
      });
      act(() => {
        render(<UrlSelectionSyncProbe />);
      });
      await act(() => new Promise<void>((koniec) => requestAnimationFrame(() => koniec())));
      const formularz = useNetworkBuildStore.getState().activeSurface;
      expect(formularz).not.toBeNull();
      act(() => {
        useSelectionStore.getState().selectElement(kanoniczny('kab-1'));
      });
      await waitFor(() => expect(useSelectionStore.getState().selectedElement?.id).toBe('kab-1'));
      act(() => {
        useSelectionStore.getState().clearSelection();
      });
      await waitFor(() => expect(useSelectionStore.getState().selectedElement).toBeNull());
      expect(useNetworkBuildStore.getState().activeSurface?.surfaceId).toBe(formularz?.surfaceId);
    });

    it('okno otwarte przez użytkownika (formularz operacji) nie jest ruszane przez selekcję', async () => {
      act(() => {
        window.history.replaceState(null, '', '/#sld');
        useSelectionStore.getState().clearSelection();
        useNetworkBuildStore.getState().openOperationForm('add_converter_source', {});
      });
      act(() => {
        render(<UrlSelectionSyncProbe />);
      });
      const formularz = useNetworkBuildStore.getState().activeSurface;
      expect(formularz).not.toBeNull();
      for (const ref of ['bus-sn', 'kab-1']) {
        act(() => {
          useSelectionStore.getState().selectElement(kanoniczny(ref));
        });
        await waitFor(() => expect(useSelectionStore.getState().selectedElement?.id).toBe(ref));
        expect(useNetworkBuildStore.getState().activeSurface?.surfaceId).toBe(formularz?.surfaceId);
      }
    });
  });
});

describe('useUrlSelectionSync — zimny start bez trasy', () => {
  afterEach(() => {
    act(() => {
      useSelectionStore.getState().clearSelection();
      useSnapshotStore.getState().reset();
      window.history.replaceState(null, '', '/');
    });
  });

  // K6: zapis kreatora (np. „Zmień" w karcie inspektora → update_element_parameters) wybiera
  // obiekt i woła navigateToSld(). Przy adresie `/` selekcja lądowała w location.search,
  // a przejście na `#sld` czytało pusty hash i czyściło selekcję — inspektor się zwijał.
  it('selekcja wybrana przy adresie `/` przeżywa navigateToSld()', async () => {
    act(() => {
      window.history.replaceState(null, '', '/');
      useSnapshotStore.setState({ snapshot } as never);
    });
    render(<UrlSelectionSyncProbe />);
    // Odtwarzanie z adresu przy montażu blokuje zapis do adresu do następnej klatki.
    await act(() => new Promise<void>((koniec) => requestAnimationFrame(() => koniec())));
    const ref = 'stn/1/sn_field_breaker/000';
    act(() => {
      useSelectionStore.getState().selectElement({ id: ref, type: 'Switch', name: 'Wyłącznik pola SN 1' });
    });
    await waitFor(() => expect(new URLSearchParams(window.location.hash.split('?')[1]).get('sel')).toBe(ref));
    expect(window.location.search).toBe('');
    act(() => {
      navigateToSld();
      // Przeglądarka przy nawigacji fragmentu (`location.hash = …`) wysyła `popstate`;
      // jsdom tego nie robi, więc zdarzenie wysyłamy jawnie — to ono czyściło selekcję.
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(window.location.hash.startsWith('#sld?')).toBe(true));
    expect(useSelectionStore.getState().selectedElement?.id).toBe(ref);
    expect(new URLSearchParams(window.location.hash.split('?')[1]).get('sel')).toBe(ref);
  });
});
