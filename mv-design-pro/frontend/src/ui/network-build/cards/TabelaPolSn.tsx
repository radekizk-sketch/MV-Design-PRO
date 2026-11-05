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
 * (w GPZ także odwołania sekcji `left/right_coupler_ref`). Wiersz pola sprzęgła i nagłówek sekcji
 * (sprzęgło bez pola — budowa GPZ) mówią to samo zdanie z jednego źródła (`opisSprzegla`):
 * „Sprzęgło z sekcją 2 · normalnie otwarte”, stan normalny z modelu.
 *
 * Wiersz pola (kontrakt prezentacji §10, KD6 — każda informacja ma znaczenie i akcję): odejście
 * (odcinek i stacja docelowa), aparat główny (pozycja katalogu) i zabezpieczenie (kody funkcji
 * sterownika) z modelu (`pozycjeOpisuPola`). Brak jest nazwany („Bez odejścia”, „Aparat
 * nieprzypisany”, „Brak sterownika”) i jest przyciskiem, który otwiera kartę pola E-11 — to samo
 * wejście co „Konfiguruj” — z fokusem na miejscu, które brak naprawia.
 */

import { useMemo, useState } from 'react';

import type { Bay, EnergyNetworkModel } from '../../../types/enm';
import { useActiveCaseId } from '../../app-state/store';
import { fieldRoleLabelPl } from '../../sld/v2/station-rozdzielnia/contract';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useFieldReadModel } from '../../field/useFieldReadModel';
import { useNetworkBuildStore } from '../networkBuildStore';
import { ROLE_OPCJE, type RolaPola } from '../../../ui2/kreatory/pole/polaSnModel';
import { OpisPolaSnWiersze } from './OpisPolaSnWiersze';
import {
  czyPotrzebneNazwyKatalogu,
  lacznikSprzeglaPola,
  opisSprzegla,
  pozycjeOpisuPola,
  type FokusPola,
} from './opisPolaSn';
import { useNazwyKatalogowSn } from './useNazwyKatalogowSn';

export interface SekcjaTabeliPol {
  /** Szyna sekcji (pola sekcji = pola tej stacji na tej szynie). */
  readonly busRef: string;
  readonly etykieta: string;
  /** Sekcja GPZ (`GPZSection.section_id`) — kontekst kreatora pola; `undefined` dla stacji SN/nN. */
  readonly gpzSectionId?: string;
  /** Łączniki sprzęgieł sekcji z modelu (`left/right_coupler_ref`) — opis w nagłówku sekcji. */
  readonly sprzeglaRefs?: readonly string[];
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
  const sprzeglo = lacznikSprzeglaPola(snapshot, pole);
  if (!sprzeglo) return 'Pole sprzęgła bez łącznika sprzęgła w modelu';
  return opisSprzegla(snapshot, sprzeglo, pole.bus_ref, sekcje);
}

/**
 * Sprzęgła w nagłówku sekcji: łączniki z `sprzeglaRefs`, których nie pokazuje już wiersz pola
 * sprzęgła tej sekcji (jedno zdanie raz, w miejscu pola, a bez pola — w nagłówku).
 */
export function sprzeglaNaglowkaSekcji(
  snapshot: EnergyNetworkModel | null,
  sekcja: SekcjaTabeliPol,
  polaTejSekcji: readonly Bay[],
  sekcje: readonly SekcjaTabeliPol[],
): { readonly ref: string; readonly opis: string }[] {
  const wPolach = new Set(
    polaTejSekcji.filter((p) => p.bay_role === 'COUPLER').flatMap((p) => p.equipment_refs ?? []),
  );
  const galezie = snapshot?.branches ?? [];
  return (sekcja.sprzeglaRefs ?? [])
    .filter((ref) => !wPolach.has(ref))
    .map((ref) => {
      const galaz = galezie.find((g) => g.ref_id === ref);
      return {
        ref,
        opis: galaz
          ? opisSprzegla(snapshot, galaz, sekcja.busRef, sekcje)
          : 'Sprzęgło sekcji wskazane przez sekcję nie występuje w modelu',
      };
    });
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

const TEKST = 'text-[length:var(--mvd-font-size-data)]';
const PRZYCISK = `rounded border border-scada-border px-1.5 py-0.5 ${TEKST} text-scada-text hover:bg-scada-surface`;
const POLE_WYBORU = `rounded border border-scada-border bg-scada-surface px-1 py-0.5 ${TEKST} text-scada-text`;

export function TabelaPolSn({ stationRef, sekcje }: TabelaPolSnProps): JSX.Element {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useActiveCaseId();
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  // Aparaty pierwotne z MODELU POLA (backend składa je z rekordu pola albo łączników gałęzi).
  const { itemsByBayRef } = useFieldReadModel();
  const urzadzeniaPola = (pole: Bay) =>
    itemsByBayRef.get(pole.ref_id)?.canonical_model.base_model.primary_devices ?? null;

  const [rolaNowego, setRolaNowego] = useState<Record<string, RolaPola>>({});
  const [doUsuniecia, setDoUsuniecia] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);


  /** Brak w wierszu → karta pola E-11 (wejście „Konfiguruj”) z fokusem na miejscu naprawy. */
  const otworzKartePola = (pole: Bay, fokus?: FokusPola) =>
    openRouteSurface('E-11', {
      entityRef: pole.ref_id,
      subjectKind: 'helper_context',
      ...(fokus ? { payload: { fokus } } : {}),
    });

  const polaWgSekcji = useMemo(
    () => sekcje.map((s) => ({ sekcja: s, pola: polaSekcji(snapshot, stationRef, s.busRef) })),
    [sekcje, snapshot, stationRef],
  );

  // Nazwy wyrobów z katalogu backendu (rodzina rozdzielnicy, aparat pola) — w UI nie ma identyfikatorów.
  const nazwyWyrobow = useNazwyKatalogowSn(
    czyPotrzebneNazwyKatalogu(polaWgSekcji.flatMap((s) => s.pola), urzadzeniaPola),
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
          {sprzeglaNaglowkaSekcji(snapshot, sekcja, pola, sekcje).map((s) => (
            <p key={s.ref} data-testid={`tabela-pol-sn-sprzeglo-sekcji-${sekcja.busRef}`}
              data-sprzeglo-ref={s.ref} className="mt-0.5 text-scada-text">
              {s.opis}
            </p>
          ))}
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
                  return (
                    <tr
                      key={pole.ref_id}
                      data-testid={`tabela-pol-sn-wiersz-${pole.ref_id}`}
                      className="border-b border-scada-border align-top"
                    >
                      <td className="mvd-num w-6 py-1 pr-1 text-scada-muted">{i + 1}</td>
                      <td className="py-1 pr-1">
                        <div className="text-scada-text">{pole.name || 'Pole bez nazwy'}</div>
                        <div data-testid={`tabela-pol-sn-rola-pola-${pole.ref_id}`} className="text-scada-muted">
                          {fieldRoleLabelPl(pole.field_role ?? pole.bay_role)}
                        </div>
                        <OpisPolaSnWiersze
                          pozycje={pozycjeOpisuPola(snapshot, pole, urzadzeniaPola(pole), nazwyWyrobow)}
                          prefiks="tabela-pol-sn"
                          poleRef={pole.ref_id}
                          onNapraw={(fokus) => otworzKartePola(pole, fokus)}
                        />
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
                              onClick={() => otworzKartePola(pole)}
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
