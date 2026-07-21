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
import {
  GRUPY_DOKUMENTOW,
  dokumentDostepny,
  ostatniZakonczonyPrzebieg,
  zawartoscZPrzebiegow,
  type CelDokumentu,
  type IkonaDokumentu,
  type KartaDokumentu,
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

function KrokProcesu({ etykieta, stan }: { etykieta: string; stan: 'zrobiony' | 'aktywny' | 'przyszly' }) {
  return (
    <div className="mvd-dok-proces-krok" data-stan={stan}>
      <span className="mvd-dok-proces-kropka" aria-hidden="true" />
      <span className="mvd-dok-proces-etyk">{etykieta}</span>
    </div>
  );
}

function Karta({
  karta,
  dostepny,
  zawartosc,
  onOtworz,
}: {
  karta: KartaDokumentu;
  dostepny: boolean;
  zawartosc: readonly string[];
  onOtworz: () => void;
}) {
  const statusEtyk = dostepny
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
          className={dostepny ? 'mvd-dok-chip mvd-dok-chip--ok' : 'mvd-dok-chip mvd-dok-chip--brak'}
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

export function HubDokumentacji() {
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);

  const maProjekt = Boolean(activeProjectName);
  const ostatni = ostatniZakonczonyPrzebieg(przebiegi);
  const zawartosc = zawartoscZPrzebiegow(przebiegi);

  const rodzajOstatniego = ostatni
    ? ANALYSIS_TYPE_LABELS[ostatni.analysis_type as keyof typeof ANALYSIS_TYPE_LABELS] ?? ostatni.analysis_type
    : null;
  const wersjaUkladu = snapshot ? `rew. ${snapshot.header.revision} · ${snapshot.header.hash_sha256.slice(0, 8)}` : null;

  // Q3: pasek procesu — pozycja bieżąca = Dokumentacja.
  const procesEtapy: ReadonlyArray<{ etyk: string; stan: 'zrobiony' | 'aktywny' | 'przyszly' }> = [
    { etyk: T.procesProjekt, stan: maProjekt ? 'zrobiony' : 'przyszly' },
    { etyk: T.procesObliczenia, stan: ostatni ? 'zrobiony' : 'przyszly' },
    { etyk: T.procesDokumentacja, stan: 'aktywny' },
    { etyk: T.procesEksport, stan: 'przyszly' },
    { etyk: T.procesWniosek, stan: 'przyszly' },
  ];

  const otworzCel = (cel: CelDokumentu) => {
    if (cel.rodzaj === 'ekran') {
      openRouteSurface(cel.ekran);
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
                  onOtworz={() => otworzCel(karta.cel)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Q3: co dalej? */}
      <nav className="mvd-dok-proces" aria-label={T.procesEyebrow} data-testid="mvd-dok-proces">
        <span className="mvd-dok-lbl">{T.procesEyebrow}</span>
        <div className="mvd-dok-proces-tor">
          {procesEtapy.map((e, i) => (
            <div key={e.etyk} className="mvd-dok-proces-el">
              {i > 0 && <span className="mvd-dok-proces-str" aria-hidden="true">→</span>}
              <KrokProcesu etykieta={e.etyk} stan={e.stan} />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
