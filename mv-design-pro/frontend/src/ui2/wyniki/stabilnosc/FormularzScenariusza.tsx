/**
 * FormularzScenariusza — formularz scenariusza wyłączenia zwarcia dla oceny
 * progowej stabilności dynamicznej (karta W2 pkt 1, zero fabrykacji).
 *
 * Pola = DOKŁADNIE kontrakt opcji biegu (`model.ts::POLA_SCENARIUSZA_STABILNOSCI`,
 * lustro `enm/canonical_analysis.py::_POLA_SCENARIUSZA_STABILNOSCI_DYNAMICZNEJ`).
 * Element objęty zwarciem i aparaty wyłączające wybiera się z listy elementów modelu
 * po nazwie (karta #145) — projektant nie wpisuje referencji.
 * Wartości startują PUSTE — zero liczb podpowiadanych jako „typowe". Walidacja
 * zakresów ograniczona do tego, co backend faktycznie sprawdza (pole wymagane,
 * `clearing_time_ms`/`recovery_time_constant_s` > 0, lista niepusta) — zero
 * progów inżynierskich wymyślonych w interfejsie.
 *
 * Uruchomienie biegu idzie PRZEZ ISTNIEJĄCĄ ścieżkę `uruchomObliczenie.ts`
 * (rozszerzoną o `solverInput`) — ten sam tor co przycisk „Uruchom obliczenie"
 * w przestrzeni Obliczenia, zero nowego kontraktu HTTP.
 */

import { useMemo, useState } from 'react';

import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useUruchomObliczenie } from '../../spaces/obliczenia/uruchomObliczenie';
import {
  POLA_SCENARIUSZA_STABILNOSCI,
  opcjeAparatowWylaczajacych,
  opcjeElementuZwarcia,
  przelaczAparat,
  pusteWartosciScenariusza,
  referencjeAparatow,
  walidujFormularzScenariusza,
  zbudujOpcjeScenariusza,
  type WartosciFormularzaScenariusza,
} from './model';
import { STABILNOSC_STRINGS as T } from './strings';

export function FormularzScenariusza() {
  const [wartosci, setWartosci] = useState<WartosciFormularzaScenariusza>(
    pusteWartosciScenariusza(),
  );
  // Elementy i aparaty z migawki modelu — projektant wybiera je po nazwie ze schematu;
  // referencja modelu jest wyłącznie wartością opcji (karta #145).
  const snapshot = useSnapshotStore((stan) => stan.snapshot);
  const elementy = useMemo(() => opcjeElementuZwarcia(snapshot), [snapshot]);
  const aparaty = useMemo(() => opcjeAparatowWylaczajacych(snapshot), [snapshot]);
  const [bledy, setBledy] = useState<Record<string, string>>({});
  const { uruchom, wToku } = useUruchomObliczenie();

  const zmienPole = (klucz: string, wartosc: string) => {
    setWartosci((poprzednie) => ({ ...poprzednie, [klucz]: wartosc }));
  };

  const wyslij = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const walidacja = walidujFormularzScenariusza(wartosci);
    setBledy(walidacja);
    if (Object.keys(walidacja).length > 0) return;
    uruchom('DYNAMIC_STABILITY', zbudujOpcjeScenariusza(wartosci));
  };

  return (
    <form
      className="mvd-stabilnosc-formularz"
      data-testid="mvd-stabilnosc-formularz"
      onSubmit={wyslij}
      noValidate
    >
      <h4>{T.formularzTytul}</h4>
      <p className="mvd-stabilnosc-nota">{T.formularzOpis}</p>
      <div className="mvd-stabilnosc-formularz-siatka">
        {POLA_SCENARIUSZA_STABILNOSCI.map((pole) => {
          const idPola = `mvd-stabilnosc-pole-${pole.klucz}`;
          const blad = bledy[pole.klucz];
          return (
            <div className="mvd-stabilnosc-formularz-pole" key={pole.klucz}>
              {pole.typ === 'aparaty' ? (
                <fieldset
                  className="mvd-stabilnosc-formularz-aparaty"
                  id={idPola}
                  data-testid={idPola}
                  aria-invalid={blad !== undefined}
                  aria-describedby={blad !== undefined ? `${idPola}-blad` : undefined}
                >
                  <legend>{pole.etykieta}</legend>
                  {aparaty.length === 0 ? (
                    <span className="mvd-stabilnosc-nota">{T.poleBrakAparatow}</span>
                  ) : (
                    aparaty.map((aparat) => (
                      <label key={aparat.ref} className="mvd-stabilnosc-formularz-aparat">
                        <input
                          type="checkbox"
                          data-testid={`${idPola}-${aparat.ref}`}
                          checked={referencjeAparatow(wartosci[pole.klucz]).includes(aparat.ref)}
                          onChange={() =>
                            zmienPole(pole.klucz, przelaczAparat(wartosci[pole.klucz], aparat.ref))
                          }
                        />
                        {aparat.nazwa} ({aparat.rodzaj})
                      </label>
                    ))
                  )}
                </fieldset>
              ) : (
                <>
                  <label htmlFor={idPola}>
                    {pole.etykieta}
                    {pole.jednostka !== undefined && ` [${pole.jednostka}]`}
                  </label>
                  {pole.typ === 'element' ? (
                    <select
                      id={idPola}
                      data-testid={idPola}
                      value={wartosci[pole.klucz] ?? ''}
                      onChange={(event) => zmienPole(pole.klucz, event.target.value)}
                      aria-invalid={blad !== undefined}
                      aria-describedby={blad !== undefined ? `${idPola}-blad` : undefined}
                    >
                      <option value="">
                        {elementy.length === 0 ? T.poleBrakElementow : T.poleElementWybierz}
                      </option>
                      {elementy.map((element) => (
                        <option key={element.ref} value={element.ref}>
                          {element.nazwa} ({element.rodzaj})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={idPola}
                      data-testid={idPola}
                      type="text"
                      inputMode="decimal"
                      value={wartosci[pole.klucz] ?? ''}
                      onChange={(event) => zmienPole(pole.klucz, event.target.value)}
                      aria-invalid={blad !== undefined}
                      aria-describedby={blad !== undefined ? `${idPola}-blad` : undefined}
                    />
                  )}
                </>
              )}
              {blad !== undefined && (
                <span
                  className="mvd-stabilnosc-formularz-blad"
                  id={`${idPola}-blad`}
                  data-testid={`${idPola}-blad`}
                  role="alert"
                >
                  {blad}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="submit"
        className="mvd-stabilnosc-formularz-uruchom"
        data-testid="mvd-stabilnosc-formularz-uruchom"
        disabled={wToku}
      >
        {wToku ? T.formularzWToku : T.formularzUruchom}
      </button>
    </form>
  );
}
