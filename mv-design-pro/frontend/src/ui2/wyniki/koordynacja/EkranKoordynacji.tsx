/**
 * EkranKoordynacji — dostawca ui2 dla ekranu kanonicznego E-28
 * („Koordynacja zabezpieczeń", karta F-E5b, FLOW §0.3 „kontrakt ekranu
 * prowadzącego"). Zastępuje atrapę `ProtectionCoordinationSurface` (most),
 * która liczyła dwie demonstracyjne krzywe IEC 60255 w warstwie prezentacji.
 *
 * Rama prowadząca:
 *  - nagłówek: eyebrow obszaru + JEDNO zdanie celu inżynierskiego (§0.2),
 *  - stan wejścia: brak aktywnego projektu / brak zakończonego przebiegu
 *    zwarciowego → uczciwy stan zerowy z akcją naprawczą prowadzącą we właściwą
 *    przestrzeń (`useShellStore.setActiveSpace`), NIE pusta tabela,
 *  - poniżej: REALNA strona `ProtectionCoordinationPage` (klient
 *    `protection-coordination/api.ts` → POST/GET /api/protection-coordination/...).
 *
 * Strona sama czyta `activeProjectId` ze store (`useAppStateStore`) — rama NIE
 * dubluje źródła i NIE przekazuje propsów. ZERO fizyki, ZERO fabrykacji: werdykty,
 * marginesy CTI i krzywe TCC pochodzą wyłącznie z backendu. Stylowanie wyłącznie
 * tokenami --mvd-* (oba motywy z automatu).
 */

import './koordynacja.css';

import { useAppStateStore } from '../../../ui/app-state';
import { ProtectionCoordinationPage } from '../../../ui/protection-coordination/ProtectionCoordinationPage';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useShellStore } from '../../shell/useShellStore';
import { maZakonczonyPrzebieg } from '../analizy/model';
import { KOORDYNACJA_STRINGS as T } from './strings';

function StanZerowy({
  tytul,
  opis,
  akcja,
  onAkcja,
  testid,
}: {
  tytul: string;
  opis: string;
  akcja: string;
  onAkcja: () => void;
  testid: string;
}) {
  return (
    <div className="mvd-koordynacja-stan" data-testid={testid} data-tone="idle">
      <h3>{tytul}</h3>
      <p>{opis}</p>
      <button
        type="button"
        className="mvd-koordynacja-akcja"
        data-testid={`${testid}-akcja`}
        onClick={onAkcja}
      >
        {akcja}
      </button>
    </div>
  );
}

export function EkranKoordynacji() {
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);

  const maPrzebiegZwarciowy = maZakonczonyPrzebieg(przebiegi, 'zwarciowy');

  return (
    <div className="mvd-koordynacja" data-testid="mvd-koordynacja">
      <header className="mvd-koordynacja-head">
        <span className="mvd-koordynacja-lbl">{T.eyebrow}</span>
        <p className="mvd-koordynacja-cel">{T.cel}</p>
      </header>

      {!activeProjectId ? (
        <StanZerowy
          tytul={T.brakProjektuTytul}
          opis={T.brakProjektuOpis}
          akcja={T.brakProjektuAkcja}
          onAkcja={() => setActiveSpace('projekt')}
          testid="mvd-koordynacja-brak-projektu"
        />
      ) : !maPrzebiegZwarciowy ? (
        <StanZerowy
          tytul={T.brakZwarciaTytul}
          opis={T.brakZwarciaOpis}
          akcja={T.brakZwarciaAkcja}
          onAkcja={() => setActiveSpace('obliczenia')}
          testid="mvd-koordynacja-brak-zwarcia"
        />
      ) : (
        <div className="mvd-koordynacja-strona" data-testid="mvd-koordynacja-strona">
          <ProtectionCoordinationPage />
        </div>
      )}
    </div>
  );
}
