/*
 * Sekcja „Ocena zgodności referencyjnej" przestrzeni „Gotowość" (Reference
 * Engine V1, HANDOFF pkt 2.1). Tabela per pakiet referencyjny: rodzaj, wersja,
 * zaliczone/oblane, wynik (Reference Score). Rozwijalna sekcja i rozwijalny
 * wiersz → lista sprawdzeń z rekordem oceny (etykieta, wyjaśnienie) i powodem PL.
 *
 * ZAKAZ DRUGIEJ DEFINICJI (HANDOFF §3.1): typy, etykiety rodzajów i klient
 * pochodzą WYŁĄCZNIE z `ui2/referencje/api.ts` (reeksport kontraktu
 * `ui/enm-inspector`). Sekcja niczego z fizyki/reguł nie liczy — konsumuje
 * `GET /api/cases/{id}/reference/compliance`.
 *
 * `score_percent = null` ⇒ DOKŁADNIE „nie dotyczy" (nigdy 0% ani 100%) —
 * HANDOFF §3.3. Wynik jest miarą bez koloru werdyktu; „nie dotyczy” wyszarzone.
 *
 * Źródło `case_id`: aktywny przypadek (`useActiveCaseId`, `ui/app-state`) —
 * wzorzec innych ekranów. Brak przypadku → uczciwy stan pusty PL (bez wołania
 * API). Wzorzec zachowań: `ui/enm-inspector/ReferencePanel.tsx` (stany
 * pusty/ładowanie/błąd/„nie dotyczy") — wzorzec ZACHOWAŃ, nie designu.
 *
 * ZAKRES OCENY (karta REF-PAKIET): projektant wybiera referencję wspólną
 * kontrolką `WyborPakietuReferencyjnego` (lista z `GET /api/reference/packs`).
 * Wybór zawęża zapytanie parametrem `?packs=` — bez wyboru backend ocenia
 * wszystkie pakiety rejestru (jego udokumentowana wartość domyślna).
 */

import { Fragment, useEffect, useState } from 'react';
import { useActiveCaseId } from '../../../ui/app-state';
import {
  fetchReferenceCompliance,
  REFERENCE_PACK_KIND_LABELS_PL,
  type ReferenceComplianceReport,
  type ReferencePackComplianceReport,
} from '../../referencje/api';
import { BrakiPakietowDanych } from '../../referencje/BrakiPakietowDanych';
import { SprawdzenieReferencyjne } from '../../referencje/SprawdzenieReferencyjne';
import { WyborPakietuReferencyjnego } from '../../referencje/WyborPakietuReferencyjnego';
import { useWyborPakietu, zawezenieDlaWyboru } from '../../referencje/wyborPakietu';
import { GOTOWOSC_STRINGS } from './strings';

/** Etykieta wyniku: `score_percent=null` ⇒ „nie dotyczy" (nigdy 0%/100%). */
function etykietaWyniku(pack: ReferencePackComplianceReport): string {
  if (pack.score_percent == null) return GOTOWOSC_STRINGS.refNieDotyczy;
  return `${pack.score_percent}%`;
}

/**
 * Wynik pakietu (Reference Score) to miara udziału sprawdzeń zgodnych, nie ocena — bez koloru
 * werdyktu i bez progu okna (dawniej 100 % zieleń / ≥ 80 % bursztyn / reszta czerwień, karta
 * WERDYKT-MIGRACJA-190). „Nie dotyczy” wyszarzone; ocenę niesie rekord każdego sprawdzenia.
 */
function klasaWyniku(pack: ReferencePackComplianceReport): string {
  return pack.score_percent == null ? 'mvd-ref-score-nd' : 'mvd-ref-score-miara';
}

export function SekcjaZgodnosciReferencyjnej() {
  const caseId = useActiveCaseId();
  const pakietId = useWyborPakietu((s) => s.pakietId);
  const [rozwinieta, setRozwinieta] = useState(true);
  const [raport, setRaport] = useState<ReferenceComplianceReport | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [rozwinietyPakiet, setRozwinietyPakiet] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) {
      setRaport(null);
      setBlad(null);
      setLadowanie(false);
      return;
    }
    let anulowane = false;
    setLadowanie(true);
    setBlad(null);
    fetchReferenceCompliance(caseId, zawezenieDlaWyboru(pakietId))
      .then((dane) => {
        if (!anulowane) setRaport(dane);
      })
      .catch((err) => {
        if (!anulowane) {
          setBlad(err instanceof Error ? err.message : GOTOWOSC_STRINGS.refBlad);
        }
      })
      .finally(() => {
        if (!anulowane) setLadowanie(false);
      });
    return () => {
      anulowane = true;
    };
  }, [caseId, pakietId]);

  const idTresci = 'mvd-ref-sekcja-tresc';

  return (
    <section className="mvd-ref-sekcja" data-testid="mvd-ref-sekcja">
      <button
        type="button"
        className="mvd-cel-naglowek"
        onClick={() => setRozwinieta((v) => !v)}
        aria-expanded={rozwinieta}
        aria-controls={idTresci}
      >
        <span className="mvd-cel-tytul">{GOTOWOSC_STRINGS.refSekcjaTytul}</span>
        <span className="mvd-cel-zwijak" aria-hidden="true">
          {rozwinieta ? GOTOWOSC_STRINGS.zwin : GOTOWOSC_STRINGS.rozwin}
        </span>
      </button>

      {rozwinieta && (
        <div id={idTresci} className="mvd-ref-tresc">
          <p className="mvd-ref-opis">{GOTOWOSC_STRINGS.refSekcjaOpis}</p>
          <WyborPakietuReferencyjnego idKontrolki="mvd-ref-wybor-gotowosc" />
          {caseId && !ladowanie && !blad && <BrakiPakietowDanych braki={raport?.braki_pakietow} />}
          {!caseId ? (
            <p className="mvd-ref-stan" data-testid="mvd-ref-brak-przypadku">
              {GOTOWOSC_STRINGS.refBrakPrzypadku}
            </p>
          ) : ladowanie ? (
            <p className="mvd-ref-stan" role="status" data-testid="mvd-ref-ladowanie">
              {GOTOWOSC_STRINGS.refLadowanie}
            </p>
          ) : blad ? (
            <p className="mvd-ref-stan mvd-ref-stan-blad" role="alert" data-testid="mvd-ref-blad">
              {GOTOWOSC_STRINGS.refBlad}
            </p>
          ) : !raport || raport.packs.length === 0 ? (
            <p className="mvd-ref-stan" data-testid="mvd-ref-brak-pakietow">
              {GOTOWOSC_STRINGS.refBrakPakietow}
            </p>
          ) : (
            <table className="mvd-ref-tabela" data-testid="mvd-ref-tabela">
              <thead>
                <tr>
                  <th>{GOTOWOSC_STRINGS.refKolPakiet}</th>
                  <th>{GOTOWOSC_STRINGS.refKolRodzaj}</th>
                  <th>{GOTOWOSC_STRINGS.refKolWersja}</th>
                  <th className="mvd-ref-num">{GOTOWOSC_STRINGS.refKolSprawdzenia}</th>
                  <th className="mvd-ref-num">{GOTOWOSC_STRINGS.refKolWynik}</th>
                </tr>
              </thead>
              <tbody>
                {raport.packs.map((pack) => {
                  const otwarty = rozwinietyPakiet === pack.pack_id;
                  return (
                    <Fragment key={pack.pack_id}>
                      <tr
                        className="mvd-ref-wiersz"
                        data-testid={`mvd-ref-wiersz-${pack.pack_id}`}
                      >
                        <td>
                          <button
                            type="button"
                            className="mvd-ref-rozwin"
                            onClick={() =>
                              setRozwinietyPakiet(otwarty ? null : pack.pack_id)
                            }
                            aria-expanded={otwarty}
                            aria-controls={`mvd-ref-checks-${pack.pack_id}`}
                          >
                            <span className="mvd-cel-zwijak" aria-hidden="true">
                              {otwarty ? GOTOWOSC_STRINGS.zwin : GOTOWOSC_STRINGS.rozwin}
                            </span>
                            {pack.name_pl}
                          </button>
                        </td>
                        <td className="mvd-muted">
                          {REFERENCE_PACK_KIND_LABELS_PL[pack.kind]}
                        </td>
                        <td className="mvd-muted mvd-num">{pack.version}</td>
                        <td className="mvd-ref-num mvd-num">
                          {pack.passed} / {pack.failed}
                        </td>
                        <td
                          className={`mvd-ref-num mvd-num mvd-ref-score ${klasaWyniku(pack)}`}
                          data-testid={`mvd-ref-wynik-${pack.pack_id}`}
                        >
                          {etykietaWyniku(pack)}
                        </td>
                      </tr>
                      {otwarty && (
                        <tr>
                          <td colSpan={5} className="mvd-ref-checks-cell">
                            {pack.checks.length === 0 ? (
                              <p className="mvd-ref-stan">{GOTOWOSC_STRINGS.refBrakSprawdzen}</p>
                            ) : (
                              <ul
                                className="mvd-ref-checks"
                                id={`mvd-ref-checks-${pack.pack_id}`}
                                data-testid={`mvd-ref-checks-${pack.pack_id}`}
                              >
                                {pack.checks.map((check, index) => (
                                  <li key={check.ocena.kryterium_id} className="mvd-ref-check">
                                    <SprawdzenieReferencyjne
                                      check={check}
                                      testid={`mvd-ref-check-${pack.pack_id}-${index}`}
                                    />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
