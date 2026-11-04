/**
 * Tabela pól SN rozdzielnicy — wspólny komponent konfiguratorów (karta KATALOG-PRZEJECIE-PR,
 * decyzja architekta: „Pola SN" zamiast bilansu liczników).
 *
 * Każdy wiersz jest polem Z MODELU (`snapshot.bays`, pola TEJ stacji na szynie sekcji, w kolejności
 * danych — tej samej, w której backend układa pola rozdzielnicy). Każda akcja jest istniejącą
 * operacją albo istniejącym ekranem, bez nowych formularzy:
 *  - „Dodaj pole" z wyborem roli → kreator `add_sn_bay` (`KreatorPolaSn`) z podstawioną szyną,
 *    stacją, sekcją GPZ i rolą (szablon producenta wybiera się w kreatorze);
 *  - „Konfiguruj" → karta pola E-11 (`BayConfiguratorSurface`: wyposażenie `set_bay_equipment`,
 *    przekładniki, zabezpieczenia) — ta sama nawigacja co pozycja menu SLD „open-bay";
 *  - „Usuń" → `delete_element` (aparat pola i jego zacisk znikają razem z polem; pole z elementem
 *    na zacisku albo wskazywane przez inny element backend odmawia — komunikat w tabeli);
 *  - pole baterii kondensatorów (BKR) i zespołu uziemiającego (ZU): powiązany obiekt z modelu
 *    (bateria na zacisku pola / zespół wskazujący pole) albo akcja jego dodania istniejącym
 *    kreatorem (`add_shunt_compensator_sn` na zacisku pola, `add_zespol_uziemiajacy_sn`
 *    z `bay_ref`).
 *
 * Rola „Pole sprzęgła" jest oferowana przy co najmniej dwóch sekcjach: kreator dostaje szynę sekcji
 * sąsiedniej (`coupled_bus_ref`) i stan normalny; sekcję po drugiej stronie i stan zmienia się
 * w kreatorze. `add_sn_bay` z rolą sprzęgła tworzy łącznik `bus_coupler` między szynami sekcji
 * (w GPZ także odwołania sekcji `left/right_coupler_ref`). Wiersz pola sprzęgła pokazuje sekcję
 * po drugiej stronie i stan normalny; sprzęgło bez pola (budowa GPZ) pokazuje nagłówek sekcji.
 */

import { useEffect, useMemo, useState } from 'react';

import type { Bay, EnergyNetworkModel } from '../../../types/enm';
import { useActiveCaseId } from '../../app-state/store';
import { fetchMvApparatusTypes, fetchSwitchgearFamilies } from '../../catalog/api';
import { STAN_DANYCH_WYPOSAZENIA_PL } from '../../field/wyposazeniePola';
import { useFieldReadModel } from '../../field/useFieldReadModel';
import { MISSING_DASH } from '../../shared/formatPolishValue';
import { fieldRoleLabelPl } from '../../sld/v2/station-rozdzielnia/contract';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { ROLE_OPCJE, type RolaPola } from '../../../ui2/kreatory/pole/polaSnModel';

export interface SekcjaTabeliPol {
  /** Szyna sekcji (pola sekcji = pola tej stacji na tej szynie). */
  readonly busRef: string;
  readonly etykieta: string;
  /** Sekcja GPZ (`GPZSection.section_id`) — kontekst kreatora pola; `undefined` dla stacji SN/nN. */
  readonly gpzSectionId?: string;
  /** Sprzęgła sekcji z modelu (opis do nagłówka; bez edycji). */
  readonly sprzegla?: readonly string[];
}

export interface TabelaPolSnProps {
  readonly stationRef: string;
  readonly sekcje: readonly SekcjaTabeliPol[];
}

/** Role oferowane przy dodawaniu pola — lista kreatora; sprzęgło wyłącznie przy ≥ 2 sekcjach. */
export function roleDodawanegoPola(liczbaSekcji: number): readonly { value: RolaPola; label: string }[] {
  return liczbaSekcji >= 2 ? ROLE_OPCJE : ROLE_OPCJE.filter((o) => o.value !== 'COUPLER');
}

/** Sekcja sąsiednia (następna, a dla ostatniej — poprzednia): domyślna druga strona sprzęgła. */
export function sekcjaSasiednia(
  sekcje: readonly SekcjaTabeliPol[],
  busRef: string,
): SekcjaTabeliPol | undefined {
  const i = sekcje.findIndex((s) => s.busRef === busRef);
  if (i < 0) return undefined;
  return sekcje[i + 1] ?? sekcje[i - 1];
}

/** Pola stacji na szynie sekcji w kolejności danych modelu. */
export function polaSekcji(snapshot: EnergyNetworkModel | null, stationRef: string, busRef: string): Bay[] {
  return (snapshot?.bays ?? []).filter((b) => b.substation_ref === stationRef && b.bus_ref === busRef);
}

/** Opis sprzęgła pola sprzęgła z modelu: sekcja po drugiej stronie i stan normalny łącznika. */
export function opisSprzeglaPola(
  snapshot: EnergyNetworkModel | null,
  pole: Bay,
  sekcje: readonly SekcjaTabeliPol[],
): string | null {
  if (pole.bay_role !== 'COUPLER') return null;
  const sprzeglo = (snapshot?.branches ?? []).find(
    (g) => g.type === 'bus_coupler' && (pole.equipment_refs ?? []).includes(g.ref_id),
  );
  if (!sprzeglo || !('from_bus_ref' in sprzeglo)) return 'Brak sprzęgła między sekcjami';
  const druga = sprzeglo.from_bus_ref === pole.bus_ref ? sprzeglo.to_bus_ref : sprzeglo.from_bus_ref;
  const nazwaDrugiej =
    sekcje.find((s) => s.busRef === druga)?.etykieta ??
    (snapshot?.buses ?? []).find((b) => b.ref_id === druga)?.name ??
    'sekcja bez nazwy';
  const stanNormalny = 'normal_state' in sprzeglo ? sprzeglo.normal_state : undefined;
  const stan = (stanNormalny ?? sprzeglo.status) === 'open' ? 'normalnie otwarte' : 'normalnie zamknięte';
  return `Łączy z: ${nazwaDrugiej} · ${stan}`;
}

/** Obiekt fizyczny pola BKR/ZU z modelu: bateria na zacisku pola, zespół wskazujący pole. */
export function obiektPola(
  snapshot: EnergyNetworkModel | null,
  pole: Bay,
): { readonly rodzaj: 'BKR' | 'ZU'; readonly nazwa: string | null } | null {
  if (pole.bay_role === 'BKR') {
    const zacisk = pole.terminal_bus_ref;
    const bateria = zacisk ? (snapshot?.shunt_capacitors ?? []).find((s) => s.bus_ref === zacisk) : undefined;
    return { rodzaj: 'BKR', nazwa: bateria ? bateria.name || 'Bateria kondensatorów' : null };
  }
  if (pole.bay_role === 'ZU') {
    const zespol = (snapshot?.zespoly_uziemiajace ?? []).find((z) => z.bay_ref === pole.ref_id);
    return { rodzaj: 'ZU', nazwa: zespol ? zespol.name || 'Zespół uziemiający' : null };
  }
  return null;
}

/** Skrót stanu danych wyposażenia — pierwsza część etykiety z `STAN_DANYCH_WYPOSAZENIA_PL`. */
function stanWyposazeniaKrotko(pelny: string): string {
  return pelny.split(' — ')[0];
}

const TEKST = 'text-[length:var(--mvd-font-size-data)]';
const PRZYCISK = `rounded border border-scada-border px-1.5 py-0.5 ${TEKST} text-scada-text hover:bg-scada-surface`;
const POLE_WYBORU = `rounded border border-scada-border bg-scada-surface px-1 py-0.5 ${TEKST} text-scada-text`;

export function TabelaPolSn({ stationRef, sekcje }: TabelaPolSnProps): JSX.Element {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useActiveCaseId();
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const { itemsByBayRef } = useFieldReadModel();

  const [rolaNowego, setRolaNowego] = useState<Record<string, RolaPola>>({});
  const [doUsuniecia, setDoUsuniecia] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  // Nazwy wyrobów z katalogu backendu (rodzina rozdzielnicy, aparat pola) — w UI nie ma identyfikatorów.
  const [nazwyWyrobow, setNazwyWyrobow] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let anulowano = false;
    Promise.all([fetchSwitchgearFamilies(), fetchMvApparatusTypes()])
      .then(([rodziny, aparaty]) => {
        if (anulowano) return;
        const mapa = new Map<string, string>();
        for (const r of Array.isArray(rodziny) ? rodziny : []) mapa.set(r.switchgear_family_ref, r.family_name);
        for (const a of Array.isArray(aparaty) ? aparaty : []) mapa.set(a.id, a.name);
        setNazwyWyrobow(mapa);
      })
      .catch(() => {
        if (!anulowano) setNazwyWyrobow(new Map());
      });
    return () => {
      anulowano = true;
    };
  }, []);

  const wyrob = (pole: Bay): string => {
    const rodzina = pole.switchgear_family_ref ? nazwyWyrobow.get(pole.switchgear_family_ref) : undefined;
    const aparat = pole.apparatus_catalog_ref ? nazwyWyrobow.get(pole.apparatus_catalog_ref) : undefined;
    return rodzina ?? aparat ?? MISSING_DASH;
  };

  const polaWgSekcji = useMemo(
    () => sekcje.map((s) => ({ sekcja: s, pola: polaSekcji(snapshot, stationRef, s.busRef) })),
    [sekcje, snapshot, stationRef],
  );

  const roleDodawania = roleDodawanegoPola(sekcje.length);

  const dodajPole = (sekcja: SekcjaTabeliPol) => {
    const rola = rolaNowego[sekcja.busRef] ?? roleDodawania[0].value;
    const sasiednia = rola === 'COUPLER' ? sekcjaSasiednia(sekcje, sekcja.busRef) : undefined;
    openOperationForm('add_sn_bay', {
      bus_ref: sekcja.busRef,
      station_ref: stationRef,
      ...(sekcja.gpzSectionId ? { gpz_section_id: sekcja.gpzSectionId } : {}),
      bay_role: rola,
      ...(sasiednia ? { coupled_bus_ref: sasiednia.busRef, coupler_normal_state: 'closed' } : {}),
    });
  };

  const dodajObiekt = (pole: Bay, rodzaj: 'BKR' | 'ZU') => {
    if (rodzaj === 'BKR') {
      const szyna = (snapshot?.buses ?? []).find((b) => b.ref_id === pole.terminal_bus_ref);
      openOperationForm('add_shunt_compensator_sn', {
        bus_ref: pole.terminal_bus_ref ?? undefined,
        bus_name: pole.name,
        ...(typeof szyna?.voltage_kv === 'number' ? { bus_voltage_kv: szyna.voltage_kv } : {}),
      });
    } else {
      openOperationForm('add_zespol_uziemiajacy_sn', { bay_ref: pole.ref_id, bay_name: pole.name });
    }
  };

  const usun = async (pole: Bay) => {
    setDoUsuniecia(null);
    if (!activeCaseId) {
      setBlad('Zmiana pól wymaga aktywnego zakresu obliczeń.');
      return;
    }
    setBlad(null);
    const odpowiedz = await executeDomainOperation(activeCaseId, 'delete_element', { element_ref: pole.ref_id });
    if (!odpowiedz || odpowiedz.error) setBlad(odpowiedz?.error ?? 'Pole nie zostało usunięte.');
  };

  return (
    <div data-testid="tabela-pol-sn" className={`space-y-3 ${TEKST}`}>
      {blad ? (
        <p data-testid="tabela-pol-sn-blad" className="text-sygnal-blokada-tusz">
          {blad}
        </p>
      ) : null}
      {polaWgSekcji.map(({ sekcja, pola }) => (
        <section key={sekcja.busRef} data-testid={`tabela-pol-sn-sekcja-${sekcja.busRef}`}>
          <div className="space-y-1 border-b border-scada-border pb-1">
            <div className="font-semibold text-scada-text">{sekcja.etykieta}</div>
            <div className="flex items-center gap-1">
              <select
                aria-label={`Rola nowego pola — ${sekcja.etykieta}`}
                data-testid={`tabela-pol-sn-rola-${sekcja.busRef}`}
                className={`${POLE_WYBORU} min-w-0 flex-1`}
                value={rolaNowego[sekcja.busRef] ?? roleDodawania[0].value}
                onChange={(e) => setRolaNowego((p) => ({ ...p, [sekcja.busRef]: e.target.value as RolaPola }))}
              >
                {roleDodawania.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid={`tabela-pol-sn-dodaj-${sekcja.busRef}`}
                className={`${PRZYCISK} shrink-0 whitespace-nowrap`}
                onClick={() => dodajPole(sekcja)}
              >
                Dodaj pole
              </button>
            </div>
          </div>
          {sekcja.sprzegla && sekcja.sprzegla.length > 0 ? (
            <p className="mt-0.5 text-scada-muted">Sprzęgło: {sekcja.sprzegla.join(', ')}</p>
          ) : null}
          {pola.length === 0 ? (
            <p data-testid={`tabela-pol-sn-pusta-${sekcja.busRef}`} className="py-1 text-scada-muted">
              Sekcja nie ma pól w modelu.
            </p>
          ) : (
            <table className="w-full">
              <tbody>
                {pola.map((pole, i) => {
                  const obiekt = obiektPola(snapshot, pole);
                  const sprzeglo = opisSprzeglaPola(snapshot, pole, sekcje);
                  const stan = itemsByBayRef.get(pole.ref_id)?.canonical_model.base_model.equipment_data_state;
                  return (
                    <tr
                      key={pole.ref_id}
                      data-testid={`tabela-pol-sn-wiersz-${pole.ref_id}`}
                      className="border-b border-scada-border align-top"
                    >
                      <td className="mvd-num w-6 py-1 pr-1 text-scada-muted">{i + 1}</td>
                      <td className="py-1 pr-1">
                        <div className="text-scada-text">{pole.name || MISSING_DASH}</div>
                        <div data-testid={`tabela-pol-sn-rola-pola-${pole.ref_id}`} className="text-scada-muted">
                          {fieldRoleLabelPl(pole.field_role ?? pole.bay_role)}
                        </div>
                        <div className="text-scada-muted">
                          {wyrob(pole)}
                          {' · '}
                          <span title={stan ? STAN_DANYCH_WYPOSAZENIA_PL[stan] : undefined}>
                            {stan ? stanWyposazeniaKrotko(STAN_DANYCH_WYPOSAZENIA_PL[stan]) : 'wyposażenie: brak odczytu'}
                          </span>
                        </div>
                        {sprzeglo ? (
                          <div data-testid={`tabela-pol-sn-sprzeglo-${pole.ref_id}`} className="text-scada-text">
                            {sprzeglo}
                          </div>
                        ) : null}
                        {obiekt ? (
                          <div data-testid={`tabela-pol-sn-obiekt-${pole.ref_id}`}>
                            {obiekt.nazwa ? (
                              <span className="text-scada-text">{obiekt.nazwa}</span>
                            ) : (
                              <button
                                type="button"
                                data-testid={`tabela-pol-sn-dodaj-obiekt-${pole.ref_id}`}
                                className={PRZYCISK}
                                onClick={() => dodajObiekt(pole, obiekt.rodzaj)}
                              >
                                {obiekt.rodzaj === 'BKR' ? 'Dodaj baterię kondensatorów' : 'Dodaj zespół uziemiający'}
                              </button>
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-1 text-right">
                        {doUsuniecia === pole.ref_id ? (
                          <span className="inline-flex flex-col items-end gap-1">
                            <span className="text-sygnal-blokada-tusz">Usunąć pole?</span>
                            <span className="inline-flex gap-1">
                              <button
                                type="button"
                                data-testid={`tabela-pol-sn-usun-tak-${pole.ref_id}`}
                                className="rounded border border-sygnal-blokada bg-sygnal-blokada-tlo px-1.5 py-0.5 text-sygnal-blokada-tusz"
                                onClick={() => void usun(pole)}
                              >
                                Tak
                              </button>
                              <button
                                type="button"
                                data-testid={`tabela-pol-sn-usun-nie-${pole.ref_id}`}
                                className={PRZYCISK}
                                onClick={() => setDoUsuniecia(null)}
                              >
                                Nie
                              </button>
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex flex-col items-end gap-1">
                            <button
                              type="button"
                              data-testid={`tabela-pol-sn-konfiguruj-${pole.ref_id}`}
                              className={PRZYCISK}
                              onClick={() =>
                                openRouteSurface('E-11', { entityRef: pole.ref_id, subjectKind: 'helper_context' })}
                            >
                              Konfiguruj
                            </button>
                            <button
                              type="button"
                              data-testid={`tabela-pol-sn-usun-${pole.ref_id}`}
                              className="rounded border border-sygnal-blokada px-1.5 py-0.5 text-sygnal-blokada-tusz hover:bg-sygnal-blokada-tlo"
                              onClick={() => setDoUsuniecia(pole.ref_id)}
                            >
                              Usuń
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}
