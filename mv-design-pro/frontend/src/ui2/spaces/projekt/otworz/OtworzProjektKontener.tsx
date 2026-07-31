/*
 * Kontener ekranu „Nowy / otwórz projekt" (E1a, karta K4) — wpięcie
 * prezentacyjnego `OtworzProjekt` (W-102) do REALNYCH akcji backendu.
 * Renderowany przez AppRoot w przestrzeni „Projekt", gdy `activeProjectId`
 * jest puste (sekwencja pierwszego użycia, KOLEJNOSC_KROKOW_E1_E8 §P1).
 *
 * Akcje (zero fabrykacji — każda kontrolka mapuje na realne API):
 * - lista „Istniejące projekty": GET /api/projects (`listProjects`) +
 *   czysta projekcja `mapujProjekty` (reużycie adaptera E2.2);
 * - `onNowyProjekt(cel)`: POST /api/projects (nazwa/opis z celu, tryb TO-BE,
 *   15,0 kV / 50,0 Hz — kształt jak w specach e2e) → aktywacja projektu →
 *   POST /api/study-cases z `set_active: true` (bez przypadku pulpit
 *   i obliczenia są martwe — wzorzec `ProjectDashboardSurface`) → aktywacja
 *   przypadku; pulpit pokazuje AppRoot (activeProjectId ≠ null);
 * - `onOtworzProjekt(id)`: aktywacja projektu (nazwa z listy) + aktywny
 *   przypadek z serwera (GET /api/study-cases/project/{id}/active — hydratacja
 *   K2 waliduje kontekst, ale NIE odtwarza `activeCaseId` z null, więc bez
 *   tego kroku migawka modelu nigdy by się nie załadowała); resztę robi
 *   hydratacja K2 + orkiestrator (refresh_snapshot).
 *
 * Parytet z mostem `#dashboard` (karta KD-1, luki L-2…L-5) — każda kontrolka
 * mapuje na istniejące wywołanie klienta `ui/projects/api.ts`:
 * - L-2 `onUsunProjekt`: DELETE /api/projects/{id} (`deleteProject`) po
 *   potwierdzeniu w ekranie; po usunięciu lista jest pobierana ponownie, a
 *   usunięcie AKTYWNEGO projektu czyści kontekst aplikacji (migawka, przypadek);
 * - L-3 `onNowyProjektZDanymi`: POST /api/projects z nazwą i opisem od
 *   projektanta (ten sam tor tworzenia wariantu bazowego co ścieżka od celu);
 * - L-4 `onOdswiezListe`: ponowne GET /api/projects;
 * - L-5 `aktywnyProjekt` + `onWrocDoPulpitu`: ekran działa również przy
 *   OTWARTYM projekcie (wejście „Otwórz projekt" z powłoki), a zmiana projektu
 *   przechodzi przez potwierdzenie w ekranie.
 *
 * Sekcja „gotowe przykłady" (P-01…P-05): NIE renderuje się — brak realnego
 * dostawcy. Zmierzone: `api/reference_patterns.py` (walidacje nastaw I>>),
 * `api/reference_networks.py` (biblioteka read-only + run in-memory) ani
 * `api/reference_engine.py` (packi zgodności) NIE materializują przykładowej
 * sieci do NOWEGO projektu jednym wywołaniem. Dług nazwany w meldunku karty.
 */

import { useCallback, useEffect, useState } from 'react';

import { useAppStateStore } from '../../../../ui/app-state';
import { notify } from '../../../../ui/notifications/store';
import { createProject, deleteProject, listProjects } from '../../../../ui/projects/api';
import { createStudyCase, getActiveStudyCase } from '../../../../ui/study-cases/api';
import type { CelProjektuId } from './CelProjektu';
import { OtworzProjekt } from './OtworzProjekt';
import { mapujProjekty, type ProjektWiersz } from './adapters/projektyAdapter';
import { OTWORZ_STRINGS } from './strings';

/** Nazwa i opis nowego projektu wyprowadzone z celu pracy (W-102: start od celu). */
const METRYKA_CELU: Record<CelProjektuId, { nazwa: string; opis: string }> = {
  'nowa-siec': { nazwa: OTWORZ_STRINGS.celNowaSiec, opis: OTWORZ_STRINGS.celNowaSiecOpis },
  'przylaczenie-oze': {
    nazwa: OTWORZ_STRINGS.celPrzylaczenieOze,
    opis: OTWORZ_STRINGS.celPrzylaczenieOzeOpis,
  },
  rozbudowa: { nazwa: OTWORZ_STRINGS.celRozbudowa, opis: OTWORZ_STRINGS.celRozbudowaOpis },
  audyt: { nazwa: OTWORZ_STRINGS.celAudyt, opis: OTWORZ_STRINGS.celAudytOpis },
};

/** Teksty kontenera (komunikaty operacji — poza kontraktem W-102). */
export const OTWORZ_KONTENER_STRINGS = {
  nazwaPierwszegoPrzypadku: 'Wariant bazowy',
  opisPierwszegoPrzypadku: 'Domyślny wariant pracy sieci utworzony automatycznie z projektem',
  utworzono: (nazwa: string) => `Utworzono projekt „${nazwa}" z wariantem bazowym.`,
  bladTworzenia: 'Nie udało się utworzyć projektu.',
  bladPrzypadku:
    'Projekt utworzony, ale nie udało się utworzyć pierwszego przypadku obliczeniowego. Utwórz go w przestrzeni „Obliczenia".',
  bladListy: 'Nie udało się pobrać listy projektów.',
} as const;

export interface OtworzProjektKontenerProps {
  /**
   * L-5: ekran otwarty PRZY otwartym projekcie (wejście „Otwórz projekt"
   * z powłoki). Powrót na pulpit bez zmiany kontekstu; brak funkcji = tryb
   * sekwencji pierwszego użycia (bez projektu, bez powrotu).
   */
  onWrocDoPulpitu?: () => void;
  /** Wywoływane po skutecznym otwarciu / utworzeniu projektu (zamyka tryb zmiany). */
  onProjektOtwarty?: () => void;
}

export function OtworzProjektKontener({
  onWrocDoPulpitu,
  onProjektOtwarty,
}: OtworzProjektKontenerProps = {}) {
  const setActiveProject = useAppStateStore((s) => s.setActiveProject);
  const setActiveCase = useAppStateStore((s) => s.setActiveCase);
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);

  const [projekty, setProjekty] = useState<ProjektWiersz[]>([]);
  const [ladowanie, setLadowanie] = useState(true);
  const [wToku, setWToku] = useState(false);

  const pobierzListe = useCallback(async () => {
    setLadowanie(true);
    try {
      setProjekty(mapujProjekty(await listProjects()));
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : OTWORZ_KONTENER_STRINGS.bladListy, 'error');
    } finally {
      setLadowanie(false);
    }
  }, []);

  useEffect(() => {
    let aktywne = true;
    void listProjects()
      .then((lista) => {
        if (aktywne) setProjekty(mapujProjekty(lista));
      })
      .catch((err: unknown) => {
        if (aktywne) {
          notify(err instanceof Error ? err.message : OTWORZ_KONTENER_STRINGS.bladListy, 'error');
        }
      })
      .finally(() => {
        if (aktywne) setLadowanie(false);
      });
    return () => {
      aktywne = false;
    };
  }, []);

  /** Wspólny tor tworzenia projektu (od celu — L-3 z własną nazwą i opisem). */
  const utworzProjekt = useCallback(
    async (nazwa: string, opis: string) => {
      if (wToku) return;
      setWToku(true);
      try {
        const projekt = await createProject({
          name: nazwa,
          description: opis,
          mode: 'TO-BE',
          voltage_level_kv: 15.0,
          frequency_hz: 50.0,
        });
        setActiveProject(projekt.id, projekt.name);
        try {
          const przypadek = await createStudyCase({
            project_id: projekt.id,
            name: OTWORZ_KONTENER_STRINGS.nazwaPierwszegoPrzypadku,
            description: OTWORZ_KONTENER_STRINGS.opisPierwszegoPrzypadku,
            config: {},
            set_active: true,
          });
          setActiveCase(przypadek.id, przypadek.name, null, 'NONE');
          notify(OTWORZ_KONTENER_STRINGS.utworzono(projekt.name), 'success');
        } catch {
          // Projekt istnieje i jest aktywny — brak przypadku komunikujemy
          // uczciwie (pulpit pokaże pustą listę przypadków).
          notify(OTWORZ_KONTENER_STRINGS.bladPrzypadku, 'error');
        }
        onProjektOtwarty?.();
      } catch (err: unknown) {
        notify(
          err instanceof Error ? err.message : OTWORZ_KONTENER_STRINGS.bladTworzenia,
          'error',
        );
      } finally {
        setWToku(false);
      }
    },
    [onProjektOtwarty, setActiveCase, setActiveProject, wToku],
  );

  const onNowyProjekt = useCallback(
    (cel: CelProjektuId) => {
      const metryka = METRYKA_CELU[cel];
      return utworzProjekt(metryka.nazwa, metryka.opis);
    },
    [utworzProjekt],
  );

  const onOtworzProjekt = useCallback(
    async (id: string) => {
      if (wToku) return;
      setWToku(true);
      try {
        const wiersz = projekty.find((p) => p.id === id);
        setActiveProject(id, wiersz?.nazwa ?? null);
        try {
          const aktywnyPrzypadek = await getActiveStudyCase(id);
          // Kontekst mógł się zmienić w trakcie żądania — nie nadpisujemy.
          if (useAppStateStore.getState().activeProjectId !== id) return;
          if (aktywnyPrzypadek?.id) {
            setActiveCase(
              aktywnyPrzypadek.id,
              aktywnyPrzypadek.name ?? null,
              null,
              aktywnyPrzypadek.result_status ?? 'NONE',
            );
          }
        } catch {
          // Brak aktywnego przypadku nie blokuje otwarcia — pulpit pokaże
          // stan uczciwie, przypadek można aktywować w „Obliczeniach".
        }
        onProjektOtwarty?.();
      } finally {
        setWToku(false);
      }
    },
    [onProjektOtwarty, projekty, setActiveCase, setActiveProject, wToku],
  );

  /** L-2: usunięcie projektu (potwierdzenie zebrał ekran) + odświeżenie listy. */
  const onUsunProjekt = useCallback(
    async (id: string) => {
      if (wToku) return;
      const wiersz = projekty.find((p) => p.id === id);
      setWToku(true);
      try {
        await deleteProject(id);
        // Usunięcie AKTYWNEGO projektu musi wyczyścić kontekst aplikacji —
        // inaczej powłoka trzymałaby migawkę i przypadek nieistniejącego
        // projektu (`setActiveProject(null)` resetuje migawkę i przypadek).
        if (useAppStateStore.getState().activeProjectId === id) {
          setActiveProject(null, null);
        }
        notify(OTWORZ_STRINGS.usunieto(wiersz?.nazwa ?? id), 'info');
        await pobierzListe();
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : OTWORZ_STRINGS.bladUsuwania, 'error');
      } finally {
        setWToku(false);
      }
    },
    [pobierzListe, projekty, setActiveProject, wToku],
  );

  return (
    <OtworzProjekt
      projekty={projekty}
      ladowanieProjektow={ladowanie}
      /* K4 §c: brak dostawcy materializacji przykładu (dowód w nagłówku pliku)
         → pusta lista = sekcja przykładów nie renderuje się (zero fabrykacji). */
      przyklady={[]}
      onOtworzProjekt={(id) => void onOtworzProjekt(id)}
      onNowyProjekt={(cel) => void onNowyProjekt(cel)}
      onNowyProjektZDanymi={(nazwa, opis) => void utworzProjekt(nazwa, opis)}
      onOdswiezListe={() => void pobierzListe()}
      onUsunProjekt={(id) => void onUsunProjekt(id)}
      aktywnyProjekt={
        activeProjectId != null
          ? { id: activeProjectId, nazwa: activeProjectName ?? activeProjectId }
          : null
      }
      onWrocDoPulpitu={onWrocDoPulpitu}
      wToku={wToku}
      onWczytajPrzyklad={() => {
        // Nieosiągalne przy pustej liście przykładów — celowo bez akcji
        // (żadnego udawania materializacji; dostawca = przyszła karta).
      }}
    />
  );
}
