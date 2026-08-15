/**
 * HubDokumentacji — ekran prowadzący przestrzeni „Dokumentacja" (karta F-E8.1,
 * FLOW etap E8; runda R2 recenzji inżyniera 2026-07-21 — uproszczenie ~40%,
 * „minimum informacji – maksimum decyzji").
 *
 * Cały ekran podporządkowany TRZEM pytaniom inżyniera po obliczeniach:
 *  1. OBLICZENIA — czy zakończyły się poprawnie? (zwięzły pasek statusu),
 *  2. DOKUMENTY — co mogę wygenerować? (sekcja główna, karty lean),
 *  3. CO DALEJ — jaki jest następny krok? (pasek procesu).
 *
 * Usunięto (recenzja R2): panel statystyk modelu i rozwlekły 4-krokowy tor
 * pracy — dane o niskiej wartości decyzyjnej na tym etapie. ZERO fizyki, ZERO
 * pobrań — interpretacja stanu store'ów i nawigacja do realnych dostawców.
 * Stylowanie wyłącznie tokenami --mvd-* (oba motywy).
 */

import './dokumentacja.css';

import { useAppStateStore } from '../../../ui/app-state';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { ANALYSIS_TYPE_LABELS } from '../../../ui/study-cases/types';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useShellStore } from '../../shell/useShellStore';
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
import { useAkcjaDodajZrodloOze } from '../../wyniki/wzorzec';
import { MapaProcesu } from '../../proces';
import { useDokumentyMagazynu, type RekordDokumentu } from './api';
import {
  GRUPY_DOKUMENTOW,
  dokumentDostepny,
  formatujDate,
  formatujRozmiar,
  ostatniZakonczonyPrzebieg,
  rekordyDlaKarty,
  zawartoscZPrzebiegow,
  type CelDokumentu,
  type IkonaDokumentu,
  type KartaDokumentu,
  type OknoDokumentacji,
} from './model';
import { DOK_STRINGS as T } from './strings';

/** Data przebiegu w czytelnym PL formacie (bez sekund; ISO → „RRRR-MM-DD GG:MM"). */
function dataPrzebiegu(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 16).replace('T', ' ');
}

/** Ikona dokumentu — inline SVG (deterministyczne, currentColor, bez zależności). */
function IkonaKarty({ rodzaj }: { rodzaj: IkonaDokumentu }) {
  const wspolne = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (rodzaj === 'dowod') {
    return (
      <svg {...wspolne}>
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (rodzaj === 'archiwum') {
    return (
      <svg {...wspolne}>
        <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
        <path d="M3 7l9 4 9-4M12 11v10" />
      </svg>
    );
  }
  return (
    <svg {...wspolne}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6M9 8h2" />
    </svg>
  );
}

/** Najnowsza data wygenerowania z rekordów magazynu (ISO malejąco). */
function najnowszaData(rekordy: readonly RekordDokumentu[]): string {
  return rekordy.reduce((max, r) => (r.created_at > max ? r.created_at : max), '');
}

function Karta({
  karta,
  dostepny,
  zawartosc,
  rekordy,
  onOtworz,
}: {
  karta: KartaDokumentu;
  dostepny: boolean;
  zawartosc: readonly string[];
  rekordy: readonly RekordDokumentu[];
  onOtworz: () => void;
}) {
  // Cykl życia (F-E8.3): rekord w magazynie → „Wygenerowany [data]" + akcje
  // Pobierz/Podgląd (realne URL-e); brak rekordu → dzisiejszy stan (zero regresu).
  const maRekord = rekordy.length > 0;
  const statusEtyk = maRekord
    ? `${T.statusWygenerowany} ${formatujDate(najnowszaData(rekordy))}`
    : dostepny
      ? T.statusDoWygenerowania
      : karta.wymaga === 'projekt'
        ? T.statusWymagaProjektu
        : T.statusWymagaPrzebiegu;
  return (
    <article
      className="mvd-dok-karta"
      data-testid={karta.testid}
      data-akcent={karta.akcent}
      data-wyroznione={karta.wyroznione ? 'true' : 'false'}
    >
      <div className="mvd-dok-karta-glowa">
        <span className="mvd-dok-karta-ikona" data-akcent={karta.akcent} aria-hidden="true">
          <IkonaKarty rodzaj={karta.ikona} />
        </span>
        <div className="mvd-dok-karta-tytul">
          {karta.wyroznione && <span className="mvd-dok-karta-formalny">{T.dowodFormalny}</span>}
          <h5>{karta.tytul}</h5>
        </div>
        <span
          className={
            maRekord || dostepny
              ? 'mvd-dok-chip mvd-dok-chip--ok'
              : 'mvd-dok-chip mvd-dok-chip--brak'
          }
          data-testid={`${karta.testid}-status`}
        >
          {statusEtyk}
        </span>
      </div>

      <p className="mvd-dok-karta-opis">{karta.opis}</p>

      {/* Zawartość (recenzja R2 pkt 4 — ważniejsza niż formaty): główne chipy. */}
      {karta.pokazZawartosc && zawartosc.length > 0 && (
        <div className="mvd-dok-karta-zawartosc" data-testid={`${karta.testid}-zawartosc`}>
          <span className="mvd-dok-meta-k">{T.zawartoscLabel.toUpperCase()}</span>
          <span className="mvd-dok-sekcje">
            {zawartosc.map((s) => (
              <span key={s} className="mvd-dok-tag">{s}</span>
            ))}
          </span>
        </div>
      )}

      {/* Magazyn dokumentów (F-E8.3): realne rekordy z akcjami Pobierz/Podgląd. */}
      {maRekord && (
        <div className="mvd-dok-karta-magazyn" data-testid={`${karta.testid}-magazyn`}>
          <span className="mvd-dok-meta-k">{T.magazynLabel.toUpperCase()}</span>
          <ul className="mvd-dok-rekordy">
            {rekordy.map((r) => (
              <li key={r.id} className="mvd-dok-rekord" data-testid={`${karta.testid}-rekord`}>
                <span className="mvd-dok-rekord-meta mvd-num">
                  <b>{r.doc_format}</b> · {formatujRozmiar(r.size_bytes)}
                  {r.page_count !== undefined ? ` · ${r.page_count} ${T.stronyLabel}` : ''}
                </span>
                <span className="mvd-dok-rekord-akcje">
                  <a
                    className="mvd-dok-rekord-akcja"
                    href={r.content_url}
                    download={r.filename}
                    data-testid={`${karta.testid}-pobierz`}
                  >
                    {T.akcjaPobierz}
                  </a>
                  <a
                    className="mvd-dok-rekord-akcja mvd-dok-rekord-akcja--podglad"
                    href={`${r.content_url}?inline=true`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`${karta.testid}-podglad`}
                  >
                    {T.akcjaPodglad}
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mvd-dok-karta-stopka">
        <button type="button" className="mvd-dok-otworz" data-akcent={karta.akcent} onClick={onOtworz}>
          {karta.akcjaEtykieta}
        </button>
        {/* Formaty drugorzędne (recenzja R2 pkt 4) — drobnym drukiem obok akcji. */}
        <span className="mvd-dok-formaty-mini">{karta.formaty.join(' · ')}</span>
      </div>
    </article>
  );
}

export interface HubDokumentacjiProps {
  /**
   * Otwiera OKNO WŁASNE przestrzeni (KD-4, L-15) — dziś generator raportu ui2.
   * Brak wołającego (montaż bez powłoki, testy jednostkowe) = karta pozostaje
   * bez efektu zamiast prowadzić w martwe miejsce.
   */
  readonly onOtworzOkno?: (okno: OknoDokumentacji) => void;
}

export function HubDokumentacji({ onOtworzOkno }: HubDokumentacjiProps = {}) {
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const setZadanieArchiwumProjektu = useShellStore((s) => s.setZadanieArchiwumProjektu);
  // Reużycie dostawcy kreatora OZE (ta sama akcja, co stany zerowe strumienia OZE).
  const akcjaKreatoraOze = useAkcjaDodajZrodloOze();
  const magazyn = useDokumentyMagazynu(activeProjectId);

  const maProjekt = Boolean(activeProjectName);
  const ostatni = ostatniZakonczonyPrzebieg(przebiegi);
  const zawartosc = zawartoscZPrzebiegow(przebiegi);

  const rodzajOstatniego = ostatni
    ? ANALYSIS_TYPE_LABELS[ostatni.analysis_type as keyof typeof ANALYSIS_TYPE_LABELS] ?? ostatni.analysis_type
    : null;
  const wersjaUkladu = snapshot ? `rew. ${snapshot.header.revision} · ${snapshot.header.hash_sha256.slice(0, 8)}` : null;

  const otworzCel = (cel: CelDokumentu) => {
    if (cel.rodzaj === 'okno') {
      onOtworzOkno?.(cel.okno);
    } else if (cel.rodzaj === 'ekran') {
      openRouteSurface(cel.ekran);
    } else if (cel.rodzaj === 'wyniki-zakladka') {
      // Deep-link do istniejącego generatora w przestrzeni „Wyniki" (studium OZE).
      setWynikiTab(cel.zakladka);
      setActiveSpace('wyniki');
    } else if (cel.rodzaj === 'okno-projektu') {
      // Deep-link do okna archiwum: sama przestrzeń „Projekt" pokazuje pulpit
      // BEZ akcji archiwum, więc karta niesie jednorazowe żądanie okna.
      setZadanieArchiwumProjektu(true);
      setActiveSpace('projekt');
    } else if (cel.rodzaj === 'kreator-oze') {
      // Reużycie istniejącej akcji stanu zerowego: otwiera formularz źródła
      // przekształtnikowego NA kanwie schematu (przejście robi sama akcja).
      akcjaKreatoraOze.onKlik();
    } else {
      setActiveSpace(cel.przestrzen);
    }
  };

  return (
    <div className="mvd-dok" data-testid="mvd-dokumentacja-hub">
      <header className="mvd-dok-head">
        <h2>{T.tytul}</h2>
        <p>{T.cel}</p>
      </header>

      {/* Q1: czy obliczenia zakończyły się poprawnie? */}
      <section className="mvd-dok-status" aria-label={T.statusEyebrow} data-testid="mvd-dok-status">
        <span className="mvd-dok-lbl">{T.statusEyebrow}</span>
        {ostatni ? (
          <div className="mvd-dok-status-ok" data-testid="mvd-dok-status-ok">
            <span className="mvd-dok-status-kropka" aria-hidden="true" />
            <span className="mvd-dok-status-txt">
              <b>{T.statusZakonczone}</b>
              <span className="mvd-dok-status-meta mvd-num">
                {rodzajOstatniego} · {dataPrzebiegu(ostatni.finished_at ?? ostatni.started_at)}
                {wersjaUkladu ? ` · ${T.statusUklad} ${wersjaUkladu}` : ''}
              </span>
            </span>
          </div>
        ) : (
          <div className="mvd-dok-status-brak" data-testid="mvd-dok-status-brak">
            <span className="mvd-dok-status-txt">{T.statusBrak}</span>
            <button type="button" className="mvd-dok-akcja" onClick={() => setActiveSpace('obliczenia')}>
              {T.statusAkcja}
            </button>
          </div>
        )}
      </section>

      {/* Q2: jakie dokumenty mogę wygenerować? (sekcja główna) */}
      <section className="mvd-dok-sekcja" aria-label={T.dokumentyEyebrow}>
        <span className="mvd-dok-lbl">{T.dokumentyEyebrow}</span>
        {GRUPY_DOKUMENTOW.map((grupa) => (
          <div key={grupa.tytul} className="mvd-dok-grupa">
            <h4>{grupa.tytul}</h4>
            <div className="mvd-dok-karty">
              {grupa.karty.map((karta) => (
                <Karta
                  key={karta.id}
                  karta={karta}
                  dostepny={dokumentDostepny(karta.wymaga, maProjekt, przebiegi)}
                  zawartosc={zawartosc}
                  rekordy={rekordyDlaKarty(karta.id, magazyn.rekordy)}
                  onOtworz={() => otworzCel(karta.cel)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/*
        Q3: co dalej? Pasek procesu konsumuje KANONICZNY rejestr etapów
        (`ui2/proces/etapy.ts`). Do karty PULPIT-NBA hub trzymał tu WŁASNĄ,
        pięcioelementową listę kroków — drugi rejestr etapów o innej granulacji
        i innej kolejności niż oś projektanta E1–E8. Sygnały, które tamte kroki
        malowały (czy jest projekt, czy jest zakończone obliczenie), są w tym
        ekranie pokazane wprost w sekcji stanu obliczeń wyżej, więc konsolidacja
        nie zabrała żadnej informacji — zabrała rozjazd.
      */}
      <div className="mvd-dok-proces" data-testid="mvd-dok-proces">
        {/*
          Nawigacja mapy idzie PEŁNYM przejściem powłoki (`przejdzDoPrzestrzeni`,
          kanon D1) — nie samym `setActiveSpace`. Hub jest adresem `#report`,
          więc trasa nadrzędna przykryłaby wybraną przestrzeń i klik etapu byłby
          martwy; most tras czyści trasę należącą do innej przestrzeni.
        */}
        <MapaProcesu etapBiezacy="E8" onWybierzEtap={przejdzDoPrzestrzeni} />
      </div>
    </div>
  );
}
