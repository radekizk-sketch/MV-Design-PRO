/*
 * Pasek aktywnego przypadku (zawsze widoczny). Prezentacyjny — dane pochodzą
 * z istniejących store'ów przez adapter (shellStatus). Stany: brak projektu
 * („—" + „Otwórz projekt") oraz komplet chipów model/gotowość/wyniki (karta §4).
 *
 * Znacznik świeżości wyników (karta K4/D1): „nieaktualne" jest klikalne i
 * prowadzi do przestrzeni „Obliczenia"; „aktualne"/„brak" pozostają statyczne.
 */

import type { StudyCaseResultStatus } from '../../ui/study-cases/types';
import type { ShellCaseInfo } from './shellStatus';
import { SHELL_STRINGS, caseCountLabel, readinessLabel } from './strings';

interface CaseBarProps {
  info: ShellCaseInfo;
  onOpenProject?: () => void;
  /** Otwiera stan wariantów/przebiegów aktywnego zakresu (parytet E1.7c). */
  onOpenVariants?: () => void;
  /** Przejście do przestrzeni „Obliczenia" ze znacznika „wyniki nieaktualne" (K4/D1). */
  onPrzejdzDoObliczen?: () => void;
}

function resultsDotClass(status: StudyCaseResultStatus): string {
  switch (status) {
    case 'FRESH':
      return 'mvd-dot mvd-dot-ok';
    case 'OUTDATED':
      return 'mvd-dot mvd-dot-warn';
    case 'NONE':
      return 'mvd-dot mvd-dot-none';
  }
}

export function CaseBar({ info, onOpenProject, onOpenVariants, onPrzejdzDoObliczen }: CaseBarProps) {
  const readinessOk = info.readinessBlockers === 0 && info.readinessWarnings === 0;
  const nazwaZakresu = info.projectPresent
    ? (info.caseName ?? SHELL_STRINGS.emptyValue)
    : SHELL_STRINGS.emptyValue;

  return (
    <div className="mvd-casebar" data-testid="mvd-casebar">
      <span className="mvd-lbl">{SHELL_STRINGS.activeCase}</span>

      {info.projectPresent && info.projectName ? (
        <span className="mvd-chip" data-testid="mvd-casebar-project">
          {info.projectName}
        </span>
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
            {readinessLabel(info.readinessWarnings, info.readinessBlockers)}
          </span>

          {info.znacznikWynikow.klikalny && onPrzejdzDoObliczen ? (
            <button
              type="button"
              className="mvd-chip mvd-chip-klik"
              data-testid="mvd-casebar-results"
              onClick={onPrzejdzDoObliczen}
              title={SHELL_STRINGS.resultsOutdatedHint}
            >
              <span className={resultsDotClass(info.znacznikWynikow.status)} />
              {info.znacznikWynikow.etykieta}
            </button>
          ) : (
            <span className="mvd-chip" data-testid="mvd-casebar-results">
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
