/*
 * Kafel „Warunki przyłączenia i bilans mocy" (W-101, E1 — B1/B2). Pierwsze
 * ogniwo FLOW projektanta: warunki od strony sieci (Sk″/Ik″/U punktu
 * przyłączenia) + bilans mocy ZNAMIONOWEJ (generacja vs obciążenie) z modelu.
 *
 * W pełni sterowany propsami; dane z `mapujPrzylaczenie` (pulpitAdapter, rollup
 * read-only). Zero fizyki (sumy znamionowe = projekcja danych wejściowych, nie
 * wynik solvera), zero mutacji. Uczciwy stan zerowy: brak źródła sieciowego →
 * instrukcja dodania punktu przyłączenia. Klik = głęboki link do „Model sieci".
 */

import { Kafel, KafelWiersz } from './Kafel';
import { PULPIT_STRINGS, fmtLiczbaPL } from './strings';
import type { PrzylaczenieKafel } from './pulpitAdapter';

export function KafelPrzylaczenia({
  dane,
  onKlik,
}: {
  dane: PrzylaczenieKafel;
  onKlik?: () => void;
}) {
  const glowne = dane.zrodlaSieciowe[0] ?? null;

  return (
    <Kafel
      tytul={PULPIT_STRINGS.przylaczenieTytul}
      onKlik={onKlik}
      ariaLabel={PULPIT_STRINGS.przylaczenieTytul}
    >
      {glowne === null ? (
        <div className="mvd-kafel-pusty" data-testid="pulpit-przylaczenie-brak">
          <p className="mvd-kafel-pusty-glowny">{PULPIT_STRINGS.przylaczenieBrakZrodla}</p>
          <p className="mvd-kafel-pusty-opis">{PULPIT_STRINGS.przylaczenieBrakZrodlaOpis}</p>
        </div>
      ) : (
        <>
          <div className="mvd-kafel-kv">
            <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieNapiecie}>
              <span className="mvd-num" data-testid="pulpit-przylaczenie-napiecie">
                {fmtLiczbaPL(glowne.napiecieKv, 1)} {PULPIT_STRINGS.jednKv}
              </span>
            </KafelWiersz>
            <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieSk}>
              <span className="mvd-num" data-testid="pulpit-przylaczenie-sk">
                {fmtLiczbaPL(glowne.sk3Mva, 0)} {PULPIT_STRINGS.jednMva}
              </span>
            </KafelWiersz>
            <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieIk}>
              <span className="mvd-num">
                {fmtLiczbaPL(glowne.ik3Ka, 2)} {PULPIT_STRINGS.jednKa}
              </span>
            </KafelWiersz>
          </div>
          {dane.zrodlaSieciowe.length > 1 && (
            <p className="mvd-kafel-uwaga" data-testid="pulpit-przylaczenie-wiele">
              {PULPIT_STRINGS.przylaczenieWieleZrodel(dane.zrodlaSieciowe.length)}
            </p>
          )}
          <div className="mvd-kafel-kv mvd-kafel-kv-sep">
            <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieGeneracja}>
              <span className="mvd-num" data-testid="pulpit-przylaczenie-generacja">
                {fmtLiczbaPL(dane.generacjaMw, 2)} {PULPIT_STRINGS.jednMw}
              </span>
            </KafelWiersz>
            <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieOdbiory}>
              <span className="mvd-num" data-testid="pulpit-przylaczenie-odbiory">
                {fmtLiczbaPL(dane.odbioryMw, 2)} {PULPIT_STRINGS.jednMw}
              </span>
            </KafelWiersz>
            <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieNetto}>
              <span className="mvd-num" data-testid="pulpit-przylaczenie-netto">
                {fmtLiczbaPL(dane.nettoMw, 2)} {PULPIT_STRINGS.jednMw}
              </span>
            </KafelWiersz>
          </div>
        </>
      )}
    </Kafel>
  );
}
