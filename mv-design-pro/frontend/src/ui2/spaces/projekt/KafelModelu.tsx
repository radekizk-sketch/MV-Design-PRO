/*
 * Kafel „Model sieci" (W-101) — licznik elementów + rozbicie na stacje i źródła.
 * W pełni sterowany propsami; dane z `mapujModel` (pulpitAdapter). Klik = głęboki
 * link do przestrzeni „Model sieci".
 */

import { Kafel, KafelWiersz } from './Kafel';
import { PULPIT_STRINGS } from './strings';
import type { ModelKafel } from './pulpitAdapter';

export function KafelModelu({ dane, onKlik }: { dane: ModelKafel; onKlik?: () => void }) {
  return (
    <Kafel tytul={PULPIT_STRINGS.modelTytul} onKlik={onKlik} ariaLabel={PULPIT_STRINGS.modelTytul}>
      <div className="mvd-kafel-kpi">
        <span data-testid="pulpit-model-elementow">{dane.elementow}</span>
        <small>{PULPIT_STRINGS.elementow}</small>
      </div>
      <div className="mvd-kafel-kv">
        <KafelWiersz etykieta={PULPIT_STRINGS.stacje}>
          <span className="mvd-num">{dane.stacje}</span>
        </KafelWiersz>
        <KafelWiersz etykieta={PULPIT_STRINGS.zrodla}>
          <span className="mvd-num">{dane.zrodla}</span>
        </KafelWiersz>
      </div>
    </Kafel>
  );
}
