/**
 * HubDokumentacji — ekran prowadzący przestrzeni „Dokumentacja" (karta F-E8.1,
 * FLOW etap E8). Zaprojektowany OD ETAPU FLOW, nie od starego generatora
 * raportu: domknięcie łańcucha projektowego dokumentem odbiorowym.
 *
 * Trzy sekcje = trzy pytania inżyniera (kontrakt ekranu prowadzącego, FLOW §0.3):
 *  1. TOR PRACY — „z czego powstaje dokument i czego brakuje": łańcuch
 *     Projekt → Wariant → Wersja układu → Zakończone obliczenie, z akcjami
 *     naprawczymi prowadzącymi we właściwe miejsce,
 *  2. DOKUMENTY — „co mogę wytworzyć, z czego to powstaje i czego wymaga":
 *     karty w grupach, każda z REALNYM dostawcą backendu (zero phantomów),
 *  3. NASTĘPNY KROK — „co zrobić po wytworzeniu dokumentów" (wniosek OSD).
 *
 * ZERO fizyki, ZERO pobrań — wyłącznie interpretacja stanu store'ów i nawigacja
 * do realnych dostawców (openRouteSurface / setActiveSpace). Stylowanie wyłącznie
 * tokenami --mvd-* (oba motywy z automatu).
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
  type CelDokumentu,
  type KartaDokumentu,
} from './model';
import { DOK_STRINGS as T } from './strings';

/** Data przebiegu w czytelnym PL formacie (bez sekund; ISO → „RRRR-MM-DD GG:MM"). */
function dataPrzebiegu(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 16).replace('T', ' ');
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

function Karta({
  karta,
  chip,
  onOtworz,
}: {
  karta: KartaDokumentu;
  chip: { etykieta: string; ok: boolean };
  onOtworz: () => void;
}) {
  return (
    <article className="mvd-dok-karta" data-testid={karta.testid}>
      <div className="mvd-dok-karta-glowa">
        <h5>{karta.tytul}</h5>
        <span className={chip.ok ? 'mvd-dok-chip mvd-dok-chip--ok' : 'mvd-dok-chip mvd-dok-chip--brak'}>
          {chip.etykieta}
        </span>
      </div>
      <p className="mvd-dok-karta-opis">{karta.opis}</p>
      <p className="mvd-dok-karta-zrodlo">
        <b>{T.zrodloDanych.toUpperCase()}: </b>
        {karta.zrodlo}
      </p>
      <div className="mvd-dok-karta-stopka">
        <button type="button" className="mvd-dok-otworz" onClick={onOtworz}>
          {T.otworz}
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

  const chipKarty = (karta: KartaDokumentu): { etykieta: string; ok: boolean } => {
    if (dokumentDostepny(karta.wymaga, maProjekt, przebiegi)) {
      return { etykieta: T.dostepny, ok: true };
    }
    return {
      etykieta: karta.wymaga === 'projekt' ? T.wymagaProjektu : T.wymagaPrzebiegu,
      ok: false,
    };
  };

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
                  chip={chipKarty(karta)}
                  onOtworz={() => otworzCel(karta.cel)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mvd-dok-sekcja" aria-label={T.nastepnyTytul}>
        <span className="mvd-dok-lbl">{T.nastepnyEyebrow}</span>
        <h3>{T.nastepnyTytul}</h3>
        <p className="mvd-dok-nota">{T.nastepnyNota}</p>
      </section>
    </div>
  );
}
