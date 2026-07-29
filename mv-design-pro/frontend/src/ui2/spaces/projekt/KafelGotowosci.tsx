/*
 * Kafel „Gotowość do analiz" (W-101) — stan gotowości + liczniki blokad i
 * ostrzeżeń z `ReadinessInfo`. Dane z `mapujGotowosc` (pulpitAdapter). Klik =
 * głęboki link do przestrzeni „Gotowość".
 */

import { Kafel, KafelWiersz, Tag } from './Kafel';
import { PULPIT_STRINGS } from './strings';
import type { GotowoscKafel } from './pulpitAdapter';

export function KafelGotowosci({ dane, onKlik }: { dane: GotowoscKafel; onKlik?: () => void }) {
  return (
    <Kafel
      tytul={PULPIT_STRINGS.gotowoscTytul}
      onKlik={onKlik}
      ariaLabel={PULPIT_STRINGS.gotowoscTytul}
    >
      <div className="mvd-kafel-kpi">
        <span className="mvd-kafel-kpi-txt">
          {dane.gotowa ? PULPIT_STRINGS.gotowa : PULPIT_STRINGS.niegotowa}
        </span>
      </div>
      <div className="mvd-kafel-kv">
        <KafelWiersz etykieta={PULPIT_STRINGS.blokady}>
          <Tag wariant={dane.blokady === 0 ? 'ok' : 'err'}>
            <span className="mvd-num">{dane.blokady}</span>
          </Tag>
        </KafelWiersz>
        <KafelWiersz etykieta={PULPIT_STRINGS.ostrzezenia}>
          <Tag wariant={dane.ostrzezenia === 0 ? 'ok' : 'warn'}>
            <span className="mvd-num">{dane.ostrzezenia}</span>
          </Tag>
        </KafelWiersz>
      </div>
    </Kafel>
  );
}
