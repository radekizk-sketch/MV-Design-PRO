/*
 * Okno „Archiwum projektu (ZIP)" — przestrzeń „Projekt", etap E8 (przekazanie
 * projektu). Do tej karty karta huba dokumentacji „Archiwum projektu (ZIP)"
 * prowadziła do przestrzeni, w której NIE BYŁO żadnej akcji archiwum: backend
 * miał komplet końcówek, a interfejs nie miał ani jednego punktu wejścia.
 *
 * Kontrakt ekranu prowadzącego: cel jednym zdaniem · cztery ścieżki (spakuj /
 * odtwórz / porównaj wersje / przekaż same zmiany — dwie ostatnie w
 * `PorownanieWersji` i `PaczkaZmian`) · uczciwe stany zerowe · jawny następny krok. ZERO fizyki, ZERO
 * mutacji modelu — wyłącznie wołania REALNYCH końcówek archiwum i prezentacja
 * ich odpowiedzi (wynik importu 1:1 z backendu, łącznie z bramką katalogową).
 *
 * Łańcuch danych (skąd → dokąd): otwarty projekt (`ui/app-state`) → eksport
 * z zapisem do magazynu dokumentów → rekord typu „ARCHIWUM" widoczny na karcie
 * huba dokumentacji (Pobierz/Podgląd). Import → nowy projekt na serwerze →
 * jawna akcja otwarcia go jako aktywnego (kontekst aplikacji), bez cichego
 * przełączania kontekstu pod użytkownikiem.
 */

import { useCallback, useRef, useState, type ChangeEvent } from 'react';

import './archiwum.css';

import { useAppStateStore } from '../../../../ui/app-state';
import { getProject } from '../../../../ui/projects/api';
import { getActiveStudyCase } from '../../../../ui/study-cases/api';
import {
  eksportujArchiwum,
  importujArchiwum,
  podejrzyjArchiwum,
  type PodgladArchiwum,
  type WynikImportu,
} from './api';
import { PaczkaZmian } from './PaczkaZmian';
import { PorownanieWersji } from './PorownanieWersji';
import {
  ARCHIWUM_STRINGS as T,
  formatujDateArchiwum,
  jestPlikiemArchiwum,
  nazwaPlikuArchiwum,
} from './strings';
import { RaportImportu, Wiersz, zapiszBlob } from './wspolne';

/** Podgląd zawartości paczki (odpowiedź końcówki podglądu, bez importu). */
function PodgladPaczki({ podglad }: { podglad: PodgladArchiwum }) {
  if (!podglad.valid) {
    return (
      <div className="mvd-arch-blad" role="alert" data-testid="mvd-arch-podglad-blad">
        {podglad.error ?? T.podgladNiepoprawna}
      </div>
    );
  }
  const z = podglad.summary;
  return (
    <div className="mvd-arch-podglad" data-testid="mvd-arch-podglad">
      <span className="mvd-arch-meta-k">{T.podgladTytul}</span>
      <h5>{podglad.project_name ?? '—'}</h5>
      {podglad.project_description ? (
        <p className="mvd-arch-opis">{podglad.project_description}</p>
      ) : null}
      <div className="mvd-arch-kv-siatka">
        <Wiersz etykieta={T.podgladWersja} wartosc={podglad.schema_version ?? '—'} />
        <Wiersz etykieta={T.podgladData} wartosc={formatujDateArchiwum(podglad.exported_at)} />
        <Wiersz
          etykieta={T.podgladOdcisk}
          wartosc={podglad.archive_hash ? podglad.archive_hash.slice(0, 16) : '—'}
        />
      </div>
      {z ? (
        <div className="mvd-arch-kv-siatka" data-testid="mvd-arch-podglad-zawartosc">
          <Wiersz
            etykieta={T.podgladWarianty}
            wartosc={String(z.study_cases_count + z.operating_cases_count)}
          />
          <Wiersz etykieta={T.podgladPrzebiegi} wartosc={String(z.canonical_runs_count)} />
          <Wiersz etykieta={T.podgladModele} wartosc={String(z.enm_models_count)} />
        </div>
      ) : null}
    </div>
  );
}

export interface EkranArchiwumProps {
  /** Powrót do pulpitu projektu (zamknięcie okna przestrzeni). */
  readonly onZamknij: () => void;
}

export function EkranArchiwum({ onZamknij }: EkranArchiwumProps) {
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const setActiveProject = useAppStateStore((s) => s.setActiveProject);
  const setActiveCase = useAppStateStore((s) => s.setActiveCase);

  const [eksportWToku, setEksportWToku] = useState(false);
  const [eksportGotowe, setEksportGotowe] = useState(false);
  const [eksportBlad, setEksportBlad] = useState<string | null>(null);

  const [plik, setPlik] = useState<File | null>(null);
  const [nowaNazwa, setNowaNazwa] = useState('');
  const [weryfikuj, setWeryfikuj] = useState(true);
  const [podglad, setPodglad] = useState<PodgladArchiwum | null>(null);
  const [wynik, setWynik] = useState<WynikImportu | null>(null);
  const [podgladWToku, setPodgladWToku] = useState(false);
  const [importWToku, setImportWToku] = useState(false);
  const [importBlad, setImportBlad] = useState<string | null>(null);
  const polePliku = useRef<HTMLInputElement>(null);

  const eksportuj = useCallback(async () => {
    if (!activeProjectId) return;
    setEksportWToku(true);
    setEksportBlad(null);
    setEksportGotowe(false);
    try {
      // Zapis do magazynu dokumentów = ten sam plik widoczny później na karcie
      // „Archiwum projektu (ZIP)" w hubie dokumentacji (rekord typu ARCHIWUM).
      const blob = await eksportujArchiwum(activeProjectId, { zapiszDoMagazynu: true });
      zapiszBlob(blob, nazwaPlikuArchiwum(activeProjectName, new Date()));
      setEksportGotowe(true);
    } catch (err: unknown) {
      setEksportBlad(err instanceof Error ? err.message : T.eksportBlad);
    } finally {
      setEksportWToku(false);
    }
  }, [activeProjectId, activeProjectName]);

  const wybierzPlik = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const wybrany = event.target.files?.[0] ?? null;
    setPodglad(null);
    setWynik(null);
    setImportBlad(null);
    if (wybrany && !jestPlikiemArchiwum(wybrany.name)) {
      setPlik(null);
      setImportBlad(T.importZlyFormat);
      return;
    }
    setPlik(wybrany);
  }, []);

  const sprawdzZawartosc = useCallback(async () => {
    if (!plik) return;
    setPodgladWToku(true);
    setImportBlad(null);
    try {
      setPodglad(await podejrzyjArchiwum(plik));
    } catch (err: unknown) {
      setImportBlad(err instanceof Error ? err.message : T.importBlad);
    } finally {
      setPodgladWToku(false);
    }
  }, [plik]);

  const importuj = useCallback(async () => {
    if (!plik) return;
    setImportWToku(true);
    setImportBlad(null);
    try {
      setWynik(
        await importujArchiwum(plik, {
          nowaNazwa: nowaNazwa.trim() || undefined,
          weryfikujIntegralnosc: weryfikuj,
        }),
      );
    } catch (err: unknown) {
      setImportBlad(err instanceof Error ? err.message : T.importBlad);
    } finally {
      setImportWToku(false);
    }
  }, [nowaNazwa, plik, weryfikuj]);

  const wyczysc = useCallback(() => {
    setPlik(null);
    setNowaNazwa('');
    setPodglad(null);
    setWynik(null);
    setImportBlad(null);
    if (polePliku.current) polePliku.current.value = '';
  }, []);

  /**
   * Otwarcie projektu odtworzonego z paczki (pełnej albo paczki zmian). Nazwa
   * nieznana na ekranie (pole nazwy puste, brak podglądu) jest czytana z
   * backendu — nazwa projektu nigdy nie jest zgadywana.
   */
  const otworzProjekt = useCallback(
    async (id: string, nazwa: string | null) => {
      // Ten sam tor otwarcia co ekran „Nowy / otwórz projekt": bez aktywnego
      // wariantu obliczeniowego migawka modelu nigdy by się nie załadowała.
      try {
        const nazwaProjektu = nazwa ?? (await getProject(id)).name;
        setActiveProject(id, nazwaProjektu);
        const aktywny = await getActiveStudyCase(id);
        if (useAppStateStore.getState().activeProjectId !== id) return;
        if (aktywny?.id) {
          setActiveCase(aktywny.id, aktywny.name ?? null, null, aktywny.result_status ?? 'NONE');
        }
      } catch {
        // Nazwany wynik: projekt już istnieje na serwerze, a brak wariantu albo
        // nazwy nie blokuje otwarcia — pulpit pokaże stan uczciwie.
        if (useAppStateStore.getState().activeProjectId !== id) setActiveProject(id, nazwa);
      } finally {
        onZamknij();
      }
    },
    [onZamknij, setActiveCase, setActiveProject],
  );

  const otworzOdtworzony = useCallback(() => {
    if (!wynik?.project_id) return;
    void otworzProjekt(wynik.project_id, nowaNazwa.trim() || podglad?.project_name || null);
  }, [nowaNazwa, otworzProjekt, podglad, wynik]);

  return (
    <div className="mvd-arch" data-testid="mvd-archiwum-projektu">
      <header className="mvd-arch-head">
        <div>
          <h2>{T.tytul}</h2>
          <p>{T.cel}</p>
        </div>
        <button type="button" className="mvd-btn" onClick={onZamknij} data-testid="mvd-arch-powrot">
          {T.powrot}
        </button>
      </header>

      {/* Ścieżka 1 — spakowanie otwartego projektu. */}
      <section className="mvd-arch-sekcja" aria-label={T.eksportEyebrow}>
        <span className="mvd-arch-lbl">{T.eksportEyebrow}</span>
        <p className="mvd-arch-opis">{T.eksportOpis}</p>

        {activeProjectId == null ? (
          <div className="mvd-arch-pusty" data-testid="mvd-arch-eksport-brak-projektu">
            <p className="mvd-arch-pusty-tytul">{T.eksportBrakProjektu}</p>
            <p className="mvd-arch-opis">{T.eksportBrakProjektuOpis}</p>
          </div>
        ) : (
          <>
            <div className="mvd-arch-kv-siatka">
              <Wiersz etykieta={T.eksportProjekt} wartosc={activeProjectName ?? activeProjectId} />
            </div>
            <div className="mvd-arch-akcje">
              <button
                type="button"
                className="mvd-btn mvd-btn-primary"
                onClick={() => void eksportuj()}
                disabled={eksportWToku}
                data-testid="mvd-arch-eksport"
              >
                {eksportWToku ? T.eksportWToku : T.eksportAkcja}
              </button>
            </div>
            {eksportGotowe && (
              <p className="mvd-arch-ok" role="status" data-testid="mvd-arch-eksport-ok">
                {T.eksportGotowe}
              </p>
            )}
            {eksportBlad && (
              <p className="mvd-arch-blad" role="alert" data-testid="mvd-arch-eksport-blad">
                {eksportBlad}
              </p>
            )}
          </>
        )}
      </section>

      {/* Ścieżka 2 — odtworzenie projektu z otrzymanej paczki. */}
      <section className="mvd-arch-sekcja" aria-label={T.importEyebrow}>
        <span className="mvd-arch-lbl">{T.importEyebrow}</span>
        <p className="mvd-arch-opis">{T.importOpis}</p>

        <label className="mvd-arch-pole">
          <span className="mvd-arch-pole-etyk">{T.importWybierz}</span>
          <input
            ref={polePliku}
            type="file"
            accept=".zip,.mvdp.zip"
            onChange={wybierzPlik}
            data-testid="mvd-arch-plik"
          />
        </label>

        {plik == null ? (
          <p className="mvd-arch-opis" data-testid="mvd-arch-brak-pliku">
            {T.importBrakPliku}
          </p>
        ) : (
          <>
            <label className="mvd-arch-pole">
              <span className="mvd-arch-pole-etyk">{T.importNazwa}</span>
              <input
                type="text"
                value={nowaNazwa}
                placeholder={T.importNazwaPodpowiedz}
                onChange={(e) => setNowaNazwa(e.target.value)}
                data-testid="mvd-arch-nazwa"
              />
            </label>
            <label className="mvd-arch-pole mvd-arch-pole-check">
              <input
                type="checkbox"
                checked={weryfikuj}
                onChange={(e) => setWeryfikuj(e.target.checked)}
                data-testid="mvd-arch-weryfikuj"
              />
              <span>{T.importWeryfikuj}</span>
            </label>
            <div className="mvd-arch-akcje">
              <button
                type="button"
                className="mvd-btn"
                onClick={() => void sprawdzZawartosc()}
                disabled={podgladWToku || importWToku}
                data-testid="mvd-arch-podglad-akcja"
              >
                {podgladWToku ? T.importPodgladWToku : T.importPodgladAkcja}
              </button>
              <button
                type="button"
                className="mvd-btn mvd-btn-primary"
                onClick={() => void importuj()}
                disabled={importWToku}
                data-testid="mvd-arch-import"
              >
                {importWToku ? T.importWToku : T.importAkcja}
              </button>
            </div>
          </>
        )}

        {podglad && <PodgladPaczki podglad={podglad} />}

        {importBlad && (
          <p className="mvd-arch-blad" role="alert" data-testid="mvd-arch-import-blad">
            {importBlad}
          </p>
        )}

        {wynik && (
          <RaportImportu
            wynik={wynik}
            prefiks="mvd-arch"
            onOtworz={otworzOdtworzony}
            onPonow={wyczysc}
          />
        )}
      </section>

      {/* Ścieżka 3 — porównanie dwóch wersji projektu (paczki albo projekty). */}
      <PorownanieWersji activeProjectId={activeProjectId} />

      {/* Ścieżka 4 — przekazanie samych zmian (paczka zmian). */}
      <PaczkaZmian
        activeProjectId={activeProjectId}
        activeProjectName={activeProjectName}
        onOtworzProjekt={(id, nazwa) => void otworzProjekt(id, nazwa)}
      />
    </div>
  );
}
