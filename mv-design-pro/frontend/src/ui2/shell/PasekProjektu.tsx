/*
 * Pasek projektu — PIERWSZY z trzech pasów powłoki (karta K1 POWLOKA,
 * kontrakt UIUX przemysłowy UI-01/UI-02). Zastępuje dawne dwa pasy: tytułowy
 * (`TitleBar`) i aktywnego przypadku (`CaseBar`), które dublowały nazwę projektu
 * i gotowość (POMIAR_POWLOKA §1 „Dublowanie").
 *
 * Od lewej: znak aplikacji · menu projektu z PEŁNĄ nazwą (nigdy nie przykryta —
 * element nie kurczy się poniżej nazwy) · zakres obliczeń · status wyników ze
 * świeżością (`znacznikSwiezosci`) · menu „Widok" · „Oblicz".
 *
 * „Oblicz" ma JEDNĄ prawdę dostępności z torem wykonania
 * (`przyczynaBlokadyObliczen`): przyczyna niedostępności jest w podpowiedzi
 * i w treści dostępnej, a trwający bieg zamienia przycisk na stan „Obliczanie…".
 * Gotowość NIE jest tu powtarzana — jej jedynym miejscem w chromie jest pasek
 * stanu (prowadzi do przestrzeni „Gotowość").
 *
 * „Zapisz" usunięto: model zapisują operacje domenowe przy każdej zmianie, więc
 * nie istnieje operacja zapisu, którą przycisk mógłby wywołać (dawniej martwy klik).
 */

import { useId } from 'react';

import type { ShellCaseInfo } from './shellStatus';
import type { StatusZnacznikaWynikow } from './znacznikSwiezosci';
import { MenuPowloki, type PozycjaMenuPowloki } from './MenuPowloki';
import { SHELL_STRINGS } from './strings';
import { useShellStore } from './useShellStore';
import { themeLabel, type ThemeMode } from '../theme/themeMode';
import type { BlokadaObliczen } from '../spaces/obliczenia/uruchomObliczenie';

export interface PasekProjektuProps {
  info: ShellCaseInfo;
  themeMode: ThemeMode;
  onThemeToggle: () => void;
  szczegolyAudytowe: boolean;
  onToggleSzczegolyAudytowe: () => void;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleBottom: () => void;
  onResetLayout: () => void;
  onOpenProject?: () => void;
  onOpenProjectMetadata?: () => void;
  /** Otwiera stan wariantów/przebiegów aktywnego zakresu. */
  onOpenVariants?: () => void;
  /** Cel znacznika „Wyniki: aktualne". */
  onOtworzWyniki?: () => void;
  /** Cel znacznika „Wyniki: nieaktualne". */
  onPrzejdzDoObliczen?: () => void;
  onCalculate?: () => void;
  /** Przyczyna niedostępności obliczeń (wspólny predykat z torem wykonania). */
  blokadaObliczen: BlokadaObliczen | null;
  /** Trwający bieg (rejestr przebiegów) — przycisk pokazuje stan obliczania. */
  biegTrwa: boolean;
  /** Opis stanu trwającego biegu (np. „W kolejce", „Liczy się"). */
  opisBiegu?: string | null;
}

function kropkaWynikow(status: StatusZnacznikaWynikow): string {
  switch (status) {
    case 'FRESH':
      return 'mvd-dot mvd-dot-ok';
    case 'OUTDATED':
      return 'mvd-dot mvd-dot-warn';
    case 'NONE':
      return 'mvd-dot mvd-dot-none';
  }
}

/**
 * Podpowiedź znacznika wyników: PRZYCZYNA z backendu (`result_status_reason_pl`)
 * i wskazówka celu kliku. UI nie tłumaczy przyczyny po swojemu (CV-2-W).
 */
function tytulWynikow(przyczynaPl: string | null, cel: 'wyniki' | 'obliczenia' | null): string | undefined {
  const wskazowka =
    cel === 'wyniki'
      ? SHELL_STRINGS.resultsFreshHint
      : cel === 'obliczenia'
        ? SHELL_STRINGS.resultsOutdatedHint
        : null;
  return [przyczynaPl, wskazowka].filter(Boolean).join(' ') || undefined;
}

export function PasekProjektu({
  info,
  themeMode,
  onThemeToggle,
  szczegolyAudytowe,
  onToggleSzczegolyAudytowe,
  leftCollapsed,
  rightCollapsed,
  bottomOpen,
  onToggleLeft,
  onToggleRight,
  onToggleBottom,
  onResetLayout,
  onOpenProject,
  onOpenProjectMetadata,
  onOpenVariants,
  onOtworzWyniki,
  onPrzejdzDoObliczen,
  onCalculate,
  blokadaObliczen,
  biegTrwa,
  opisBiegu = null,
}: PasekProjektuProps) {
  const idPrzyczyny = useId();
  const trybWidokuSchematu = useShellStore((state) => state.trybWidokuSchematu);
  const przelaczTrybWidokuSchematu = useShellStore((state) => state.przelaczTrybWidokuSchematu);
  const znacznik = info.znacznikWynikow;
  const celKliku =
    znacznik.cel === 'wyniki' ? onOtworzWyniki : znacznik.cel === 'obliczenia' ? onPrzejdzDoObliczen : undefined;
  const nazwaZakresu = info.caseName ?? SHELL_STRINGS.emptyValue;

  const pozycjeProjektu: PozycjaMenuPowloki[] = [];
  if (onOpenProject) {
    pozycjeProjektu.push({
      id: 'zmien',
      etykieta: SHELL_STRINGS.changeProject,
      testId: 'mvd-projekt-zmien',
      onWybierz: onOpenProject,
    });
  }
  if (onOpenProjectMetadata) {
    pozycjeProjektu.push({
      id: 'metadane',
      etykieta: SHELL_STRINGS.projectMetadata,
      testId: 'mvd-projekt-metadane',
      onWybierz: onOpenProjectMetadata,
    });
  }

  const pozycjeWidoku: PozycjaMenuPowloki[] = [
    {
      // K2b §0.4: ten sam stan co przełącznik w pasku kanwy (`sld-v3-tryb-widoku`).
      id: 'tryb-schematu',
      etykieta: SHELL_STRINGS.viewModeItem,
      opis: SHELL_STRINGS.viewModeHint,
      wartosc: trybWidokuSchematu === 'roboczy' ? SHELL_STRINGS.viewModeWorking : SHELL_STRINGS.viewModeSheet,
      testId: 'mvd-tryb-widoku-schematu',
      onWybierz: przelaczTrybWidokuSchematu,
    },
    {
      id: 'motyw',
      etykieta: SHELL_STRINGS.themeItem,
      wartosc: themeLabel(themeMode),
      testId: 'mvd-theme-toggle',
      onWybierz: onThemeToggle,
    },
    {
      id: 'szczegoly',
      etykieta: SHELL_STRINGS.auditDetails,
      opis: SHELL_STRINGS.auditDetailsHint,
      zaznaczona: szczegolyAudytowe,
      testId: 'mvd-szczegoly-audytowe',
      onWybierz: onToggleSzczegolyAudytowe,
    },
    {
      id: 'lewy',
      etykieta: SHELL_STRINGS.toggleLeft,
      skrot: 'Ctrl+B',
      zaznaczona: !leftCollapsed,
      testId: 'mvd-toggle-left',
      onWybierz: onToggleLeft,
    },
    {
      id: 'prawy',
      etykieta: SHELL_STRINGS.toggleRight,
      skrot: 'Ctrl+I',
      zaznaczona: !rightCollapsed,
      testId: 'mvd-toggle-right',
      onWybierz: onToggleRight,
    },
    {
      id: 'dolny',
      etykieta: SHELL_STRINGS.toggleBottom,
      zaznaczona: bottomOpen,
      testId: 'mvd-toggle-bottom',
      onWybierz: onToggleBottom,
    },
    {
      id: 'reset',
      etykieta: SHELL_STRINGS.resetLayout,
      testId: 'mvd-reset-layout',
      onWybierz: onResetLayout,
    },
  ];

  const obliczDostepne = blokadaObliczen === null && !biegTrwa;
  const tytulObliczen = biegTrwa
    ? [SHELL_STRINGS.calculating, opisBiegu].filter(Boolean).join(' ')
    : (blokadaObliczen?.komunikat ?? SHELL_STRINGS.calculateHint);

  return (
    <header className="mvd-pasek-projektu" data-testid="active-case-bar">
      <span className="mvd-logo" aria-hidden="true">
        {SHELL_STRINGS.appNameLead}
        <span className="mvd-logo-accent">{SHELL_STRINGS.appNameAccent}</span>
      </span>

      {info.projectPresent && info.projectName ? (
        pozycjeProjektu.length > 0 ? (
          <MenuPowloki
            przycisk={<span className="mvd-projekt-nazwa-tekst">{info.projectName}</span>}
            etykietaPrzycisku={`Projekt ${info.projectName}`}
            tytulPrzycisku={`${info.projectName}. ${SHELL_STRINGS.projectMenuHint}`}
            testIdPrzycisku="mvd-projekt-nazwa"
            klasaPrzycisku="mvd-projekt-nazwa"
            pozycje={pozycjeProjektu}
          />
        ) : (
          <span className="mvd-projekt-nazwa" data-testid="mvd-projekt-nazwa">
            <span className="mvd-projekt-nazwa-tekst">{info.projectName}</span>
          </span>
        )
      ) : (
        <>
          <span className="mvd-projekt-brak">{SHELL_STRINGS.noProject}</span>
          {onOpenProject ? (
            <button type="button" className="mvd-btn" onClick={onOpenProject} data-testid="mvd-open-project">
              {SHELL_STRINGS.openProject}
            </button>
          ) : null}
        </>
      )}

      {info.projectPresent ? (
        <span className="mvd-projekt-zakres">
          <span className="mvd-projekt-etykieta">{SHELL_STRINGS.caseLabel}:</span>
          {onOpenVariants ? (
            <button
              type="button"
              className="mvd-chip mvd-chip-case mvd-chip-klik"
              data-testid="mvd-projekt-przypadek"
              onClick={onOpenVariants}
              title={SHELL_STRINGS.caseOpenHint}
            >
              {nazwaZakresu}
            </button>
          ) : (
            <span className="mvd-chip mvd-chip-case" data-testid="mvd-projekt-przypadek">
              {nazwaZakresu}
            </span>
          )}
        </span>
      ) : null}

      {info.projectPresent ? (
        celKliku ? (
          <button
            type="button"
            className="mvd-chip mvd-chip-klik"
            data-testid="mvd-projekt-wyniki"
            data-status={znacznik.status}
            onClick={celKliku}
            title={tytulWynikow(znacznik.przyczynaPl, znacznik.cel)}
          >
            <span className={kropkaWynikow(znacznik.status)} aria-hidden="true" />
            {znacznik.etykieta}
          </button>
        ) : (
          <span
            className="mvd-chip"
            data-testid="mvd-projekt-wyniki"
            data-status={znacznik.status}
            title={tytulWynikow(znacznik.przyczynaPl, null)}
          >
            <span className={kropkaWynikow(znacznik.status)} aria-hidden="true" />
            {znacznik.etykieta}
          </span>
        )
      ) : null}

      <span className="mvd-grow" />

      <MenuPowloki
        przycisk={SHELL_STRINGS.viewMenu}
        etykietaPrzycisku={SHELL_STRINGS.viewMenu}
        testIdPrzycisku="mvd-view-menu"
        pozycje={pozycjeWidoku}
        doPrawej
      />

      {onCalculate ? (
        <>
        <button
          type="button"
          className="mvd-btn mvd-btn-primary mvd-oblicz"
          // `aria-disabled` (nie `disabled`): przycisk zostaje osiągalny z klawiatury
          // i pokazuje przyczynę; klik przy blokadzie woła tor wykonania, który
          // odmawia startu TYM SAMYM zdaniem (jeden predykat). Trwający bieg
          // blokuje klik całkowicie — drugi bieg nie startuje z paska.
          aria-disabled={!obliczDostepne}
          aria-busy={biegTrwa}
          aria-describedby={idPrzyczyny}
          title={tytulObliczen}
          data-stan={biegTrwa ? 'trwa' : blokadaObliczen ? 'zablokowane' : 'gotowe'}
          onClick={() => {
            if (biegTrwa) return;
            onCalculate();
          }}
          data-testid="mvd-calculate"
        >
          {biegTrwa ? SHELL_STRINGS.calculating : SHELL_STRINGS.calculate}
        </button>
        <span id={idPrzyczyny} className="mvd-sr-only" data-testid="mvd-calculate-przyczyna">
          {tytulObliczen}
        </span>
        </>
      ) : null}
    </header>
  );
}
