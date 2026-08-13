/*
 * Okno „Archiwum projektu (ZIP)" — przestrzeń „Projekt", etap E8 (przekazanie
 * projektu). Do tej karty karta huba dokumentacji „Archiwum projektu (ZIP)"
 * prowadziła do przestrzeni, w której NIE BYŁO żadnej akcji archiwum: backend
 * miał komplet końcówek, a interfejs nie miał ani jednego punktu wejścia.
 *
 * Kontrakt ekranu prowadzącego: cel jednym zdaniem · dwie ścieżki (spakuj /
 * odtwórz) · uczciwe stany zerowe · jawny następny krok. ZERO fizyki, ZERO
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
import { getActiveStudyCase } from '../../../../ui/study-cases/api';
import {
  eksportujArchiwum,
  importujArchiwum,
  podejrzyjArchiwum,
  type PodgladArchiwum,
  type WynikImportu,
} from './api';
import {
  ARCHIWUM_STRINGS as T,
  formatujDateArchiwum,
  jestPlikiemArchiwum,
  nazwaPlikuArchiwum,
} from './strings';

/** Zapisz treść odpowiedzi jako plik do pobrania (mechanika przeglądarkowa). */
function zapiszBlob(blob: Blob, nazwa: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nazwa;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Wiersz klucz–wartość podglądu/raportu. */
function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <div className="mvd-arch-kv">
      <span className="mvd-arch-kv-k">{etykieta}</span>
      <span className="mvd-arch-kv-v mvd-num">{wartosc}</span>
    </div>
  );
}

/** Lista komunikatów backendu (ostrzeżenia / błędy / elementy bez typu). */
function ListaKomunikatow({
  tytul,
  pozycje,
  testid,
  wariant,
}: {
  tytul: string;
  pozycje: readonly string[];
  testid: string;
  wariant: 'warn' | 'err';
}) {
  if (pozycje.length === 0) return null;
  return (
    <div className="mvd-arch-komunikaty" data-wariant={wariant} data-testid={testid}>
      <span className="mvd-arch-meta-k">{tytul}</span>
      <ul>
        {pozycje.map((tekst) => (
          <li key={tekst}>{tekst}</li>
        ))}
      </ul>
    </div>
  );
}

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
          <Wiersz etykieta={T.podgladWezly} wartosc={String(z.nodes_count)} />
          <Wiersz etykieta={T.podgladGalezie} wartosc={String(z.branches_count)} />
          <Wiersz etykieta={T.podgladZrodla} wartosc={String(z.sources_count)} />
          <Wiersz etykieta={T.podgladOdbiory} wartosc={String(z.loads_count)} />
          <Wiersz etykieta={T.podgladSchematy} wartosc={String(z.sld_diagrams_count)} />
          <Wiersz
            etykieta={T.podgladWarianty}
            wartosc={String(z.study_cases_count + z.operating_cases_count)}
          />
          <Wiersz
            etykieta={T.podgladPrzebiegi}
            wartosc={String(z.analysis_runs_count + z.study_runs_count)}
          />
          <Wiersz etykieta={T.podgladWyniki} wartosc={String(z.results_count)} />
          <Wiersz etykieta={T.podgladDowody} wartosc={String(z.proofs_count)} />
        </div>
      ) : null}
    </div>
  );
}

/** Zdanie werdyktu dla statusu importu (uczciwie, wprost z odpowiedzi). */
function werdyktImportu(wynik: WynikImportu): { tekst: string; wariant: 'ok' | 'warn' | 'err' } {
  if (wynik.status === 'SUCCESS') return { tekst: T.raportSukces, wariant: 'ok' };
  if (wynik.status === 'PARTIAL') return { tekst: T.raportCzesciowy, wariant: 'warn' };
  if (wynik.status === 'CATALOG_MAPPING_REQUIRED') {
    return { tekst: T.raportBramkaKatalogu, wariant: 'warn' };
  }
  return { tekst: T.raportNiepowodzenie, wariant: 'err' };
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

  const otworzOdtworzony = useCallback(async () => {
    if (!wynik?.project_id) return;
    const id = wynik.project_id;
    setActiveProject(id, nowaNazwa.trim() || podglad?.project_name || null);
    // Ten sam tor otwarcia co ekran „Nowy / otwórz projekt": bez aktywnego
    // wariantu obliczeniowego migawka modelu nigdy by się nie załadowała.
    try {
      const aktywny = await getActiveStudyCase(id);
      if (useAppStateStore.getState().activeProjectId !== id) return;
      if (aktywny?.id) {
        setActiveCase(aktywny.id, aktywny.name ?? null, null, aktywny.result_status ?? 'NONE');
      }
    } catch {
      // Brak wariantu nie blokuje otwarcia — pulpit pokaże stan uczciwie.
    } finally {
      onZamknij();
    }
  }, [nowaNazwa, onZamknij, podglad, setActiveCase, setActiveProject, wynik]);

  const werdykt = wynik ? werdyktImportu(wynik) : null;

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

        {wynik && werdykt && (
          <div className="mvd-arch-raport" data-wariant={werdykt.wariant} data-testid="mvd-arch-raport">
            <span className="mvd-arch-meta-k">{T.raportTytul}</span>
            <p className="mvd-arch-werdykt" role="status">
              {werdykt.tekst}
            </p>
            {wynik.migrated_from_version && (
              <div className="mvd-arch-kv-siatka">
                <Wiersz etykieta={T.raportMigracja} wartosc={wynik.migrated_from_version} />
              </div>
            )}
            <ListaKomunikatow
              tytul={T.raportOstrzezenia}
              pozycje={wynik.warnings}
              testid="mvd-arch-ostrzezenia"
              wariant="warn"
            />
            <ListaKomunikatow
              tytul={T.raportBledy}
              pozycje={wynik.errors}
              testid="mvd-arch-bledy"
              wariant="err"
            />
            <ListaKomunikatow
              tytul={T.raportBezKatalogu}
              pozycje={wynik.elements_without_catalog ?? []}
              testid="mvd-arch-bez-katalogu"
              wariant="warn"
            />
            <div className="mvd-arch-akcje">
              {wynik.project_id ? (
                <button
                  type="button"
                  className="mvd-btn mvd-btn-primary"
                  onClick={() => void otworzOdtworzony()}
                  data-testid="mvd-arch-otworz"
                >
                  {T.raportOtworz}
                </button>
              ) : null}
              <button
                type="button"
                className="mvd-btn"
                onClick={wyczysc}
                data-testid="mvd-arch-ponow"
              >
                {T.raportPonow}
              </button>
            </div>
            {wynik.project_id ? (
              <p className="mvd-arch-nastepny">{T.raportNastepnyKrok}</p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
