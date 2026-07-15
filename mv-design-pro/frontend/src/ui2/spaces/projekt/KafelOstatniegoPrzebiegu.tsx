/*
 * Kafel „Ostatni przebieg" (W-101) — najświeższy przebieg aktywnego przypadku:
 * czas (z sygnatury ISO store'a, bez `Date`), analiza, status. Dane z
 * `mapujOstatniPrzebieg` (pulpitAdapter). `null` = brak przebiegów. Klik =
 * głęboki link do przestrzeni „Wyniki i dowody".
 */

import { Kafel, KafelWiersz, Tag } from './Kafel';
import type { WariantTagu } from './Kafel';
import { PULPIT_STRINGS, formatCzasPrzebiegu } from './strings';
import type { OstatniPrzebiegKafel } from './pulpitAdapter';
import type { RunStatus } from '../../../ui/study-cases/types';

const STATUS_WARIANT: Record<RunStatus, WariantTagu> = {
  PENDING: 'mut',
  RUNNING: 'warn',
  DONE: 'ok',
  FAILED: 'err',
};

export function KafelOstatniegoPrzebiegu({
  dane,
  onKlik,
}: {
  dane: OstatniPrzebiegKafel | null;
  onKlik?: () => void;
}) {
  return (
    <Kafel
      tytul={PULPIT_STRINGS.ostatniPrzebieg}
      onKlik={onKlik}
      ariaLabel={PULPIT_STRINGS.ostatniPrzebieg}
    >
      {dane ? (
        <>
          <div className="mvd-kafel-kpi">
            <span className="mvd-num">{formatCzasPrzebiegu(dane.czasISO)}</span>
          </div>
          <div className="mvd-kafel-kv">
            <KafelWiersz etykieta={PULPIT_STRINGS.zakres}>
              <span>{dane.analizaPL}</span>
            </KafelWiersz>
            <KafelWiersz etykieta={PULPIT_STRINGS.status}>
              <Tag wariant={STATUS_WARIANT[dane.statusKod]}>{dane.statusPL}</Tag>
            </KafelWiersz>
          </div>
        </>
      ) : (
        <p className="mvd-kafel-wkrotce">{PULPIT_STRINGS.brakPrzebiegow}</p>
      )}
    </Kafel>
  );
}
