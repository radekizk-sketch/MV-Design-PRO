/**
 * PanelScenariuszy — okno „Scenariusze zwarciowe" w powłoce ui2
 * (karta KD-4, ZAMKNIĘCIE luki L-7).
 *
 * CO ZASTĘPUJE. Zdolność istniała WYŁĄCZNIE na trasie mostu `#fault-scenarios`,
 * do której — jak wykazał inwentarz K8 — nie prowadziło żadne wejście
 * produkcyjne (`navigateToFaultScenarios` bez wołającego), a sam panel był
 * trwale martwy (defekt D-1: identyfikator przypadku zaszyty jako `null`).
 * Zdolność wraca tam, gdzie jest jej miejsce w toku pracy: w przestrzeni
 * „Obliczenia", obok przypadków i przebiegów.
 *
 * REUŻYCIE, NIE DUPLIKACJA: dostawcą jest istniejący `useFaultScenariosStore`
 * (lista / dodanie / usunięcie / uruchomienie przez `/api/execution/...`).
 * Ten plik nic nie liczy — zbiera pola formularza i pokazuje odpowiedzi.
 */

import { useEffect, useState } from 'react';

import './scenariusze.css';
import { useAppStateStore } from '../../../../ui/app-state';
import { useFaultScenariosStore } from '../../../../ui/fault-scenarios/store';
import {
  FAULT_MODE_LABELS,
  FAULT_TYPE_LABELS,
  LOCATION_TYPE_LABELS,
  type FaultModeValue,
  type FaultTypeValue,
  type LocationType,
} from '../../../../ui/fault-scenarios/types';
import { SCENARIUSZE_STRINGS as T } from './strings';

/** Domyślne wartości konfiguracji zwarcia — 1:1 z kontraktem `ShortCircuitConfig`. */
const DOMYSLNY_C = 1.1;
const DOMYSLNY_CZAS_S = 1;

interface FormularzScenariusza {
  nazwa: string;
  rodzaj: FaultTypeValue;
  elementRef: string;
  rodzajMiejsca: LocationType;
  pozycja: string;
  tryb: FaultModeValue;
  rOhm: string;
  xOhm: string;
  wspolczynnikC: string;
  czasCieplnyS: string;
  wklady: boolean;
}

const PUSTY_FORMULARZ: FormularzScenariusza = {
  nazwa: '',
  rodzaj: 'SC_3F',
  elementRef: '',
  rodzajMiejsca: 'BUS',
  pozycja: '',
  tryb: 'METALLIC',
  rOhm: '0',
  xOhm: '0',
  wspolczynnikC: String(DOMYSLNY_C),
  czasCieplnyS: String(DOMYSLNY_CZAS_S),
  wklady: true,
};

export function PanelScenariuszy() {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const scenarios = useFaultScenariosStore((s) => s.scenarios);
  const isLoading = useFaultScenariosStore((s) => s.isLoading);
  const error = useFaultScenariosStore((s) => s.error);
  const setStudyCaseId = useFaultScenariosStore((s) => s.setStudyCaseId);
  const createScenario = useFaultScenariosStore((s) => s.createScenario);
  const deleteScenario = useFaultScenariosStore((s) => s.deleteScenario);
  const createRun = useFaultScenariosStore((s) => s.createRun);

  const [formularzOtwarty, setFormularzOtwarty] = useState(false);
  const [formularz, setFormularz] = useState<FormularzScenariusza>(PUSTY_FORMULARZ);
  const [bladFormularza, setBladFormularza] = useState<string | null>(null);
  const [doUsuniecia, setDoUsuniecia] = useState<string | null>(null);
  const [komunikat, setKomunikat] = useState<string | null>(null);

  useEffect(() => {
    setStudyCaseId(activeCaseId ?? null);
  }, [activeCaseId, setStudyCaseId]);

  const zapisz = async () => {
    if (!activeCaseId) return;
    if (!formularz.nazwa.trim() || !formularz.elementRef.trim()) {
      setBladFormularza(T.bladFormularza);
      return;
    }
    setBladFormularza(null);
    const pozycja = formularz.pozycja.trim() === '' ? null : Number(formularz.pozycja);
    try {
      await createScenario(activeCaseId, {
        name: formularz.nazwa.trim(),
        fault_type: formularz.rodzaj,
        location: {
          element_ref: formularz.elementRef.trim(),
          location_type: formularz.rodzajMiejsca,
          position: Number.isFinite(pozycja as number) ? pozycja : null,
        },
        config: {
          c_factor: Number(formularz.wspolczynnikC),
          thermal_time_seconds: Number(formularz.czasCieplnyS),
          include_branch_contributions: formularz.wklady,
        },
        fault_mode: formularz.tryb,
        ...(formularz.tryb === 'IMPEDANCE'
          ? { fault_impedance: { r_ohm: Number(formularz.rOhm), x_ohm: Number(formularz.xOhm) } }
          : {}),
      });
      setFormularz(PUSTY_FORMULARZ);
      setFormularzOtwarty(false);
    } catch {
      /* komunikat błędu żyje w store (pokazany niżej) */
    }
  };

  const uruchom = async (scenarioId: string, nazwa: string) => {
    setKomunikat(null);
    try {
      await createRun(scenarioId);
      setKomunikat(`${T.uruchomiono}: ${nazwa}`);
    } catch {
      /* komunikat błędu żyje w store */
    }
  };

  return (
    <section className="mvd-scen" data-testid="mvd-scenariusze">
      <header className="mvd-scen-glowa">
        <div>
          <h3 className="mvd-scen-tytul">{T.tytul}</h3>
          <p className="mvd-scen-cel">{T.cel}</p>
        </div>
        {activeCaseId && (
          <button
            type="button"
            className="mvd-scen-akcja"
            data-testid="mvd-scenariusze-dodaj"
            onClick={() => {
              setFormularzOtwarty((otwarty) => !otwarty);
              setBladFormularza(null);
            }}
          >
            {formularzOtwarty ? T.anuluj : T.dodaj}
          </button>
        )}
      </header>

      {!activeCaseId && (
        <div className="mvd-scen-pusty" data-testid="mvd-scenariusze-brak-przypadku">
          <p>{T.brakPrzypadku}</p>
          <p className="mvd-scen-uwaga">{T.brakPrzypadkuAkcja}</p>
        </div>
      )}

      {activeCaseId && formularzOtwarty && (
        <form
          className="mvd-scen-formularz"
          data-testid="mvd-scenariusze-formularz"
          onSubmit={(e) => {
            e.preventDefault();
            void zapisz();
          }}
        >
          <label className="mvd-scen-pole">
            <span>{T.polaNazwa}</span>
            <input
              type="text"
              data-testid="mvd-scenariusze-nazwa"
              value={formularz.nazwa}
              onChange={(e) => setFormularz({ ...formularz, nazwa: e.target.value })}
            />
          </label>
          <label className="mvd-scen-pole">
            <span>{T.polaRodzaj}</span>
            <select
              data-testid="mvd-scenariusze-rodzaj"
              value={formularz.rodzaj}
              onChange={(e) => setFormularz({ ...formularz, rodzaj: e.target.value as FaultTypeValue })}
            >
              {(Object.keys(FAULT_TYPE_LABELS) as FaultTypeValue[]).map((k) => (
                <option key={k} value={k}>
                  {FAULT_TYPE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="mvd-scen-pole">
            <span>{T.polaElement}</span>
            <input
              type="text"
              data-testid="mvd-scenariusze-element"
              value={formularz.elementRef}
              onChange={(e) => setFormularz({ ...formularz, elementRef: e.target.value })}
            />
          </label>
          <label className="mvd-scen-pole">
            <span>{T.polaRodzajMiejsca}</span>
            <select
              data-testid="mvd-scenariusze-miejsce"
              value={formularz.rodzajMiejsca}
              onChange={(e) =>
                setFormularz({ ...formularz, rodzajMiejsca: e.target.value as LocationType })
              }
            >
              {(Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((k) => (
                <option key={k} value={k}>
                  {LOCATION_TYPE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="mvd-scen-pole">
            <span>{T.polaPozycja}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              data-testid="mvd-scenariusze-pozycja"
              value={formularz.pozycja}
              onChange={(e) => setFormularz({ ...formularz, pozycja: e.target.value })}
            />
          </label>
          <label className="mvd-scen-pole">
            <span>{T.polaTryb}</span>
            <select
              data-testid="mvd-scenariusze-tryb"
              value={formularz.tryb}
              onChange={(e) => setFormularz({ ...formularz, tryb: e.target.value as FaultModeValue })}
            >
              {(Object.keys(FAULT_MODE_LABELS) as FaultModeValue[]).map((k) => (
                <option key={k} value={k}>
                  {FAULT_MODE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {formularz.tryb === 'IMPEDANCE' && (
            <>
              <label className="mvd-scen-pole">
                <span>{T.polaRezystancja}</span>
                <input
                  type="number"
                  step="0.001"
                  data-testid="mvd-scenariusze-r"
                  value={formularz.rOhm}
                  onChange={(e) => setFormularz({ ...formularz, rOhm: e.target.value })}
                />
              </label>
              <label className="mvd-scen-pole">
                <span>{T.polaReaktancja}</span>
                <input
                  type="number"
                  step="0.001"
                  data-testid="mvd-scenariusze-x"
                  value={formularz.xOhm}
                  onChange={(e) => setFormularz({ ...formularz, xOhm: e.target.value })}
                />
              </label>
            </>
          )}
          <label className="mvd-scen-pole">
            <span>{T.polaWspolczynnikC}</span>
            <input
              type="number"
              step="0.01"
              data-testid="mvd-scenariusze-c"
              value={formularz.wspolczynnikC}
              onChange={(e) => setFormularz({ ...formularz, wspolczynnikC: e.target.value })}
            />
          </label>
          <label className="mvd-scen-pole">
            <span>{T.polaCzasCieplny}</span>
            <input
              type="number"
              step="0.1"
              data-testid="mvd-scenariusze-czas"
              value={formularz.czasCieplnyS}
              onChange={(e) => setFormularz({ ...formularz, czasCieplnyS: e.target.value })}
            />
          </label>
          <label className="mvd-scen-pole mvd-scen-pole--chk">
            <input
              type="checkbox"
              data-testid="mvd-scenariusze-wklady"
              checked={formularz.wklady}
              onChange={(e) => setFormularz({ ...formularz, wklady: e.target.checked })}
            />
            <span>{T.polaWklady}</span>
          </label>

          {bladFormularza && (
            <p className="mvd-scen-blad" data-testid="mvd-scenariusze-blad-formularza">
              {bladFormularza}
            </p>
          )}

          <button type="submit" className="mvd-scen-akcja" data-testid="mvd-scenariusze-zapisz">
            {T.zapisz}
          </button>
        </form>
      )}

      {error && (
        <p className="mvd-scen-blad" data-testid="mvd-scenariusze-blad">
          {error}
        </p>
      )}
      {komunikat && (
        <p className="mvd-scen-ok" data-testid="mvd-scenariusze-komunikat">
          {komunikat}
        </p>
      )}

      {activeCaseId && isLoading && scenarios.length === 0 && (
        <p className="mvd-scen-uwaga" data-testid="mvd-scenariusze-ladowanie">
          {T.ladowanie}
        </p>
      )}

      {activeCaseId && !isLoading && scenarios.length === 0 && (
        <div className="mvd-scen-pusty" data-testid="mvd-scenariusze-pusty">
          <p>{T.brakScenariuszy}</p>
        </div>
      )}

      {scenarios.length > 0 && (
        <table className="mvd-scen-tabela" data-testid="mvd-scenariusze-tabela">
          <thead>
            <tr>
              <th scope="col">{T.kolNazwa}</th>
              <th scope="col">{T.kolRodzaj}</th>
              <th scope="col">{T.kolMiejsce}</th>
              <th scope="col">{T.kolAkcje}</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.scenario_id} data-testid={`mvd-scenariusze-wiersz-${s.scenario_id}`}>
                <td>{s.name}</td>
                <td>{FAULT_TYPE_LABELS[s.fault_type] ?? s.fault_type}</td>
                <td className="mvd-num">
                  {`${LOCATION_TYPE_LABELS[s.location.location_type] ?? s.location.location_type}: ${s.location.element_ref}`}
                </td>
                <td className="mvd-scen-akcje-kom">
                  <button
                    type="button"
                    className="mvd-scen-akcja"
                    data-testid={`mvd-scenariusze-uruchom-${s.scenario_id}`}
                    onClick={() => void uruchom(s.scenario_id, s.name)}
                  >
                    {T.uruchom}
                  </button>
                  {doUsuniecia === s.scenario_id ? (
                    <button
                      type="button"
                      className="mvd-scen-akcja mvd-scen-akcja--groz"
                      data-testid={`mvd-scenariusze-usun-potwierdz-${s.scenario_id}`}
                      onClick={() => {
                        setDoUsuniecia(null);
                        void deleteScenario(s.scenario_id);
                      }}
                    >
                      {T.usunPotwierdz}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mvd-scen-akcja mvd-scen-akcja--wtorna"
                      data-testid={`mvd-scenariusze-usun-${s.scenario_id}`}
                      onClick={() => setDoUsuniecia(s.scenario_id)}
                    >
                      {T.usun}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
