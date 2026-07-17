/**
 * LegacySurface (karta E1.7b) — most tymczasowy: montuje ISTNIEJĄCE powierzchnie
 * dziedzinowe starego UI w środkowym panelu nowej powłoki, per przestrzeń,
 * wg rejestru `legacyRegistry` (jawna lista wygaszania, mapowanie karty §3a).
 *
 * Zasady:
 * - komponenty z `ui/**` montowane BEZ modyfikacji; kontekst dostarczają
 *   te same store'y co w starym wejściu (zero shadow-state),
 * - nawigacja hash pozostaje jedną prawdą tras legacy: mosty tras uruchamia
 *   WYŁĄCZNIE jawny wybór przestrzeni (AppRoot.onActiveSpaceChange) — montaż
 *   nie nawiguje, aby nie nadpisywać deep-linków (E1.7c),
 * - testid `workspace-surface-main` (kontrakt e2e) nosi opakowanie montażu;
 *   dla powierzchni trasowych dostarcza go sam WorkspaceSurfaceRouter.
 */

import type { ReactNode } from 'react';
import './legacy.css';

import { SldCanvasV3Workspace } from '../../ui/sld/v3/canvas/SldCanvasV3Workspace';
import { WorkspaceSurfaceRouter } from '../../ui/workspace';
import type { SpaceId } from '../shell/spaces';
import { REJESTR_LEGACY } from './legacyRegistry';

/** Źródło selekcji emitowanej z mostu gotowości (magistrala E15.1). */

/** Opakowanie montażu legacy — nośnik testid kontraktu e2e w środkowym panelu. */
function OprawaWarsztatu({ children }: { children: ReactNode }) {
  return (
    <div data-testid="workspace-surface-main" className="mvd-legacy-host">
      {children}
    </div>
  );
}

/** Schemat/model: kanwa SLD (jak domyślna trasa starego wejścia).
 * UWAGA (E1.7c): bez nawigacji montażowej — mosty tras działają wyłącznie
 * przy JAWNYM wyborze przestrzeni (AppRoot.onActiveSpaceChange); montaż nie
 * może nadpisywać deep-linków (#analysis/#variants/...). */
function LegacySld() {
  return <SldCanvasV3Workspace />;
}

/** Obliczenia: konfiguracja zakresu obliczeń + historia przebiegów (study-cases). */
/**
 * Wyniki/dokumentacja: powierzchnie trasowe starego UI (E-24 analizy / E-25 raport).
 * Most ustawia hash (jedna prawda nawigacji), orkiestrator E1.7a otwiera
 * powierzchnię, a WorkspaceSurfaceRouter renderuje ją w warsztacie
 * (testid `workspace-surface-main` pochodzi z routera).
 */
function LegacyPowierzchniaTrasowa() {
  return (
    <div className="mvd-legacy-host">
      <WorkspaceSurfaceRouter region="main" />
    </div>
  );
}

export interface LegacySurfaceProps {
  space: SpaceId;
}

export function LegacySurface({ space }: LegacySurfaceProps) {
  const wpis = REJESTR_LEGACY[space];
  if (wpis.zrodlo === 'nowa-powloka') {
    // Zawartość dostarcza nowa powłoka (AppRoot) — most nie montuje niczego.
    return null;
  }

  switch (space) {
    case 'model':
    case 'schemat':
      return (
        <OprawaWarsztatu>
          <LegacySld />
        </OprawaWarsztatu>
      );
    case 'wyniki':
    case 'dokumentacja':
      return <LegacyPowierzchniaTrasowa />;
    default:
      return null;
  }
}
