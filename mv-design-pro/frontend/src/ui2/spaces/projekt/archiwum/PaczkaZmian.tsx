/*
 * Sekcja „Przekaż same zmiany" okna archiwum projektu — paczka zmian względem
 * paczki bazowej, którą odbiorca już ma (backend `api/incremental_archive.py`):
 *  - nadawca: otwarty projekt + paczka bazowa → POST /api/projects/{id}/export/incremental
 *    → plik `.mvdp-delta.zip` + metryki (części zmienione / bez zmian, rozmiary);
 *  - odbiorca: paczka bazowa + paczka zmian (+ nazwa) → POST /api/projects/import/incremental
 *    → NOWY projekt (ta sama droga zapisu co odtworzenie z pełnej paczki), raport
 *    wyniku i jawna akcja otwarcia go.
 * Błąd pliku to zdanie backendu nazywające plik („Archiwum bazowe: …" / „Paczka
 * zmian: …") i ścieżkę pola. ZERO liczenia różnic po stronie ekranu.
 */

import { useCallback, useRef, useState, type ChangeEvent } from 'react';

import {
  eksportujPaczkeZmian,
  importujPaczkeZmian,
  type MetrykiPaczki,
  type WynikImportuPaczki,
} from './api';
import { ARCHIWUM_STRINGS as T, jestPlikiemArchiwum, nazwaPlikuPaczkiZmian } from './strings';
import { RaportImportu, Wiersz, zapiszBlob } from './wspolne';

export interface PaczkaZmianProps {
  readonly activeProjectId: string | null;
  readonly activeProjectName: string | null;
  /** Otwarcie projektu odtworzonego z paczki (ten sam tor co po imporcie pełnym). */
  readonly onOtworzProjekt: (projectId: string, nazwa: string | null) => void;
}

function formatujRozmiar(bajty: number): string {
  return bajty >= 1024 ? `${(bajty / 1024).toFixed(1)} KiB` : `${bajty} B`;
}

export function PaczkaZmian({ activeProjectId, activeProjectName, onOtworzProjekt }: PaczkaZmianProps) {
  const [bazaEksportu, setBazaEksportu] = useState<File | null>(null);
  const [eksportWToku, setEksportWToku] = useState(false);
  const [metryki, setMetryki] = useState<MetrykiPaczki | null>(null);
  const [eksportBlad, setEksportBlad] = useState<string | null>(null);

  const [bazaImportu, setBazaImportu] = useState<File | null>(null);
  const [paczka, setPaczka] = useState<File | null>(null);
  const [nazwa, setNazwa] = useState('');
  const [importWToku, setImportWToku] = useState(false);
  const [wynik, setWynik] = useState<WynikImportuPaczki | null>(null);
  const [importBlad, setImportBlad] = useState<string | null>(null);
  const formularzImportu = useRef<HTMLDivElement>(null);

  const wybierz = useCallback(
    (ustaw: (plik: File | null) => void, ustawBlad: (b: string | null) => void, czysc: () => void) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        const wybrany = event.target.files?.[0] ?? null;
        czysc();
        ustawBlad(null);
        if (wybrany && !jestPlikiemArchiwum(wybrany.name)) {
          ustaw(null);
          ustawBlad(T.paczkaZlyFormat);
          return;
        }
        ustaw(wybrany);
      },
    [],
  );

  const eksportuj = useCallback(async () => {
    if (!activeProjectId || !bazaEksportu) return;
    setEksportWToku(true);
    setEksportBlad(null);
    setMetryki(null);
    try {
      const wynikEksportu = await eksportujPaczkeZmian(activeProjectId, bazaEksportu);
      zapiszBlob(wynikEksportu.blob, nazwaPlikuPaczkiZmian(activeProjectName, new Date()));
      setMetryki(wynikEksportu.metryki);
    } catch (err: unknown) {
      setEksportBlad(err instanceof Error ? err.message : T.paczkaEksportBlad);
    } finally {
      setEksportWToku(false);
    }
  }, [activeProjectId, activeProjectName, bazaEksportu]);

  const importuj = useCallback(async () => {
    if (!bazaImportu || !paczka) return;
    setImportWToku(true);
    setImportBlad(null);
    try {
      setWynik(await importujPaczkeZmian(bazaImportu, paczka, { nowaNazwa: nazwa.trim() || undefined }));
    } catch (err: unknown) {
      setImportBlad(err instanceof Error ? err.message : T.paczkaImportBlad);
    } finally {
      setImportWToku(false);
    }
  }, [bazaImportu, nazwa, paczka]);

  const wyczyscImport = useCallback(() => {
    setBazaImportu(null);
    setPaczka(null);
    setNazwa('');
    setWynik(null);
    setImportBlad(null);
    formularzImportu.current
      ?.querySelectorAll<HTMLInputElement>('input[type="file"]')
      .forEach((pole) => {
        pole.value = '';
      });
  }, []);

  return (
    <section className="mvd-arch-sekcja" aria-label={T.paczkaEyebrow}>
      <span className="mvd-arch-lbl">{T.paczkaEyebrow}</span>
      <p className="mvd-arch-opis">{T.paczkaOpis}</p>

      {/* Nadawca — paczka zmian otwartego projektu. */}
      <span className="mvd-arch-meta-k">{T.paczkaEksportTytul}</span>
      {activeProjectId == null ? (
        <p className="mvd-arch-opis" data-testid="mvd-arch-paczka-brak-projektu">
          {T.paczkaEksportBrakProjektu}
        </p>
      ) : (
        <>
          <label className="mvd-arch-pole">
            <span className="mvd-arch-pole-etyk">{T.paczkaBaza}</span>
            <input
              type="file"
              accept=".zip,.mvdp.zip"
              onChange={wybierz(setBazaEksportu, setEksportBlad, () => setMetryki(null))}
              data-testid="mvd-arch-paczka-eksport-baza"
            />
          </label>
          <div className="mvd-arch-akcje">
            <button
              type="button"
              className="mvd-btn mvd-btn-primary"
              onClick={() => void eksportuj()}
              disabled={!bazaEksportu || eksportWToku}
              data-testid="mvd-arch-paczka-eksport"
            >
              {eksportWToku ? T.paczkaEksportWToku : T.paczkaEksportAkcja}
            </button>
          </div>
          {metryki && (
            <div className="mvd-arch-kv-siatka" role="status" data-testid="mvd-arch-paczka-metryki">
              <Wiersz etykieta={T.paczkaSekcjeZmienione} wartosc={String(metryki.sekcjeZmienione)} />
              <Wiersz
                etykieta={T.paczkaSekcjeNiezmienione}
                wartosc={String(metryki.sekcjeNiezmienione)}
              />
              <Wiersz
                etykieta={T.paczkaRozmiar}
                wartosc={`${formatujRozmiar(metryki.rozmiarPaczkiB)} / ${formatujRozmiar(metryki.rozmiarPelnyB)}`}
              />
              <Wiersz etykieta={T.paczkaOszczednosc} wartosc={`${metryki.oszczednoscProcent} %`} />
            </div>
          )}
          {eksportBlad && (
            <p className="mvd-arch-blad" role="alert" data-testid="mvd-arch-paczka-eksport-blad">
              {eksportBlad}
            </p>
          )}
        </>
      )}

      {/* Odbiorca — paczka bazowa + paczka zmian → nowy projekt. */}
      <span className="mvd-arch-meta-k">{T.paczkaImportTytul}</span>
      <div className="mvd-arch-dwa-pola" ref={formularzImportu}>
        <label className="mvd-arch-pole">
          <span className="mvd-arch-pole-etyk">{T.paczkaBaza}</span>
          <input
            type="file"
            accept=".zip,.mvdp.zip"
            onChange={wybierz(setBazaImportu, setImportBlad, () => setWynik(null))}
            data-testid="mvd-arch-paczka-import-baza"
          />
        </label>
        <label className="mvd-arch-pole">
          <span className="mvd-arch-pole-etyk">{T.paczkaImportPlik}</span>
          <input
            type="file"
            accept=".zip,.mvdp-delta.zip"
            onChange={wybierz(setPaczka, setImportBlad, () => setWynik(null))}
            data-testid="mvd-arch-paczka-import-plik"
          />
        </label>
      </div>
      <label className="mvd-arch-pole">
        <span className="mvd-arch-pole-etyk">{T.paczkaImportNazwa}</span>
        <input
          type="text"
          value={nazwa}
          placeholder={T.importNazwaPodpowiedz}
          onChange={(e) => setNazwa(e.target.value)}
          data-testid="mvd-arch-paczka-import-nazwa"
        />
      </label>
      <div className="mvd-arch-akcje">
        <button
          type="button"
          className="mvd-btn mvd-btn-primary"
          onClick={() => void importuj()}
          disabled={!bazaImportu || !paczka || importWToku}
          data-testid="mvd-arch-paczka-import"
        >
          {importWToku ? T.paczkaImportWToku : T.paczkaImportAkcja}
        </button>
      </div>
      {importBlad && (
        <p className="mvd-arch-blad" role="alert" data-testid="mvd-arch-paczka-import-blad">
          {importBlad}
        </p>
      )}
      {wynik && (
        <RaportImportu
          wynik={wynik}
          prefiks="mvd-arch-paczka"
          onOtworz={() => {
            if (wynik.project_id) onOtworzProjekt(wynik.project_id, nazwa.trim() || null);
          }}
          onPonow={wyczyscImport}
        >
          <Wiersz etykieta={T.paczkaImportZastosowane} wartosc={String(wynik.sections_applied)} />
        </RaportImportu>
      )}
    </section>
  );
}
