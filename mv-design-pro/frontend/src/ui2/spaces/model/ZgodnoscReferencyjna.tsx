/**
 * Sekcja „Zgodność referencyjna" pod property gridem zakładki „Właściwości"
 * (HANDOFF pkt 2.3 + 2.7, kontrakt `docs/sld/REFERENCE_ENGINE_UI_HANDOFF_2026-07.md`,
 * spec WIĄŻĄCA `docs/sld/REFERENCE_ENGINE_SPEC_V1.md`, ruling V12K-060).
 *
 * Zasada: ta warstwa NICZEGO nie liczy (HANDOFF §3/§4) — konsumuje raport
 * zgodności silnika referencji przez GOTOWY klient `ui2/referencje/api.ts`.
 *
 * pkt 2.3: dla WYBRANEGO elementu (pole LUB stacja — `element_ref` z selekcji)
 *   lista per pakiet: sprawdzenia ✓/✗ przefiltrowane po `element_ref`; przy ✗
 *   ZAWSZE `message_pl` (powód). Pakiety bez sprawdzeń dla elementu — pomijane.
 * pkt 2.7: dla STACJI dodatkowo reguły OSD `implemented=false` prezentowane
 *   INFORMACYJNIE („poza zakresem walidacji — powód"), NIE jako błąd/✗.
 *
 * ZAKRES OCENY (karta REF-PAKIET): do 2026-08-07 pakiet OSD był tu ZASZYTY
 * stałą (`PAKIET_OSD = 'osd_enea'`), więc dołożenie drugiego standardu OSD do
 * rejestru nie miałoby żadnego wpływu na ten ekran. Teraz pakiety OSD wynikają
 * z DANYCH — rodzaj `kind === 'osd'` z `GET /api/reference/packs` — a projektant
 * zawęża zakres wspólną kontrolką `WyborPakietuReferencyjnego` (ten sam wybór
 * co w przestrzeni „Gotowość" i w diagnostyce ENM). Bez zawężenia backend
 * ocenia wszystkie pakiety rejestru (jego wartość domyślna), a noty stacyjne
 * pochodzą ze wszystkich pakietów OSD.
 *
 * `score_percent = null` ⇒ „nie dotyczy" (HANDOFF §3.3) — tu nie liczymy score,
 * pokazujemy wyłącznie sprawdzenia; brak sprawdzeń dla elementu = uczciwa nota.
 */
import { useEffect, useState } from 'react';

import {
  fetchReferenceCompliance,
  fetchReferencePack,
  fetchReferencePacks,
  REFERENCE_PACK_KIND_LABELS_PL,
  type ReferenceComplianceReport,
  type ReferenceStationRule,
} from '../../referencje/api';
import { WyborPakietuReferencyjnego } from '../../referencje/WyborPakietuReferencyjnego';
import { useWyborPakietu, zawezenieDlaWyboru } from '../../referencje/wyborPakietu';

/** Nota stacyjna OSD z jawnym źródłem — nazwa pakietu pochodzi z rejestru. */
interface NotaOsd extends ReferenceStationRule {
  readonly pakietNazwa: string;
}

export interface ZgodnoscReferencyjnaProps {
  /** `element_ref` wybranego elementu (pole lub stacja). */
  readonly elementRef: string;
  /** Aktywny przypadek obliczeniowy (źródło raportu zgodności). */
  readonly caseId: string | null;
  /** Czy wybrany element jest stacją (włącza noty OSD pkt 2.7). */
  readonly czyStacja: boolean;
  /** Zaznaczono wiele elementów — sekcja dotyczy pierwszego (adnotacja). */
  readonly multiSelekcja: boolean;
}

const T = {
  naglowek: 'Zgodność referencyjna',
  ladowanie: 'Ładowanie zgodności referencyjnej…',
  blad: 'Nie udało się pobrać zgodności referencyjnej.',
  brakPrzypadku: 'Brak aktywnego przypadku obliczeniowego — zgodność referencyjna niedostępna.',
  brakSprawdzen: 'Brak sprawdzeń referencyjnych dla wybranego elementu.',
  multi: 'Pokazano dla pierwszego z zaznaczonych elementów.',
  osdNaglowek: 'Poza zakresem walidacji OSD',
  osdPrefiks: 'poza zakresem walidacji — ',
} as const;

/** Noty „poza zakresem walidacji" ze wskazanych pakietów OSD (deterministycznie). */
function notyZPakietow(
  pakiety: readonly { readonly nazwa: string; readonly reguly: readonly ReferenceStationRule[] }[],
): NotaOsd[] {
  return pakiety.flatMap(({ nazwa, reguly }) =>
    reguly.filter((r) => !r.implemented).map((r) => ({ ...r, pakietNazwa: nazwa })),
  );
}

export function ZgodnoscReferencyjna({
  elementRef,
  caseId,
  czyStacja,
  multiSelekcja,
}: ZgodnoscReferencyjnaProps): JSX.Element {
  const pakietId = useWyborPakietu((s) => s.pakietId);
  const [raport, setRaport] = useState<ReferenceComplianceReport | null>(null);
  const [notyOsd, setNotyOsd] = useState<NotaOsd[]>([]);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState(false);

  useEffect(() => {
    if (!caseId) {
      setRaport(null);
      setNotyOsd([]);
      setBlad(false);
      setLadowanie(false);
      return;
    }
    let anulowano = false;
    setLadowanie(true);
    setBlad(false);
    const zadania: Promise<void>[] = [
      fetchReferenceCompliance(caseId, zawezenieDlaWyboru(pakietId)).then((r) => {
        if (!anulowano) setRaport(r);
      }),
    ];
    if (czyStacja) {
      // Pakiety OSD z DANYCH (rodzaj), zawężone wyborem projektanta — nigdy
      // z zaszytego identyfikatora. Pusty zbiór ⇒ brak not (bez zmyślania).
      zadania.push(
        fetchReferencePacks('osd')
          .then((lista) => {
            const wZakresie =
              pakietId === null ? lista : lista.filter((p) => p.pack_id === pakietId);
            return Promise.all(
              wZakresie.map((p) =>
                fetchReferencePack(p.pack_id).then((pelny) => ({
                  nazwa: p.name_pl,
                  reguly: pelny.station_rules ?? [],
                })),
              ),
            );
          })
          .then((pakiety) => {
            if (!anulowano) setNotyOsd(notyZPakietow(pakiety));
          }),
      );
    } else {
      setNotyOsd([]);
    }
    void Promise.all(zadania)
      .catch(() => {
        if (!anulowano) setBlad(true);
      })
      .finally(() => {
        if (!anulowano) setLadowanie(false);
      });
    return () => {
      anulowano = true;
    };
  }, [caseId, czyStacja, elementRef, pakietId]);

  // Pakiety niosące co najmniej jedno sprawdzenie dla wybranego elementu.
  const pakietyElementu = (raport?.packs ?? [])
    .map((pack) => ({
      pack,
      checks: pack.checks.filter((c) => c.element_ref === elementRef),
    }))
    .filter((p) => p.checks.length > 0);

  return (
    <section className="mvd-zgodnosc-referencyjna" data-testid="mvd-zgodnosc-referencyjna">
      <div className="mvd-zgodnosc-naglowek">
        <span className="mvd-zgodnosc-tytul">{T.naglowek}</span>
        {multiSelekcja && (
          <span className="mvd-zgodnosc-multi" data-testid="mvd-zgodnosc-multi">
            {T.multi}
          </span>
        )}
      </div>

      <WyborPakietuReferencyjnego idKontrolki="mvd-ref-wybor-model" />

      {!caseId ? (
        <p className="mvd-zgodnosc-nota" data-testid="mvd-zgodnosc-pusto">
          {T.brakPrzypadku}
        </p>
      ) : ladowanie ? (
        <p className="mvd-zgodnosc-nota" data-testid="mvd-zgodnosc-ladowanie">
          {T.ladowanie}
        </p>
      ) : blad ? (
        <p className="mvd-zgodnosc-nota" data-testid="mvd-zgodnosc-blad">
          {T.blad}
        </p>
      ) : (
        <>
          {pakietyElementu.length === 0 ? (
            <p className="mvd-zgodnosc-nota" data-testid="mvd-zgodnosc-brak-sprawdzen">
              {T.brakSprawdzen}
            </p>
          ) : (
            pakietyElementu.map(({ pack, checks }) => (
              <div
                key={pack.pack_id}
                className="mvd-zgodnosc-pakiet"
                data-testid={`mvd-zgodnosc-pakiet-${pack.pack_id}`}
              >
                <div className="mvd-zgodnosc-pakiet-naglowek">
                  <span className="mvd-zgodnosc-pakiet-nazwa">{pack.name_pl}</span>
                  <span className="mvd-zgodnosc-pakiet-rodzaj">
                    {REFERENCE_PACK_KIND_LABELS_PL[pack.kind]}
                  </span>
                </div>
                <ul className="mvd-zgodnosc-lista">
                  {checks.map((check, i) => (
                    <li
                      key={`${check.rule_code}-${i}`}
                      className="mvd-zgodnosc-check"
                      data-testid={`mvd-zgodnosc-check-${pack.pack_id}-${i}`}
                      data-status={check.status}
                    >
                      <span
                        className={
                          check.status === 'pass'
                            ? 'mvd-zgodnosc-ikona-ok'
                            : 'mvd-zgodnosc-ikona-zle'
                        }
                        aria-hidden="true"
                      >
                        {check.status === 'pass' ? '✓' : '✗'}
                      </span>
                      <span className="mvd-zgodnosc-tresc">{check.message_pl}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          {notyOsd.length > 0 && (
            <div className="mvd-zgodnosc-osd" data-testid="mvd-zgodnosc-osd">
              <div className="mvd-zgodnosc-osd-naglowek">{T.osdNaglowek}</div>
              <ul className="mvd-zgodnosc-lista">
                {notyOsd.map((regula) => (
                  <li
                    key={regula.rule_code}
                    className="mvd-zgodnosc-osd-nota"
                    data-testid={`mvd-zgodnosc-osd-nota-${regula.rule_code}`}
                  >
                    <span className="mvd-zgodnosc-ikona-info" aria-hidden="true">
                      ℹ
                    </span>
                    <span className="mvd-zgodnosc-tresc">
                      {T.osdPrefiks}
                      {regula.description_pl}
                      <span className="mvd-zgodnosc-zrodlo"> ({regula.pakietNazwa})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
