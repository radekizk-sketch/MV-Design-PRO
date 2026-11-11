/**
 * Edytor stanu obiektu pola SN (karta pola, ekran E-11) — dostawca operacji `set_object_state`
 * dla pola i aparatów pola (`bay_ref`, `device_ref`); łącznik poza polem (`switch_ref`) ma akcję
 * na karcie łącznika (`network-build/cards/SwitchCard`).
 *
 * Pole i każdy jego aparat mają stan obiektu: ISTNIEJACY (obiekt zastany w sieci) albo
 * PROJEKTOWANY (każda operacja tworząca nadaje go jawnie). Stan rozstrzyga zakaz gazów
 * fluorowanych (rozporządzenie (UE) 2024/573, art. 13 ust. 9): pole istniejące może mieć SF₆
 * (serwis — ust. 7, przeniesienie — ust. 10), projektowane — nie. Edytor pokazuje stan pola
 * i aparatów z modelu, a zmienia go WYŁĄCZNIE operacją backendu; odmowa (np. oznaczenie pola
 * z SF₆ jako projektowanego — kod `pole.gaz_fluorowany`) wraca tu zdaniem z akcją naprawczą.
 * Zero reguły gazu w UI.
 */
import { useCallback, useState } from 'react';

import type { Bay, DomainOpResponseV1, StanObiektu } from '../../types/enm';
import { NAZWY_STANOW_OBIEKTU_PL, nazwaStanuObiektuPl } from '../shared/stanObiektu';
import { NAZWA_RODZAJU_APARATU_PL } from './wyposazeniePola';

export interface EdytorStanuObiektuPolaProps {
  readonly bay: Bay;
  readonly activeCaseId: string | null;
  readonly executeDomainOperation: (
    caseId: string,
    opName: string,
    payload: Record<string, unknown>,
  ) => Promise<DomainOpResponseV1 | null>;
  readonly bladStore?: () => string | null;
}

const STANY: readonly StanObiektu[] = ['ISTNIEJACY', 'PROJEKTOWANY'];

function nazwaAparatuPl(kind: string, designation: string | null | undefined): string {
  const rodzaj = (NAZWA_RODZAJU_APARATU_PL as Record<string, string>)[kind] ?? 'aparat';
  return designation ? `${rodzaj} ${designation}` : rodzaj;
}

export function EdytorStanuObiektuPola({
  bay,
  activeCaseId,
  executeDomainOperation,
  bladStore,
}: EdytorStanuObiektuPolaProps): JSX.Element {
  const [blad, setBlad] = useState<string | null>(null);
  const [zapis, setZapis] = useState(false);

  const ustaw = useCallback(
    async (stan: StanObiektu, deviceRef: string | null) => {
      if (!activeCaseId) return;
      setZapis(true);
      setBlad(null);
      try {
        const odpowiedz = await executeDomainOperation(activeCaseId, 'set_object_state', {
          bay_ref: bay.ref_id,
          stan_obiektu: stan,
          ...(deviceRef ? { device_ref: deviceRef } : {}),
        });
        if (!odpowiedz) {
          setBlad(bladStore?.() ?? 'Nie udało się zapisać stanu obiektu.');
          return;
        }
        if (odpowiedz.error) setBlad(odpowiedz.error);
      } finally {
        setZapis(false);
      }
    },
    [activeCaseId, bay.ref_id, bladStore, executeDomainOperation],
  );

  const aparaty = bay.primary_devices ?? [];
  const nieaktywny = activeCaseId === null || zapis;

  return (
    <section data-testid="stan-obiektu-pola" className="border-t border-scada-border p-3 text-xs">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
        Stan obiektu
      </h3>
      <p className="mt-1 text-scada-muted">
        Pole istniejące w sieci może mieć rozdzielnicę albo aparaty z SF₆ (serwis i przeniesienie);
        pole projektowane wymaga wykonania bez gazów fluorowanych.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span>Pole:</span>
        <span
          data-testid="stan-obiektu-pola-wartosc"
          data-stan={bay.stan_obiektu ?? ''}
          className="font-medium text-scada-text"
        >
          {nazwaStanuObiektuPl(bay.stan_obiektu)}
        </span>
        {STANY.filter((stan) => stan !== bay.stan_obiektu).map((stan) => (
          <button
            key={stan}
            type="button"
            disabled={nieaktywny}
            data-testid={`stan-obiektu-pola-ustaw-${stan}`}
            className="rounded border border-scada-accent px-2 py-0.5 text-scada-accent disabled:opacity-50"
            onClick={() => void ustaw(stan, null)}
          >
            Oznacz pole jako {stan === 'ISTNIEJACY' ? 'istniejące' : 'projektowane'}
          </button>
        ))}
      </div>
      {aparaty.length > 0 ? (
        <ul data-testid="stan-obiektu-aparaty" className="mt-2 space-y-1">
          {aparaty.map((aparat) => (
            <li
              key={aparat.device_ref}
              data-testid={`stan-obiektu-aparat-${aparat.device_ref}`}
              className="flex flex-wrap items-center gap-2"
            >
              <span>{nazwaAparatuPl(aparat.kind, aparat.designation)}:</span>
              <select
                aria-label={`Stan aparatu ${nazwaAparatuPl(aparat.kind, aparat.designation)}`}
                data-testid={`stan-obiektu-aparat-${aparat.device_ref}-wybor`}
                disabled={nieaktywny}
                className="rounded border border-scada-border bg-white px-1.5 py-0.5"
                value={aparat.stan_obiektu ?? ''}
                onChange={(e) => {
                  const stan = e.target.value as StanObiektu | '';
                  if (stan) void ustaw(stan, aparat.device_ref);
                }}
              >
                {aparat.stan_obiektu ? null : (
                  <option value="">{nazwaStanuObiektuPl(null)}</option>
                )}
                {STANY.map((stan) => (
                  <option key={stan} value={stan}>
                    {NAZWY_STANOW_OBIEKTU_PL[stan]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      ) : null}
      {blad ? (
        <p data-testid="stan-obiektu-pola-blad" role="alert" className="mt-2 text-sygnal-uwaga-tusz">
          {blad}
        </p>
      ) : null}
    </section>
  );
}
