/**
 * Edytor stanu obiektu (karta pola E-11, inspektor obiektu schematu, formularz operacji) —
 * JEDYNY dostawca operacji `set_object_state` w interfejsie, dla wszystkich trzech celów
 * operacji backendu (`backend/src/enm/stan_obiektu_pola.py`):
 *  - pole (`bay_ref`) — stan pola i każdego jego aparatu (`EdytorStanuObiektuPola`);
 *  - jedna instancja aparatu pola (`bay_ref` + `device_ref`);
 *  - łącznik poza polem (`switch_ref`) — rozłącznik sekcyjny w ciągu, sprzęgło, łącznik pola bez
 *    lustra w wyposażeniu pola (`EdytorStanuObiektuElementu` z celem `lacznik`).
 * Łącznik opisany aparatem pola (`linked_ref`) ma stan wspólny z tym aparatem — backend odmawia
 * `switch_ref` na nim (`object_state.switch_has_bay_device`) i ustawia aparat z gałęzią razem
 * przez `device_ref`, więc cel takiego łącznika to aparat pola (`celStanuObiektu`), nie gałąź.
 * Bezpiecznik nie ma stanu obiektu (bez komory gaszeniowej z gazem) — brak celu, brak edytora.
 *
 * Pole i każdy jego aparat mają stan obiektu: ISTNIEJACY (obiekt zastany w sieci) albo
 * PROJEKTOWANY (każda operacja tworząca nadaje go jawnie). Stan rozstrzyga zakaz gazów
 * fluorowanych (rozporządzenie (UE) 2024/573, art. 13 ust. 9): pole istniejące może mieć SF₆
 * (serwis — ust. 7, przeniesienie — ust. 10), projektowane — nie. Edytor pokazuje stan
 * z modelu, a zmienia go WYŁĄCZNIE operacją backendu; odmowa (np. oznaczenie pola z SF₆ jako
 * projektowanego — kod `pole.gaz_fluorowany`) wraca tu zdaniem z akcją naprawczą.
 * Zero reguły gazu w UI.
 */
import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../app-state';
import { useActiveOperationContext, useNetworkBuildStore } from '../network-build/networkBuildStore';
import { useSnapshotStore } from '../topology/snapshotStore';
import {
  isSwitchBranch,
  type Bay,
  type BayPrimaryDevice,
  type DomainOpResponseV1,
  type EnergyNetworkModel,
  type StanObiektu,
  type SwitchBranch,
} from '../../types/enm';
import { NAZWY_STANOW_OBIEKTU_PL, nazwaStanuObiektuPl, stanObiektuLacznika } from '../shared/stanObiektu';
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

// ---------------------------------------------------------------------------
// Cel operacji dla obiektu modelu (inspektor schematu, formularz operacji)
// ---------------------------------------------------------------------------

/** Obiekt, którego stan zmienia `set_object_state`, rozstrzygnięty z modelu. */
export type CelStanuObiektu =
  | { readonly rodzaj: 'pole'; readonly bay: Bay }
  | { readonly rodzaj: 'aparat'; readonly bay: Bay; readonly aparat: BayPrimaryDevice }
  | { readonly rodzaj: 'lacznik'; readonly galaz: SwitchBranch };

/**
 * Cel operacji `set_object_state` dla identyfikatora obiektu modelu: pole (ref pola), aparat pola
 * (ref aparatu albo ref gałęzi łącznika opisanej aparatem pola — `linked_ref`, ta sama relacja co
 * `enm.gaz_fluorowany_pola.aparat_lacznika`), łącznik poza polem (gałąź łączeniowa bez aparatu
 * pola). `null` — obiekt bez stanu obiektu (bezpiecznik, odcinek, element spoza modelu).
 */
export function celStanuObiektu(
  snapshot: EnergyNetworkModel | null,
  ref: string | null | undefined,
): CelStanuObiektu | null {
  if (!snapshot || !ref) return null;
  const pola = snapshot.bays ?? [];
  const pole = pola.find((b) => b.ref_id === ref);
  if (pole) return { rodzaj: 'pole', bay: pole };
  for (const bay of pola) {
    const aparat = (bay.primary_devices ?? []).find((a) => a.device_ref === ref);
    if (aparat) return { rodzaj: 'aparat', bay, aparat };
  }
  const galaz = (snapshot.branches ?? []).find((b) => b.ref_id === ref);
  if (!galaz || !isSwitchBranch(galaz)) return null;
  for (const bay of pola) {
    const aparat = (bay.primary_devices ?? []).find(
      (a) => typeof a.linked_ref === 'string' && a.linked_ref.trim() === galaz.ref_id,
    );
    if (aparat) return { rodzaj: 'aparat', bay, aparat };
  }
  return { rodzaj: 'lacznik', galaz };
}

function wCudzyslowie(nazwa: string | null | undefined): string {
  return nazwa?.trim() ? ` „${nazwa.trim()}”` : '';
}

/** Treść edytora jednego obiektu: stan z modelu, etykieta, uwaga i ładunek operacji. */
function opisCeluElementu(
  cel: Exclude<CelStanuObiektu, { rodzaj: 'pole' }>,
  pola: readonly Bay[],
): {
  readonly stan: StanObiektu | null;
  readonly etykieta: string;
  readonly uwaga: string | null;
  readonly payload: Readonly<Record<string, string>>;
} {
  if (cel.rodzaj === 'aparat') {
    return {
      stan: cel.aparat.stan_obiektu ?? null,
      etykieta: `${nazwaAparatuPl(cel.aparat.kind, cel.aparat.designation)} pola${wCudzyslowie(cel.bay.name)}`,
      uwaga: cel.aparat.linked_ref
        ? 'Stan aparatu i łącznika, który ten aparat opisuje, jest jeden — zmiana obejmuje oba.'
        : null,
      payload: { bay_ref: cel.bay.ref_id, device_ref: cel.aparat.device_ref },
    };
  }
  const poleMacierzyste =
    (cel.galaz.stan_obiektu ?? null) === null
      ? pola.find((b) => (b.equipment_refs ?? []).includes(cel.galaz.ref_id)) ?? null
      : null;
  return {
    stan: stanObiektuLacznika(pola, cel.galaz),
    etykieta: `Łącznik${wCudzyslowie(cel.galaz.name)}`,
    uwaga: poleMacierzyste
      ? `Łącznik bez własnego stanu ma stan pola${wCudzyslowie(poleMacierzyste.name)}.`
      : null,
    payload: { switch_ref: cel.galaz.ref_id },
  };
}

type WykonanieOperacji = EdytorStanuObiektuPolaProps['executeDomainOperation'];

export interface EdytorStanuObiektuElementuProps {
  readonly cel: Exclude<CelStanuObiektu, { rodzaj: 'pole' }>;
  /** Pola modelu — stan łącznika poza polem liczy reguła `stanObiektuLacznika` (gałąź z
   *  `equipment_refs` pola bez własnego stanu ma stan pola). */
  readonly pola: readonly Bay[];
  readonly activeCaseId: string | null;
  readonly executeDomainOperation: WykonanieOperacji;
  readonly bladStore?: () => string | null;
}

/**
 * Stan JEDNEGO obiektu: aparatu pola (`bay_ref` + `device_ref`) albo łącznika poza polem
 * (`switch_ref`). Przyciski „Oznacz jako …" dla stanów innych niż bieżący (stan nieustalony —
 * oba); odmowa backendu — komunikat `role="alert"`.
 */
export function EdytorStanuObiektuElementu({
  cel,
  pola,
  activeCaseId,
  executeDomainOperation,
  bladStore,
}: EdytorStanuObiektuElementuProps): JSX.Element {
  const [blad, setBlad] = useState<string | null>(null);
  const [zapis, setZapis] = useState(false);

  const opis = useMemo(() => opisCeluElementu(cel, pola), [cel, pola]);

  const ustaw = useCallback(
    async (stan: StanObiektu) => {
      if (!activeCaseId) return;
      setZapis(true);
      setBlad(null);
      try {
        const odpowiedz = await executeDomainOperation(activeCaseId, 'set_object_state', {
          ...opis.payload,
          stan_obiektu: stan,
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
    [activeCaseId, bladStore, executeDomainOperation, opis.payload],
  );

  const nieaktywny = activeCaseId === null || zapis;
  return (
    <section data-testid="stan-obiektu-elementu" className="border-t border-scada-border p-3 text-xs">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
        Stan obiektu
      </h3>
      <p className="mt-1 text-scada-muted">
        Aparat istniejący w sieci może zawierać SF₆ (serwis i przeniesienie); aparat projektowany
        wymaga wykonania bez gazów fluorowanych.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span>{opis.etykieta}:</span>
        <span
          data-testid="stan-obiektu-elementu-wartosc"
          data-stan={opis.stan ?? ''}
          className="font-medium text-scada-text"
        >
          {nazwaStanuObiektuPl(opis.stan)}
        </span>
        {STANY.filter((stan) => stan !== opis.stan).map((stan) => (
          <button
            key={stan}
            type="button"
            disabled={nieaktywny}
            data-testid={`stan-obiektu-elementu-ustaw-${stan}`}
            className="rounded border border-scada-accent px-2 py-0.5 text-scada-accent disabled:opacity-50"
            onClick={() => void ustaw(stan)}
          >
            Oznacz jako {NAZWY_STANOW_OBIEKTU_PL[stan]}
          </button>
        ))}
      </div>
      {opis.uwaga ? (
        <p data-testid="stan-obiektu-elementu-uwaga" className="mt-1 text-scada-muted">
          {opis.uwaga}
        </p>
      ) : null}
      {blad ? (
        <p data-testid="stan-obiektu-elementu-blad" role="alert" className="mt-2 text-sygnal-uwaga-tusz">
          {blad}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Edytor stanu obiektu dla celu rozstrzygniętego z modelu — pole: `EdytorStanuObiektuPola`,
 * aparat albo łącznik: `EdytorStanuObiektuElementu`. Jedno wejście dla inspektora schematu
 * i formularza operacji.
 */
export function EdytorStanuObiektu({
  cel,
  pola,
  activeCaseId,
  executeDomainOperation,
  bladStore,
}: {
  readonly cel: CelStanuObiektu;
  readonly pola: readonly Bay[];
  readonly activeCaseId: string | null;
  readonly executeDomainOperation: WykonanieOperacji;
  readonly bladStore?: () => string | null;
}): JSX.Element {
  if (cel.rodzaj === 'pole') {
    return (
      <EdytorStanuObiektuPola
        bay={cel.bay}
        activeCaseId={activeCaseId}
        executeDomainOperation={executeDomainOperation}
        bladStore={bladStore}
      />
    );
  }
  return (
    <EdytorStanuObiektuElementu
      cel={cel}
      pola={pola}
      activeCaseId={activeCaseId}
      executeDomainOperation={executeDomainOperation}
      bladStore={bladStore}
    />
  );
}

const bladMagazynu = () => useSnapshotStore.getState().error;

/**
 * Sekcja stanu obiektu w inspektorze obiektu schematu (pole, aparat pola, łącznik poza polem) —
 * edytor podłączony do migawki modelu i wykonawcy operacji domenowych. `null` dla obiektu bez
 * stanu obiektu.
 */
export function StanObiektuWInspektorze({ elementRef }: { readonly elementRef: string | null }): JSX.Element | null {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const cel = useMemo(() => celStanuObiektu(snapshot, elementRef), [snapshot, elementRef]);
  if (!cel) return null;
  return (
    <div data-testid="inspektor-stan-obiektu">
      <EdytorStanuObiektu
        cel={cel}
        pola={snapshot?.bays ?? []}
        activeCaseId={activeCaseId}
        executeDomainOperation={executeDomainOperation}
        bladStore={bladMagazynu}
      />
    </div>
  );
}

function napisKontekstu(wartosc: unknown): string | null {
  return typeof wartosc === 'string' && wartosc.trim() ? wartosc.trim() : null;
}

/**
 * Formularz operacji `set_object_state` z rejestru formularzy (`OPERATION_FORM_REGISTRY`):
 * cel z kontekstu otwarcia — `device_ref` (aparat pola), `bay_ref` (pole), `switch_ref`
 * (łącznik) albo `element_ref` (akcja naprawcza gotowości) — ten sam edytor co karta pola
 * i inspektor schematu.
 */
export function FormularzStanuObiektu(): JSX.Element {
  const kontekst = useActiveOperationContext();
  const zamknij = useNetworkBuildStore((s) => s.closeOperationForm);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const ref =
    napisKontekstu(kontekst?.device_ref)
    ?? napisKontekstu(kontekst?.bay_ref)
    ?? napisKontekstu(kontekst?.switch_ref)
    ?? napisKontekstu(kontekst?.element_ref);
  const cel = useMemo(() => celStanuObiektu(snapshot, ref), [snapshot, ref]);
  return (
    <div data-testid="formularz-stan-obiektu" className="flex flex-col gap-2 p-3 text-xs">
      {cel ? (
        <EdytorStanuObiektu
          cel={cel}
          pola={snapshot?.bays ?? []}
          activeCaseId={activeCaseId}
          executeDomainOperation={executeDomainOperation}
          bladStore={bladMagazynu}
        />
      ) : (
        <p data-testid="formularz-stan-obiektu-brak" role="alert">
          Wskazany obiekt nie ma stanu obiektu — stan istniejący albo projektowany mają pola
          rozdzielnicy, ich aparaty i łączniki (bezpiecznik i odcinek nie).
        </p>
      )}
      <div>
        <button type="button" className="mvd-btn" data-testid="formularz-stan-obiektu-zamknij" onClick={zamknij}>
          Zamknij
        </button>
      </div>
    </div>
  );
}
