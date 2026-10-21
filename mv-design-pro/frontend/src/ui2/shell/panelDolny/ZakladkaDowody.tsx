/*
 * Zakładka „Dowody" panelu dolnego (karta UI-02 PANEL-DOLNY; kontrakt UI-02 §2 i UI-17:
 * przycisk dowodu WHITE BOX bez opuszczania schematu).
 *
 * Wiersz = zakończony bieg aktywnego zakresu (rodzaj analizy, czas). Dokumenty, które
 * dla danego biegu ISTNIEJĄ, wskazuje wyłącznie serwer — zero wymyślonych pozycji:
 *  - „Otwórz dowód" → przestrzeń „Wyniki", zakładka „Dowód obliczeń" TEGO biegu
 *    (`onOtworzDowodBiegu`, deep-link `setWynikiTab('dowod', runId)`);
 *  - „Pobierz pakiet" → brama `…/pakiet-dowodowy/dostepnosc` (rodzaj pakietu albo
 *    powód braku po polsku), pobranie `…/pakiet-dowodowy` dla domyślnego punktu
 *    (pierwszego z listy serwera — ten sam wybór co okno dowodu);
 *  - eksport wywodu PDF / LaTeX / JSON → brama `…/export/proof/dostepnosc`
 *    (każdy format z osobną przyczyną braku; liczona tą samą funkcją co eksport).
 * Polecenie niedostępne jest nieaktywne, a jego przyczyna stoi w wierszu.
 */
import { useEffect, useState } from 'react';

import {
  exportProofPack,
  PROOF_FORMAT_LABELS_PL,
  type ProofExportFormat,
} from '../../../ui/results/reportExportApi';
import {
  formatWStanie,
  useDostepnoscEksportuWywodu,
} from '../../../ui/results/useDostepnoscEksportuWywodu';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { etykietaAnalizy, formatCzas } from '../../spaces/obliczenia/przebiegi/strings';
import {
  pobierzDostepnoscPakietu,
  pobierzPakiet,
  zapiszPakiet,
  type DostepnoscPakietu,
} from '../../wyniki/dowod/pakietApi';
import type { KontekstPaneluDolnego } from './rejestrZakladek';
import { useBiegiZakonczone } from './wynikiPanelu';

/** Kolejność poleceń eksportu w wierszu (stała). */
export const FORMATY_WYWODU: readonly ProofExportFormat[] = ['pdf', 'latex', 'json'];

const ETYKIETA_FORMATU: Readonly<Record<ProofExportFormat, string>> = {
  pdf: 'PDF',
  latex: 'LaTeX',
  json: 'JSON',
};

type StanPakietu =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'gotowe'; readonly dane: DostepnoscPakietu }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

type StanPolecenia =
  | { readonly rodzaj: 'bezczynny' }
  | { readonly rodzaj: 'pracuje'; readonly klucz: string }
  | { readonly rodzaj: 'gotowe'; readonly komunikat: string }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

function usePakietBiegu(runId: string): StanPakietu {
  const [stan, setStan] = useState<StanPakietu>({ rodzaj: 'ladowanie' });
  useEffect(() => {
    const kontroler = new AbortController();
    setStan({ rodzaj: 'ladowanie' });
    pobierzDostepnoscPakietu(runId, kontroler.signal)
      .then((dane) => {
        if (!kontroler.signal.aborted) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((blad: unknown) => {
        if (kontroler.signal.aborted) return;
        setStan({
          rodzaj: 'blad',
          komunikat: blad instanceof Error ? blad.message : 'Nie udało się sprawdzić pakietu.',
        });
      });
    return () => kontroler.abort();
  }, [runId]);
  return stan;
}

/** Licznik zakładki: liczba zakończonych biegów (wierszy listy dowodów). */
export function LicznikDowodow() {
  const biegi = useBiegiZakonczone();
  if (biegi.length === 0) return null;
  return (
    <span className="mvd-bottom-licznik mvd-num" data-testid="mvd-bottom-licznik-dowody">
      {biegi.length}
    </span>
  );
}

function WierszDowodu({
  run,
  onOtworzDowodBiegu,
}: {
  run: ExecutionRun;
  onOtworzDowodBiegu?: (runId: string) => void;
}) {
  const pakiet = usePakietBiegu(run.id);
  const eksport = useDostepnoscEksportuWywodu(run.id);
  const [polecenie, setPolecenie] = useState<StanPolecenia>({ rodzaj: 'bezczynny' });
  const pracuje = polecenie.rodzaj === 'pracuje';

  const pobierzPakietBiegu = async (dane: DostepnoscPakietu) => {
    setPolecenie({ rodzaj: 'pracuje', klucz: 'pakiet' });
    try {
      const plik = await pobierzPakiet(run.id, dane.punkty[0]?.target_id ?? null);
      zapiszPakiet(plik);
      setPolecenie({ rodzaj: 'gotowe', komunikat: `Pobrano pakiet: ${plik.nazwaPliku}` });
    } catch (blad) {
      setPolecenie({
        rodzaj: 'blad',
        komunikat: `Nie udało się pobrać pakietu: ${blad instanceof Error ? blad.message : 'błąd serwera'}`,
      });
    }
  };

  const eksportuj = async (format: ProofExportFormat) => {
    setPolecenie({ rodzaj: 'pracuje', klucz: format });
    const wynik = await exportProofPack(run.id, format);
    setPolecenie(
      wynik.ok
        ? { rodzaj: 'gotowe', komunikat: `Pobrano: ${PROOF_FORMAT_LABELS_PL[format]} (${wynik.filename})` }
        : { rodzaj: 'blad', komunikat: wynik.error },
    );
  };

  const powodyEksportu = [
    ...new Set(
      FORMATY_WYWODU.map((f) => formatWStanie(eksport, f))
        .filter((f) => !f.dostepny && f.powod_pl)
        .map((f) => f.powod_pl as string),
    ),
  ];
  const pakietDostepny = pakiet.rodzaj === 'gotowe' && pakiet.dane.dostepny;
  const opisPakietu =
    pakiet.rodzaj === 'ladowanie'
      ? 'Sprawdzanie pakietu dowodowego…'
      : pakiet.rodzaj === 'blad'
        ? `Nie udało się sprawdzić pakietu dowodowego: ${pakiet.komunikat}`
        : pakiet.dane.dostepny
          ? `Pakiet dowodowy: ${pakiet.dane.rodzaj_pl ?? 'dostępny'}${
              pakiet.dane.punkty.length > 1
                ? ` — dla: ${pakiet.dane.punkty[0]?.nazwa} (wybór innego miejsca w oknie dowodu)`
                : ''
            }`
          : `Pakiet dowodowy niedostępny: ${pakiet.dane.powod_pl ?? 'serwer nie podał powodu.'}`;

  return (
    <li className="mvd-dolny-dowod" data-testid={`mvd-dowod-${run.id}`}>
      <div className="mvd-dolny-dowod-glowa">
        <span className="mvd-dolny-opis">{etykietaAnalizy(run.analysis_type)}</span>
        <span className="mvd-num mvd-dolny-czas">{formatCzas(run.finished_at ?? run.started_at)}</span>
        <span className="mvd-grow" />
        <button
          type="button"
          className="mvd-dolny-akcja"
          disabled={!onOtworzDowodBiegu}
          title={onOtworzDowodBiegu ? 'Otwórz dowód obliczeń tego przebiegu' : 'Okno dowodu niedostępne w tym widoku'}
          onClick={() => onOtworzDowodBiegu?.(run.id)}
          data-testid={`mvd-dowod-otworz-${run.id}`}
        >
          Otwórz dowód
        </button>
        <button
          type="button"
          className="mvd-dolny-akcja"
          disabled={!pakietDostepny || pracuje}
          title={opisPakietu}
          onClick={() => {
            if (pakiet.rodzaj === 'gotowe' && pakiet.dane.dostepny) void pobierzPakietBiegu(pakiet.dane);
          }}
          data-testid={`mvd-dowod-pakiet-${run.id}`}
        >
          {polecenie.rodzaj === 'pracuje' && polecenie.klucz === 'pakiet' ? 'Pobieranie…' : 'Pobierz pakiet'}
        </button>
        {FORMATY_WYWODU.map((format) => {
          const opis = formatWStanie(eksport, format);
          return (
            <button
              key={format}
              type="button"
              className="mvd-dolny-akcja"
              disabled={!opis.dostepny || pracuje}
              title={opis.dostepny ? `Pobierz wywód: ${PROOF_FORMAT_LABELS_PL[format]}` : (opis.powod_pl ?? '')}
              onClick={() => void eksportuj(format)}
              data-testid={`mvd-dowod-eksport-${format}-${run.id}`}
            >
              {polecenie.rodzaj === 'pracuje' && polecenie.klucz === format ? 'Pobieranie…' : ETYKIETA_FORMATU[format]}
            </button>
          );
        })}
      </div>
      <p
        className={pakiet.rodzaj === 'gotowe' && !pakiet.dane.dostepny ? 'mvd-dolny-dowod-uwaga' : 'mvd-dolny-dowod-opis'}
        data-testid={`mvd-dowod-pakiet-opis-${run.id}`}
      >
        {opisPakietu}
      </p>
      {powodyEksportu.length > 0 && eksport.rodzaj !== 'ladowanie' && (
        <p className="mvd-dolny-dowod-uwaga" data-testid={`mvd-dowod-eksport-powod-${run.id}`}>
          {`Eksport wywodu niedostępny: ${powodyEksportu.join(' ')}`}
        </p>
      )}
      {polecenie.rodzaj === 'gotowe' && (
        <p className="mvd-dolny-dowod-opis" data-testid={`mvd-dowod-wynik-${run.id}`}>
          {polecenie.komunikat}
        </p>
      )}
      {polecenie.rodzaj === 'blad' && (
        <p className="mvd-dolny-dowod-uwaga" role="alert" data-testid={`mvd-dowod-blad-${run.id}`}>
          {polecenie.komunikat}
        </p>
      )}
    </li>
  );
}

export function ZakladkaDowody({ onOtworzDowodBiegu }: KontekstPaneluDolnego) {
  const biegi = useBiegiZakonczone();
  if (biegi.length === 0) {
    return (
      <p className="mvd-dolny-stan" data-testid="mvd-dowody-brak">
        Brak dowodów — aktywny zakres nie ma zakończonego przebiegu. Uruchom obliczenie przyciskiem „Oblicz".
      </p>
    );
  }
  return (
    <ul className="mvd-dolny-lista" data-testid="mvd-dowody">
      {biegi.map((run) => (
        <WierszDowodu key={run.id} run={run} onOtworzDowodBiegu={onOtworzDowodBiegu} />
      ))}
    </ul>
  );
}
