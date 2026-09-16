/*
 * Kafel „Spójność" (W-101) — rewizja bieżącego modelu, odcisk (suma kontrolna)
 * oraz aktualność wyników aktywnego przypadku. Świeżość: IMPORTUJE współdzielony
 * `FreshnessBadge` z `ui2/inspector` (SPEC_POWIAZANIA §6.2 — jeden znacznik, zakaz
 * lokalnych wariantów; karta §5 kryt. 4).
 *
 * ZAMKNIĘCIE (KARTA-UI2 §1 p. 10, poprzednie ograniczenie #2): `StatusWynikowPrzypadku
 * .rewizja_biegu` (`ui/study-cases/types.ts:101`, dodane kartą CV-2-W PO napisaniu
 * poprzedniej treści tego komentarza) niesie liczbową rewizję modelu, na której
 * policzono AKTUALNE wyniki przypadku — dla OBU stanów aktualności (rewizja biegu
 * istnieje niezależnie od tego, czy model zmienił się PO tym biegu). `FreshnessBadge`
 * dostaje realną `rewizjaDanej` w OBU gałęziach; stan „nieaktualne" pokazuje więc
 * realną parę rewizji (dana → model), nie samą etykietę statusu bez liczby.
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
          {dane.rewizjaWynikow !== null ? (
            // FreshnessBadge sam rozstrzyga aktualne/nieaktualne z pary rewizji
            // (`czyNieaktualne`) — jedno źródło prawdy dla PORÓWNANIA, zgodne z
            // `dane.aktualnosc` (obie strony pochodzą z tego samego biegu backendu).
            <FreshnessBadge
              rewizjaDanej={dane.rewizjaWynikow}
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
