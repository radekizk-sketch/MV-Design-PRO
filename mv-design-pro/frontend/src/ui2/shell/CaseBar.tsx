/*
 * Pasek aktywnego przypadku (zawsze widoczny). Prezentacyjny — dane pochodzą
 * z istniejących store'ów przez adapter (shellStatus). Stany: brak projektu
 * („—" + „Otwórz projekt") oraz komplet chipów model/gotowość/wyniki (karta §4).
 *
 * Znacznik świeżości wyników (karta K4/D1): „nieaktualne" jest klikalne i
 * prowadzi do przestrzeni „Obliczenia"; „aktualne"/„brak" pozostają statyczne.
 */

import type { ShellCaseInfo } from './shellStatus';
import type { StatusZnacznikaWynikow } from './znacznikSwiezosci';
import { SHELL_STRINGS, caseCountLabel, readinessLabel } from './strings';

interface CaseBarProps {
  info: ShellCaseInfo;
  onOpenProject?: () => void;
  /** Otwiera stan wariantów/przebiegów aktywnego zakresu (parytet E1.7c). */
  onOpenVariants?: () => void;
  /** Przejście do przestrzeni „Obliczenia" ze znacznika „wyniki nieaktualne" (K4/D1). */
  onPrzejdzDoObliczen?: () => void;
}

function resultsDotClass(status: StatusZnacznikaWynikow): string {
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
 * Podpowiedź chipu wyników: PRZYCZYNA z backendu (`result_status_reason_pl`),
 * a przy wyniku nieaktualnym dopisana wskazówka, co zrobić. UI nie tłumaczy
 * przyczyny po swojemu — pokazuje zdanie serwera (CV-2-W).
 */
function resultsTitle(przyczynaPl: string | null, klikalny: boolean): string | undefined {
  const wskazowka = klikalny ? SHELL_STRINGS.resultsOutdatedHint : null;
  return [przyczynaPl, wskazowka].filter(Boolean).join(' ') || undefined;
}

export function CaseBar({ info, onOpenProject, onOpenVariants, onPrzejdzDoObliczen }: CaseBarProps) {
  // „Zielona kropka" wyłącznie przy POLICZONEJ gotowości bez uwag — stan
  // nieustalony nie jest stanem dobrym (V12K-309 poz. 1).
  const readinessOk =
    info.readinessGotowoscUstalona
    && info.readinessBlockers === 0
    && info.readinessWarnings === 0;
  const nazwaZakresu = info.projectPresent
    ? (info.caseName ?? SHELL_STRINGS.emptyValue)
    : SHELL_STRINGS.emptyValue;

  return (
    <div className="mvd-casebar" data-testid="mvd-casebar">
      <span className="mvd-lbl">{SHELL_STRINGS.activeCase}</span>

      {info.projectPresent && info.projectName ? (
        onOpenProject ? (
          /* KD-1 (parytet L-5): przy OTWARTYM projekcie chip nazwy jest jedynym
             wejściem do zmiany projektu — dotąd „Otwórz projekt" pokazywał się
             wyłącznie bez projektu, więc zmiana projektu w powłoce ui2 nie była
             osiągalna klikiem. Zmiana kontekstu przechodzi przez potwierdzenie
             w ekranie „Nowy / otwórz projekt". */
          <button
            type="button"
            className="mvd-chip mvd-chip-klik"
            data-testid="mvd-casebar-project"
            onClick={onOpenProject}
            title={SHELL_STRINGS.changeProjectHint}
          >
            {info.projectName}
          </button>
        ) : (
          <span className="mvd-chip" data-testid="mvd-casebar-project">
            {info.projectName}
          </span>
        )
      ) : null}

      {info.projectPresent && onOpenVariants ? (
        <button
          type="button"
          className="mvd-chip mvd-chip-case"
          data-testid="mvd-casebar-chip"
          onClick={onOpenVariants}
          title="Otwórz stan wariantów i przebiegów zakresu obliczeń"
        >
          {nazwaZakresu}
        </button>
      ) : (
        <span className="mvd-chip mvd-chip-case" data-testid="mvd-casebar-chip">
          {nazwaZakresu}
        </span>
      )}

      {info.projectPresent ? (
        <>
          <span className="mvd-chip" data-testid="mvd-casebar-model">
            <span className={info.modelValidated ? 'mvd-dot mvd-dot-ok' : 'mvd-dot mvd-dot-warn'} />
            {info.modelValidated ? SHELL_STRINGS.modelValidated : SHELL_STRINGS.modelPending}
          </span>

          <span className="mvd-chip" data-testid="mvd-casebar-readiness">
            <span className={readinessOk ? 'mvd-dot mvd-dot-ok' : 'mvd-dot mvd-dot-warn'} />
            {readinessLabel(
              info.readinessWarnings,
              info.readinessBlockers,
              info.readinessGotowoscUstalona,
            )}
          </span>

          {info.znacznikWynikow.klikalny && onPrzejdzDoObliczen ? (
            <button
              type="button"
              className="mvd-chip mvd-chip-klik"
              data-testid="mvd-casebar-results"
              onClick={onPrzejdzDoObliczen}
              title={resultsTitle(info.znacznikWynikow.przyczynaPl, true)}
            >
              <span className={resultsDotClass(info.znacznikWynikow.status)} />
              {info.znacznikWynikow.etykieta}
            </button>
          ) : (
            <span
              className="mvd-chip"
              data-testid="mvd-casebar-results"
              title={resultsTitle(info.znacznikWynikow.przyczynaPl, false)}
            >
              <span className={resultsDotClass(info.znacznikWynikow.status)} />
              {info.znacznikWynikow.etykieta}
            </span>
          )}

          <span className="mvd-grow" />

          <span className="mvd-chip" data-testid="mvd-casebar-count">
            {caseCountLabel(info.caseCount)}
          </span>
        </>
      ) : (
        <>
          <span className="mvd-grow" />
          <button type="button" className="mvd-btn" onClick={onOpenProject} data-testid="mvd-open-project">
            {SHELL_STRINGS.openProject}
          </button>
        </>
      )}
    </div>
  );
}
