/**
 * HubDokumentacji — ekran prowadzący przestrzeni „Dokumentacja" (karta F-E8.1,
 * FLOW etap E8, + runda poprawek recenzji inżyniera 2026-07-21). Zaprojektowany
 * OD ETAPU FLOW: domknięcie łańcucha projektowego dokumentem odbiorowym.
 *
 * Sekcje (kontrakt ekranu prowadzącego, FLOW §0.3):
 *  1. PASEK PROCESU — gdzie jestem w cyklu projektu (Projekt→…→Wniosek OSD),
 *  2. ANALIZOWANY MODEL — realne parametry sieci i wykonanych obliczeń
 *     (recenzja pkt 5: natychmiastowa weryfikacja, że dokument dotyczy
 *     właściwego modelu),
 *  3. TOR PRACY — czego brakuje do wytworzenia dokumentu (z akcjami),
 *  4. DOKUMENTY — karty z tożsamością wizualną per typ, formatami, zawartością
 *     z realnych przebiegów, statusem i jednoznaczną akcją,
 *  5. NASTĘPNY KROK — domknięcie łańcucha (wniosek OSD).
 *
 * ZERO fizyki, ZERO pobrań — interpretacja stanu store'ów i nawigacja do
 * realnych dostawców. Stylowanie wyłącznie tokenami --mvd-* (oba motywy).
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
  podsumowanieModelu,
  wykonaneObliczenia,
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

/** Liczba w PL (przecinek dziesiętny). */
function liczbaPl(n: number): string {
  return n.toLocaleString('pl-PL');
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
    // Tarcza z „ptaszkiem" — dowód formalny.
    return (
      <svg {...wspolne}>
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (rodzaj === 'archiwum') {
    // Karton/paczka — archiwum ZIP.
    return (
      <svg {...wspolne}>
        <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
        <path d="M3 7l9 4 9-4M12 11v10" />
      </svg>
    );
  }
  // Arkusz z liniami tekstu — raport.
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

function Krok({
  nr,
  nazwa,
  wartosc,
  brak,
  akcja,
  onAkcja,
  testid,
}: {
  nr: string;
  nazwa: string;
  wartosc: string;
  brak: boolean;
  akcja: string;
  onAkcja: () => void;
  testid: string;
}) {
  return (
    <div className="mvd-dok-krok" data-testid={testid} data-stan={brak ? 'brak' : 'ok'}>
      <div className="mvd-dok-krok-glowa">
        <span>
          <span className="mvd-dok-krok-nr">{nr} · </span>
          <span className="mvd-dok-krok-nazwa">{nazwa}</span>
        </span>
        <span className={brak ? 'mvd-dok-chip mvd-dok-chip--brak' : 'mvd-dok-chip mvd-dok-chip--ok'}>
          {brak ? T.stanBrak : T.stanOk}
        </span>
      </div>
      <span className="mvd-dok-krok-wartosc" data-brak={brak ? 'true' : 'false'}>
        {wartosc}
      </span>
      {brak && (
        <button type="button" className="mvd-dok-akcja" onClick={onAkcja}>
          {akcja}
        </button>
      )}
    </div>
  );
}

function Statystyka({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <div className="mvd-dok-stat">
      <span className="mvd-dok-stat-n mvd-num">{wartosc}</span>
      <span className="mvd-dok-stat-l">{etykieta}</span>
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

      <div className="mvd-dok-karta-meta">
        <span className="mvd-dok-meta-k">{T.formatyLabel.toUpperCase()}</span>
        <span className="mvd-dok-formaty">
          {karta.formaty.map((f) => (
            <span key={f} className="mvd-dok-format">{f}</span>
          ))}
        </span>
      </div>

      {karta.pokazZawartosc && (
        <div className="mvd-dok-karta-zawartosc" data-testid={`${karta.testid}-zawartosc`}>
          <span className="mvd-dok-meta-k">{T.zawartoscLabel.toUpperCase()}</span>
          {zawartosc.length > 0 ? (
            <span className="mvd-dok-sekcje">
              {zawartosc.map((s) => (
                <span key={s} className="mvd-dok-tag">{s}</span>
              ))}
            </span>
          ) : (
            <span className="mvd-dok-zawartosc-brak">{T.zawartoscBrak}</span>
          )}
        </div>
      )}

      <p className="mvd-dok-karta-zrodlo">
        <b>{T.zrodloDanych.toUpperCase()}: </b>
        {karta.zrodlo}
      </p>

      <div className="mvd-dok-karta-stopka">
        <button type="button" className="mvd-dok-otworz" data-akcent={karta.akcent} onClick={onOtworz}>
          {karta.akcjaEtykieta}
        </button>
      </div>
    </article>
  );
}

export function HubDokumentacji() {
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);

  const maProjekt = Boolean(activeProjectName);
  const ostatni = ostatniZakonczonyPrzebieg(przebiegi);
  const etykietaOstatniego = ostatni
    ? `${ANALYSIS_TYPE_LABELS[ostatni.analysis_type as keyof typeof ANALYSIS_TYPE_LABELS] ?? ostatni.analysis_type} · ${dataPrzebiegu(ostatni.finished_at ?? ostatni.started_at)}`
    : T.brakObliczenia;

  const wersjaUkladu = snapshot
    ? `rew. ${snapshot.header.revision} · ${snapshot.header.hash_sha256.slice(0, 8)}`
    : T.brakWersji;

  const podsumowanie = podsumowanieModelu(snapshot);
  const obliczenia = wykonaneObliczenia(przebiegi);
  const zawartosc = zawartoscZPrzebiegow(przebiegi);

  // Pasek procesu — pozycja bieżąca = Dokumentacja; wcześniejsze etapy zrobione,
  // gdy ich warunki spełnione (projekt / zakończony przebieg). Uczciwe: „Eksport"
  // i „Wniosek OSD" są zawsze przyszłe (poza tą przestrzenią).
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

      {/* Pasek procesu (recenzja pkt 9) */}
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

      {/* Analizowany model (recenzja pkt 5) */}
      <section className="mvd-dok-sekcja" aria-label={T.modelTytul} data-testid="mvd-dok-model">
        <span className="mvd-dok-lbl">{T.modelEyebrow}</span>
        <h3>{T.modelTytul}</h3>
        <p className="mvd-dok-nota">{T.modelNota}</p>
        {podsumowanie ? (
          <>
            <div className="mvd-dok-staty">
              <Statystyka
                etykieta={T.modelPoziomyNapiec}
                wartosc={podsumowanie.poziomyNapiecKv.length > 0
                  ? `${podsumowanie.poziomyNapiecKv.map((v) => liczbaPl(v)).join(' / ')} kV`
                  : '—'}
              />
              <Statystyka etykieta={T.modelWezly} wartosc={liczbaPl(podsumowanie.wezly)} />
              <Statystyka etykieta={T.modelGalezie} wartosc={liczbaPl(podsumowanie.galezie)} />
              <Statystyka etykieta={T.modelTransformatory} wartosc={liczbaPl(podsumowanie.transformatory)} />
              <Statystyka etykieta={T.modelZrodla} wartosc={liczbaPl(podsumowanie.zrodla)} />
              {podsumowanie.generacja > 0 && (
                <Statystyka etykieta={T.modelGeneracja} wartosc={liczbaPl(podsumowanie.generacja)} />
              )}
              <Statystyka etykieta={T.modelOdbiory} wartosc={liczbaPl(podsumowanie.odbiory)} />
            </div>
            <div className="mvd-dok-model-obl">
              <div>
                <span className="mvd-dok-meta-k">{T.modelObliczenia.toUpperCase()}</span>
                {obliczenia.length > 0 ? (
                  <span className="mvd-dok-sekcje">
                    {obliczenia.map((o) => (
                      <span key={o} className="mvd-dok-tag">{o}</span>
                    ))}
                  </span>
                ) : (
                  <span className="mvd-dok-zawartosc-brak">{T.modelObliczeniaBrak}</span>
                )}
              </div>
              <div>
                <span className="mvd-dok-meta-k">{T.modelOstatnia.toUpperCase()}</span>
                <span className="mvd-dok-model-data mvd-num">
                  {ostatni ? dataPrzebiegu(ostatni.finished_at ?? ostatni.started_at) : T.modelOstatniaBrak}
                </span>
              </div>
            </div>
          </>
        ) : (
          <p className="mvd-dok-model-brak">{T.modelBrak}</p>
        )}
      </section>

      {/* Tor pracy (gotowość) */}
      <section className="mvd-dok-sekcja" aria-label={T.torPracyTytul}>
        <span className="mvd-dok-lbl">{T.torPracyEyebrow}</span>
        <h3>{T.torPracyTytul}</h3>
        <p className="mvd-dok-nota">{T.torPracyNota}</p>
        <div className="mvd-dok-tor">
          <Krok
            nr="1"
            nazwa={T.krokProjekt}
            wartosc={activeProjectName ?? T.brakProjektu}
            brak={!activeProjectName}
            akcja={T.akcjaProjekt}
            onAkcja={() => setActiveSpace('projekt')}
            testid="mvd-dok-krok-projekt"
          />
          <Krok
            nr="2"
            nazwa={T.krokWariant}
            wartosc={activeCaseName ?? T.brakWariantu}
            brak={!activeCaseName}
            akcja={T.akcjaWariant}
            onAkcja={() => setActiveSpace('obliczenia')}
            testid="mvd-dok-krok-wariant"
          />
          <Krok
            nr="3"
            nazwa={T.krokWersja}
            wartosc={wersjaUkladu}
            brak={!snapshot}
            akcja={T.akcjaWersja}
            onAkcja={() => setActiveSpace('model')}
            testid="mvd-dok-krok-wersja"
          />
          <Krok
            nr="4"
            nazwa={T.krokObliczenie}
            wartosc={etykietaOstatniego}
            brak={!ostatni}
            akcja={T.akcjaObliczenie}
            onAkcja={() => setActiveSpace('obliczenia')}
            testid="mvd-dok-krok-obliczenie"
          />
        </div>
      </section>

      {/* Dokumenty */}
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

      {/* Następny krok */}
      <section className="mvd-dok-sekcja" aria-label={T.nastepnyTytul}>
        <span className="mvd-dok-lbl">{T.nastepnyEyebrow}</span>
        <h3>{T.nastepnyTytul}</h3>
        <p className="mvd-dok-nota">{T.nastepnyNota}</p>
      </section>
    </div>
  );
}
