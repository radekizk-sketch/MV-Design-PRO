/*
 * Okno „Import sieci z arkusza (XLSX)" — przestrzeń „Projekt", etap E1
 * (zlecenie i dane wejściowe wg `docs/uiux/FLOW_PROJEKTANTA_2026-07.md`).
 * Projektant, który dostał od operatora arkusz z siecią, zaczyna pracę TU:
 * to trzecia droga zdobycia projektu obok „Nowy projekt" i „Odtwórz z archiwum".
 *
 * DEFEKT ZASTANY (karta XLSX-IMPORT): końcówka `POST /api/import/xlsx` była
 * wpięta w API i nie miała w całym froncie ANI JEDNEGO odwołania.
 *
 * Kontrakt ekranu prowadzącego: cel jednym zdaniem · tor pracy (wybierz plik →
 * sprawdź zawartość → importuj) · uczciwe stany zerowe · jawny następny krok.
 * ZERO fizyki i ZERO parsowania modelu w przeglądarce — wszystkie liczby i
 * wszystkie zastrzeżenia do wierszy pochodzą z odpowiedzi backendu.
 */

import { useCallback, useRef, useState, type ChangeEvent } from 'react';

import './arkusz.css';

import { useAppStateStore } from '../../../../ui/app-state';
import { getActiveStudyCase } from '../../../../ui/study-cases/api';
import {
  importujArkusz,
  OdrzucenieArkusza,
  podejrzyjArkusz,
  type PodgladArkusza,
  type PodsumowanieArkusza,
  type WynikImportuArkusza,
  type ZastrzezenieArkusza,
} from './api';
import { ARKUSZ_STRINGS as T, jestPlikiemArkusza, nazwaZPliku } from './strings';

/** Wiersz klucz–wartość. */
function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <div className="mvd-ark-kv">
      <span className="mvd-ark-kv-k">{etykieta}</span>
      <span className="mvd-ark-kv-v mvd-num">{wartosc}</span>
    </div>
  );
}

/** Liczby „co wejdzie do modelu" — wprost z odpowiedzi backendu. */
function Podsumowanie({ dane, testid }: { dane: PodsumowanieArkusza; testid: string }) {
  return (
    <div className="mvd-ark-kv-siatka" data-testid={testid}>
      <Wiersz etykieta={T.podgladSzyny} wartosc={String(dane.szyny)} />
      <Wiersz etykieta={T.podgladOdcinki} wartosc={String(dane.odcinki)} />
      <Wiersz etykieta={T.podgladTransformatory} wartosc={String(dane.transformatory)} />
      <Wiersz etykieta={T.podgladZrodla} wartosc={String(dane.zrodla)} />
      <Wiersz etykieta={T.podgladOdbiory} wartosc={String(dane.odbiory)} />
    </div>
  );
}

/** Adres zastrzeżenia w arkuszu — projektant ma wiedzieć, gdzie poprawić. */
function adresZastrzezenia(pozycja: ZastrzezenieArkusza): string {
  const czesci = [`${T.zastrzezenieArkusz} „${pozycja.arkusz}"`];
  czesci.push(
    pozycja.wiersz === null
      ? T.zastrzezenieCalyArkusz
      : `${T.zastrzezenieWiersz} ${pozycja.wiersz}`,
  );
  if (pozycja.kolumna !== null) {
    czesci.push(`${T.zastrzezenieKolumna} „${pozycja.kolumna}"`);
  }
  return czesci.join(' · ');
}

/** Lista zastrzeżeń per wiersz (adres + zdanie backendu). */
function ListaZastrzezen({ pozycje }: { pozycje: readonly ZastrzezenieArkusza[] }) {
  if (pozycje.length === 0) return null;
  return (
    <div className="mvd-ark-komunikaty" data-wariant="err" data-testid="mvd-ark-zastrzezenia">
      <span className="mvd-ark-meta-k">{T.zastrzezeniaTytul}</span>
      <ul>
        {pozycje.map((pozycja, indeks) => (
          <li key={`${pozycja.arkusz}-${pozycja.wiersz ?? 'x'}-${pozycja.kolumna ?? 'x'}-${indeks}`}>
            <span className="mvd-ark-adres">{adresZastrzezenia(pozycja)}</span>
            <span className="mvd-ark-tresc">{pozycja.komunikat}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lista komunikatów tekstowych backendu (uwagi / odcinki bez katalogu). */
function ListaKomunikatow({
  tytul,
  pozycje,
  testid,
}: {
  tytul: string;
  pozycje: readonly string[];
  testid: string;
}) {
  if (pozycje.length === 0) return null;
  return (
    <div className="mvd-ark-komunikaty" data-wariant="warn" data-testid={testid}>
      <span className="mvd-ark-meta-k">{tytul}</span>
      <ul>
        {pozycje.map((tekst) => (
          <li key={tekst}>
            <span className="mvd-ark-tresc">{tekst}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function werdyktImportu(wynik: WynikImportuArkusza): {
  tekst: string;
  wariant: 'ok' | 'warn' | 'err';
} {
  if (wynik.status === 'ZAIMPORTOWANO') return { tekst: T.raportZaimportowano, wariant: 'ok' };
  if (wynik.status === 'WYMAGA_MAPOWANIA_KATALOGU') {
    return { tekst: T.raportBramkaKatalogu, wariant: 'warn' };
  }
  return { tekst: T.raportOdrzucono, wariant: 'err' };
}

export interface EkranImportuArkuszaProps {
  /** Powrót do przestrzeni „Projekt" (zamknięcie okna). */
  readonly onZamknij: () => void;
}

export function EkranImportuArkusza({ onZamknij }: EkranImportuArkuszaProps) {
  const setActiveProject = useAppStateStore((s) => s.setActiveProject);
  const setActiveCase = useAppStateStore((s) => s.setActiveCase);

  const [plik, setPlik] = useState<File | null>(null);
  const [nazwa, setNazwa] = useState('');
  const [podglad, setPodglad] = useState<PodgladArkusza | null>(null);
  const [wynik, setWynik] = useState<WynikImportuArkusza | null>(null);
  const [zastrzezenia, setZastrzezenia] = useState<readonly ZastrzezenieArkusza[]>([]);
  const [podgladWToku, setPodgladWToku] = useState(false);
  const [importWToku, setImportWToku] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const polePliku = useRef<HTMLInputElement>(null);

  const wybierzPlik = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const wybrany = event.target.files?.[0] ?? null;
    setPodglad(null);
    setWynik(null);
    setZastrzezenia([]);
    setBlad(null);
    if (wybrany && !jestPlikiemArkusza(wybrany.name)) {
      setPlik(null);
      setBlad(T.zlyFormat);
      return;
    }
    setPlik(wybrany);
    setNazwa(wybrany ? nazwaZPliku(wybrany.name) : '');
  }, []);

  const sprawdzZawartosc = useCallback(async () => {
    if (!plik) return;
    setPodgladWToku(true);
    setBlad(null);
    setZastrzezenia([]);
    try {
      const odpowiedz = await podejrzyjArkusz(plik);
      setPodglad(odpowiedz);
      setZastrzezenia(odpowiedz.bledy);
    } catch (err: unknown) {
      setBlad(err instanceof Error ? err.message : T.bladOgolny);
    } finally {
      setPodgladWToku(false);
    }
  }, [plik]);

  const importuj = useCallback(async () => {
    if (!plik) return;
    setImportWToku(true);
    setBlad(null);
    setZastrzezenia([]);
    try {
      setWynik(await importujArkusz(plik, nazwa.trim() || undefined));
    } catch (err: unknown) {
      if (err instanceof OdrzucenieArkusza) {
        setZastrzezenia(err.zastrzezenia);
        setBlad(T.raportOdrzucono);
      } else {
        setBlad(err instanceof Error ? err.message : T.bladOgolny);
      }
    } finally {
      setImportWToku(false);
    }
  }, [nazwa, plik]);

  const wyczysc = useCallback(() => {
    setPlik(null);
    setNazwa('');
    setPodglad(null);
    setWynik(null);
    setZastrzezenia([]);
    setBlad(null);
    if (polePliku.current) polePliku.current.value = '';
  }, []);

  const otworzZaimportowany = useCallback(async () => {
    if (!wynik?.project_id) return;
    const id = wynik.project_id;
    setActiveProject(id, nazwa.trim() || null);
    // Ten sam tor otwarcia co ekran archiwum: bez aktywnego wariantu
    // obliczeniowego migawka modelu nie zostałaby załadowana.
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
  }, [nazwa, onZamknij, setActiveCase, setActiveProject, wynik]);

  const werdykt = wynik ? werdyktImportu(wynik) : null;

  return (
    <div className="mvd-ark" data-testid="mvd-import-arkusza">
      <header className="mvd-ark-head">
        <div>
          <h2>{T.tytul}</h2>
          <p>{T.cel}</p>
        </div>
        <button type="button" className="mvd-btn" onClick={onZamknij} data-testid="mvd-ark-powrot">
          {T.powrot}
        </button>
      </header>

      <section className="mvd-ark-sekcja" aria-label={T.formatEyebrow}>
        <span className="mvd-ark-lbl">{T.formatEyebrow}</span>
        <p className="mvd-ark-opis">{T.formatOpis}</p>
      </section>

      <section className="mvd-ark-sekcja" aria-label={T.wyborEyebrow}>
        <span className="mvd-ark-lbl">{T.wyborEyebrow}</span>

        <label className="mvd-ark-pole">
          <span className="mvd-ark-pole-etyk">{T.wybierz}</span>
          <input
            ref={polePliku}
            type="file"
            accept=".xlsx,.xlsm"
            onChange={wybierzPlik}
            data-testid="mvd-ark-plik"
          />
        </label>

        {plik == null ? (
          <p className="mvd-ark-opis" data-testid="mvd-ark-brak-pliku">
            {T.brakPliku}
          </p>
        ) : (
          <>
            <label className="mvd-ark-pole">
              <span className="mvd-ark-pole-etyk">{T.nazwaProjektu}</span>
              <input
                type="text"
                value={nazwa}
                placeholder={T.nazwaPodpowiedz}
                onChange={(e) => setNazwa(e.target.value)}
                data-testid="mvd-ark-nazwa"
              />
            </label>
            <div className="mvd-ark-akcje">
              <button
                type="button"
                className="mvd-btn"
                onClick={() => void sprawdzZawartosc()}
                disabled={podgladWToku || importWToku}
                data-testid="mvd-ark-podglad-akcja"
              >
                {podgladWToku ? T.podgladWToku : T.podgladAkcja}
              </button>
              <button
                type="button"
                className="mvd-btn mvd-btn-primary"
                onClick={() => void importuj()}
                disabled={podgladWToku || importWToku}
                data-testid="mvd-ark-import"
              >
                {importWToku ? T.importWToku : T.importAkcja}
              </button>
            </div>
          </>
        )}
      </section>

      {podglad && (
        <section className="mvd-ark-sekcja" aria-label={T.podgladTytul}>
          <span className="mvd-ark-lbl">{T.podgladTytul}</span>
          {podglad.poprawny && podglad.podsumowanie ? (
            <Podsumowanie dane={podglad.podsumowanie} testid="mvd-ark-podglad-liczby" />
          ) : (
            <p className="mvd-ark-blad" role="alert" data-testid="mvd-ark-podglad-niepoprawny">
              {T.podgladNiepoprawny}
            </p>
          )}
          <ListaKomunikatow
            tytul={T.ostrzezeniaTytul}
            pozycje={podglad.ostrzezenia}
            testid="mvd-ark-ostrzezenia"
          />
          <ListaKomunikatow
            tytul={T.bezKataloguTytul}
            pozycje={podglad.elementy_bez_katalogu}
            testid="mvd-ark-bez-katalogu"
          />
        </section>
      )}

      {blad && (
        <p className="mvd-ark-blad" role="alert" data-testid="mvd-ark-blad">
          {blad}
        </p>
      )}

      <ListaZastrzezen pozycje={zastrzezenia} />

      {wynik && werdykt && (
        <section
          className="mvd-ark-raport"
          data-wariant={werdykt.wariant}
          data-testid="mvd-ark-raport"
          aria-label={T.raportTytul}
        >
          <span className="mvd-ark-meta-k">{T.raportTytul}</span>
          <p className="mvd-ark-werdykt" role="status">
            {werdykt.tekst}
          </p>
          {wynik.podsumowanie && (
            <Podsumowanie dane={wynik.podsumowanie} testid="mvd-ark-raport-liczby" />
          )}
          {wynik.odcisk_migawki && (
            <div className="mvd-ark-kv-siatka">
              <Wiersz etykieta={T.raportMigawka} wartosc={wynik.odcisk_migawki.slice(0, 16)} />
            </div>
          )}
          <ListaKomunikatow
            tytul={T.ostrzezeniaTytul}
            pozycje={wynik.ostrzezenia}
            testid="mvd-ark-raport-ostrzezenia"
          />
          <ListaKomunikatow
            tytul={T.bezKataloguTytul}
            pozycje={wynik.elementy_bez_katalogu}
            testid="mvd-ark-raport-bez-katalogu"
          />
          <div className="mvd-ark-akcje">
            {wynik.project_id ? (
              <button
                type="button"
                className="mvd-btn mvd-btn-primary"
                onClick={() => void otworzZaimportowany()}
                data-testid="mvd-ark-otworz"
              >
                {T.raportOtworz}
              </button>
            ) : null}
            <button type="button" className="mvd-btn" onClick={wyczysc} data-testid="mvd-ark-ponow">
              {T.raportPonow}
            </button>
          </div>
          {wynik.project_id ? (
            <p className="mvd-ark-nastepny" data-testid="mvd-ark-nastepny-krok">
              {wynik.mapowanie_katalogowe_wymagane
                ? T.raportNastepnyKrokKatalog
                : T.raportNastepnyKrok}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
