/*
 * Kafel „Spójność" (W-101) — rewizja bieżącego modelu, odcisk (suma kontrolna)
 * oraz aktualność wyników aktywnego przypadku. Świeżość: IMPORTUJE współdzielony
 * `FreshnessBadge` z `ui2/inspector` (SPEC_POWIAZANIA §6.2 — jeden znacznik, zakaz
 * lokalnych wariantów; karta §5 kryt. 4).
 *
 * TODO-KARTA #2 (patrz pulpitAdapter): store'y read-only nie wystawiają liczbowej
 * rewizji WYNIKÓW dla stanu „nieaktualne" (jest wyłącznie `result_status`), więc
 * `FreshnessBadge` obsługuje uczciwie stan „aktualne" (rewizja danej = rewizja
 * modelu). Stan „nieaktualne" pokazuje etykietę statusu bez fabrykowania numeru
 * rew. a→b (zakaz zgadywania). Po udostępnieniu rewizji wyników przez backend
 * wystarczy podać `rewizjaDanej` do gałęzi „nieaktualne" badge'a.
 */

import { Kafel, KafelWiersz, Tag } from './Kafel';
import { FreshnessBadge } from '../../inspector';
import { PULPIT_STRINGS, rewizjaModeluLabel, odciskKrotki } from './strings';
import type { SpojnoscKafel } from './pulpitAdapter';

export function KafelSpojnosci({
  dane,
  onKlik,
}: {
  dane: SpojnoscKafel;
  onKlik?: () => void;
}) {
  return (
    <Kafel tytul={PULPIT_STRINGS.spojnosc} onKlik={onKlik} ariaLabel={PULPIT_STRINGS.spojnosc}>
      <div className="mvd-kafel-kv">
        <KafelWiersz etykieta={PULPIT_STRINGS.modelTytul}>
          <span className="mvd-num">{rewizjaModeluLabel(dane.rewizjaModelu)}</span>
        </KafelWiersz>
        <KafelWiersz etykieta={PULPIT_STRINGS.odcisk}>
          <span className="mvd-num" title={dane.odcisk}>
            {odciskKrotki(dane.odcisk)}
          </span>
        </KafelWiersz>
        <KafelWiersz etykieta={PULPIT_STRINGS.wyniki}>
          {dane.aktualnosc === 'aktualne' ? (
            <FreshnessBadge
              rewizjaDanej={dane.rewizjaModelu}
              rewizjaModelu={dane.rewizjaModelu}
              testId="pulpit-spojnosc-freshness"
            />
          ) : dane.aktualnosc === 'nieaktualne' ? (
            <Tag wariant="warn">{PULPIT_STRINGS.wynikiNieaktualne}</Tag>
          ) : (
            <Tag wariant="mut">{PULPIT_STRINGS.wynikiBrak}</Tag>
          )}
        </KafelWiersz>
      </div>
    </Kafel>
  );
}
