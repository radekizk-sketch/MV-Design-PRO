/**
 * Znaczniki w karcie pola: „W przypadku „X": grupa N; nadpisane: …" — przy edytorze nastaw
 * sterownika widać, które przypadki obliczeniowe liczą z INNĄ grupą albo z nadpisanymi nastawami
 * (ADR-022: nastawy bazowe są danymi modelu, przypadek niesie tylko deltę). Dane z końcówki
 * `…/zabezpieczenia-przypadkow` (wybory wszystkich przypadków projektu), nazwy przypadków
 * z listy przypadków projektu. Zero fizyki — przepisanie wartości wg schematu rejestru.
 */

import { useEffect, useState } from 'react';

import type { ProtectionAssignment } from '../../../../types/enm';
import { etykietaFunkcjiEaz } from '../../../../ui/shared/funkcjeEaz';
import { zapisWartosciNastawy } from '../../../../ui/shared/opisNastawSterownika';
import { nastawyFunkcji } from '../../../../ui/shared/sterownikZabezpieczen';
import { useStudyCasesStore } from '../../../../ui/study-cases/store';
import { ZABEZPIECZENIA_PRZYPADKU_STRINGS as T } from './stringsZabezpieczenPrzypadku';
import {
  grupaEfektywnaPrzypadku,
  pobierzWyboryPrzypadkow,
  schematNastawy,
  znacznikiSterownika,
  type WyborZabezpieczenPrzypadku,
  type ZnacznikPrzypadku,
} from './wyborZabezpieczen';

/** Wybory przypadków projektu przypadku `caseId` dotyczące sterownika (błąd odczytu = brak znaczników). */
export function useZnacznikiPrzypadkow(caseId: string | null, sterownik: ProtectionAssignment | null): ZnacznikPrzypadku[] {
  const [wybory, setWybory] = useState<WyborZabezpieczenPrzypadku[]>([]);
  useEffect(() => {
    if (!caseId || !sterownik) {
      setWybory([]);
      return;
    }
    let anulowane = false;
    pobierzWyboryPrzypadkow(caseId)
      .then((w) => {
        if (!anulowane) setWybory(w);
      })
      .catch(() => {
        // Brak odczytu wyborów nie blokuje edycji nastaw modelu — znaczników po prostu nie ma.
        if (!anulowane) setWybory([]);
      });
    return () => {
      anulowane = true;
    };
  }, [caseId, sterownik]);
  return sterownik ? znacznikiSterownika(wybory, sterownik.ref_id) : [];
}

/** Opis nadpisań jednej funkcji w przypadku: „zwłoka 0,8 s, próg 300 A". */
export function opisNadpisanFunkcji(
  sterownik: ProtectionAssignment,
  znacznik: ZnacznikPrzypadku,
  funkcjaRef: string,
): string {
  const nastawy = znacznik.nastawy[funkcjaRef] ?? {};
  const grupa = grupaEfektywnaPrzypadku(sterownik, znacznik.grupa === null ? {} : { [sterownik.ref_id]: znacznik.grupa });
  const wGrupie = { ...nastawyFunkcji(sterownik, funkcjaRef, grupa), ...nastawy };
  return Object.keys(nastawy)
    .sort()
    .map((klucz) => {
      const schemat = schematNastawy(sterownik, funkcjaRef, klucz);
      const wartosc = nastawy[klucz];
      return schemat ? `${schemat.nazwaPl} ${zapisWartosciNastawy(schemat, wartosc, wGrupie)}` : `${klucz} ${String(wartosc)}`;
    })
    .join(', ');
}

export function ZnacznikiPrzypadkow({
  sterownik,
  znaczniki,
  testid,
}: {
  sterownik: ProtectionAssignment;
  znaczniki: readonly ZnacznikPrzypadku[];
  testid: string;
}) {
  const przypadki = useStudyCasesStore((s) => s.cases);
  if (znaczniki.length === 0) return null;
  const nazwa = (caseId: string) => przypadki.find((p) => p.id === caseId)?.name ?? caseId;
  return (
    <div className="mvd-edytor-nastaw-przypadki" data-testid={testid}>
      <span className="mvd-edytor-nastaw-kontekst">{T.znacznikiTytul}</span>
      <ul>
        {znaczniki.map((z) => {
          const funkcje = sterownik.funkcje.filter((f) => Object.keys(z.nastawy[f.ref] ?? {}).length > 0);
          return (
            <li key={z.caseId} data-testid={`${testid}-${z.caseId}`}>
              <strong>{T.znacznikPrzypadku(nazwa(z.caseId))}:</strong>
              {z.grupa !== null ? <span> {T.znacznikGrupa(z.grupa)}</span> : null}
              {z.grupa !== null && funkcje.length > 0 ? ';' : null}
              {funkcje.length > 0 ? (
                <span>
                  {' '}
                  {T.znacznikNadpisane}{' '}
                  {funkcje.map((f) => `${etykietaFunkcjiEaz(f.kod)} — ${opisNadpisanFunkcji(sterownik, z, f.ref)}`).join('; ')}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
