/**
 * EkranAnalizTechnicznych — przebudowany od zera hub „Analizy techniczne"
 * (audyt właściciela 2026-07-18, `docs/uiux/AUDYT_EKRAN_ANALIZY_TECHNICZNE_2026-07.md`).
 *
 * Trzy sekcje odpowiadają na trzy pytania inżyniera:
 *  1. TOR PRACY — „na czym pracuję i czego brakuje": łańcuch Projekt → Wariant
 *     → Wersja układu → Zakończone obliczenie, z akcjami naprawczymi,
 *  2. ANALIZY — „co mogę zbadać, z czego to liczy i czego wymaga": karty
 *     w grupach dziedzinowych (parytet przejść dawnego huba E-35),
 *  3. WIDOKI KLASYCZNE — parytet pozostałych tras mostu bez promowania
 *     duplikatów zakładek warsztatu.
 *
 * ZERO fizyki, ZERO pobrań — wyłącznie interpretacja stanu store'ów
 * i nawigacja (openRouteSurface / setActiveSpace). Stylowanie wyłącznie
 * tokenami --mvd-* (oba motywy z automatu).
 */

import './analizy.css';

import { useAppStateStore } from '../../../ui/app-state';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { ANALYSIS_TYPE_LABELS } from '../../../ui/study-cases/types';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { ANALYSIS_SURFACE_SCREEN_CODE } from '../../../ui/workspace/types';
import { useShellStore } from '../../shell/useShellStore';
import {
  GRUPY_ANALIZ,
  maZakonczonyPrzebieg,
  ostatniZakonczonyPrzebieg,
  type KartaAnalizy,
  type LaczeKlasyczne,
} from './model';
import { ANALIZY_STRINGS as T } from './strings';

const LACZA_KLASYCZNE: readonly LaczeKlasyczne[] = [
  { tabId: 'compare', etykieta: T.klasycznePorownanie, testid: 'mvd-analizy-klasyczne-porownanie' },
  { tabId: 'trace', etykieta: T.klasycznySlad, testid: 'mvd-analizy-klasyczne-slad' },
  { tabId: 'ncrfg-tests', etykieta: T.klasyczneNcRfg, testid: 'mvd-analizy-klasyczne-ncrfg' },
];

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
    <div className="mvd-analizy-krok" data-testid={testid} data-stan={brak ? 'brak' : 'ok'}>
      <div className="mvd-analizy-krok-glowa">
        <span>
          <span className="mvd-analizy-krok-nr">{nr} · </span>
          <span className="mvd-analizy-krok-nazwa">{nazwa}</span>
        </span>
        <span className={brak ? 'mvd-analizy-chip mvd-analizy-chip--brak' : 'mvd-analizy-chip mvd-analizy-chip--ok'}>
          {brak ? T.stanBrak : T.stanOk}
        </span>
      </div>
      <span className="mvd-analizy-krok-wartosc" data-brak={brak ? 'true' : 'false'}>
        {wartosc}
      </span>
      {brak && (
        <button type="button" className="mvd-analizy-akcja" onClick={onAkcja}>
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
  karta: KartaAnalizy;
  chip: { etykieta: string; ok: boolean };
  onOtworz: () => void;
}) {
  return (
    <article className="mvd-analizy-karta" data-testid={karta.testid}>
      <div className="mvd-analizy-karta-glowa">
        <h5>{karta.tytul}</h5>
        <span className={chip.ok ? 'mvd-analizy-chip mvd-analizy-chip--ok' : 'mvd-analizy-chip mvd-analizy-chip--brak'}>
          {chip.etykieta}
        </span>
      </div>
      <p className="mvd-analizy-karta-opis">{karta.opis}</p>
      <p className="mvd-analizy-karta-zrodlo">
        <b>{T.zrodloDanych.toUpperCase()}: </b>
        {karta.zrodlo}
      </p>
      <div className="mvd-analizy-karta-stopka">
        <button type="button" className="mvd-analizy-otworz" onClick={onOtworz}>
          {T.otworz}
        </button>
      </div>
    </article>
  );
}

export function EkranAnalizTechnicznych() {
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);

  // Karta z realnym dostawcą w warsztacie Wyników (P-1: E-33/E-34 → zakładka
  // zwarć) nawiguje deep-linkiem zakładki (wzorzec V12K-106) zamiast otwierać
  // zastępczy kontrakt analizy na powierzchni trasowej.
  const otworzKarte = (karta: KartaAnalizy) => {
    if (karta.zakladkaWynikow) {
      setWynikiTab(karta.zakladkaWynikow);
      setActiveSpace('wyniki');
      return;
    }
    openRouteSurface(karta.ekran);
  };

  const ostatni = ostatniZakonczonyPrzebieg(przebiegi);
  const etykietaOstatniego = ostatni
    ? `${ANALYSIS_TYPE_LABELS[ostatni.analysis_type as keyof typeof ANALYSIS_TYPE_LABELS] ?? ostatni.analysis_type} · ${dataPrzebiegu(ostatni.finished_at ?? ostatni.started_at)}`
    : T.brakObliczenia;

  const wersjaUkladu = snapshot
    ? `rew. ${snapshot.header.revision} · ${snapshot.header.hash_sha256.slice(0, 8)}`
    : T.brakWersji;

  const chipKarty = (karta: KartaAnalizy): { etykieta: string; ok: boolean } => {
    if (karta.wymaga === 'model') {
      return snapshot
        ? { etykieta: T.daneDostepne, ok: true }
        : { etykieta: T.wymagaModelu, ok: false };
    }
    if (karta.wymaga === 'wbudowane') {
      // Sieci referencyjne są wbudowane w system — dostępne bez projektu i biegów.
      return { etykieta: T.daneWbudowane, ok: true };
    }
    if (maZakonczonyPrzebieg(przebiegi, karta.wymaga)) {
      return { etykieta: T.daneDostepne, ok: true };
    }
    const etykieta =
      karta.wymaga === 'rozplywowy'
        ? T.wymagaRozplywu
        : karta.wymaga === 'zwarciowy'
          ? T.wymagaZwarcia
          : karta.wymaga === 'fazowy'
            ? T.wymagaFazowego
            : T.wymagaDowolnego;
    return { etykieta, ok: false };
  };

  return (
    <div className="mvd-analizy" data-testid="mvd-analizy-techniczne">
      <header className="mvd-analizy-head">
        <h2>{T.tytul}</h2>
        <p>{T.cel}</p>
      </header>

      <section className="mvd-analizy-sekcja" aria-label={T.torPracyTytul}>
        <span className="mvd-analizy-lbl">{T.torPracyEyebrow}</span>
        <h3>{T.torPracyTytul}</h3>
        <p className="mvd-analizy-nota">{T.torPracyNota}</p>
        <div className="mvd-analizy-tor">
          <Krok
            nr="1"
            nazwa={T.krokProjekt}
            wartosc={activeProjectName ?? T.brakProjektu}
            brak={!activeProjectName}
            akcja={T.akcjaProjekt}
            onAkcja={() => setActiveSpace('projekt')}
            testid="mvd-analizy-krok-projekt"
          />
          <Krok
            nr="2"
            nazwa={T.krokWariant}
            wartosc={activeCaseName ?? T.brakWariantu}
            brak={!activeCaseName}
            akcja={T.akcjaWariant}
            onAkcja={() => setActiveSpace('obliczenia')}
            testid="mvd-analizy-krok-wariant"
          />
          <Krok
            nr="3"
            nazwa={T.krokWersja}
            wartosc={wersjaUkladu}
            brak={!snapshot}
            akcja={T.akcjaWersja}
            onAkcja={() => setActiveSpace('model')}
            testid="mvd-analizy-krok-wersja"
          />
          <Krok
            nr="4"
            nazwa={T.krokObliczenie}
            wartosc={etykietaOstatniego}
            brak={!ostatni}
            akcja={T.akcjaObliczenie}
            onAkcja={() => setActiveSpace('obliczenia')}
            testid="mvd-analizy-krok-obliczenie"
          />
        </div>
      </section>

      <section className="mvd-analizy-sekcja" aria-label={T.analizyEyebrow}>
        <span className="mvd-analizy-lbl">{T.analizyEyebrow}</span>
        {GRUPY_ANALIZ.map((grupa) => (
          <div key={grupa.tytul} className="mvd-analizy-grupa">
            <h4>{grupa.tytul}</h4>
            <div className="mvd-analizy-karty">
              {grupa.karty.map((karta) => (
                <Karta
                  key={karta.ekran}
                  karta={karta}
                  chip={chipKarty(karta)}
                  onOtworz={() => otworzKarte(karta)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mvd-analizy-sekcja" aria-label={T.klasyczneEyebrow}>
        <span className="mvd-analizy-lbl">{T.klasyczneEyebrow}</span>
        <p className="mvd-analizy-nota">{T.klasyczneNota}</p>
        <div className="mvd-analizy-klasyczne">
          {LACZA_KLASYCZNE.map((lacze) => (
            <button
              key={lacze.tabId}
              type="button"
              data-testid={lacze.testid}
              onClick={() => openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, { tabId: lacze.tabId })}
            >
              {lacze.etykieta}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
