/**
 * Powierzchnia „Pole SN" (ekran E-11) — karta pola z JEDNEGO modelu pola.
 *
 * Treść karty pochodzi z tego samego modelu odczytu co karta pola w inspektorze
 * (`GET /api/cases/{id}/enm/field-view`, `useFieldReadModel`) i jest składana TĄ SAMĄ funkcją
 * (`buildBaySections`), więc powierzchnia i inspektor nie mogą się rozjechać: aparaty pierwotne
 * (także złożone z łączników gałęzi), tor pomiarowy, zabezpieczenie, uzależnienia, wyniki
 * projektowe i wywód pola, katalog producenta (`useKatalogPola`) i jawne zaciski `Bay.ports`.
 *
 * Standard warsztatu KD6 (kontrakt prezentacji §10, karta KARTA-POLA-KD6): karta odpowiada na
 * trzy pytania inżyniera — co stoi w polu (karta techniczna pola K6, ta sama co w inspektorze:
 * tabela aparatów z typem i znamionami, zabezpieczenie z funkcjami, przekładniki z przekładnią),
 * czego brakuje (jedna lista braków z akcją — `PowiazaniaPola`) i jakie są wyniki pola. Sekcje
 * modelu odczytu, których K6 nie niesie (katalog producenta, stan ruchowy, zaciski, sterowanie,
 * wyniki), idą przez `SectionBlock`: jednakowe braki zwinięte do jednego wiersza
 * (`zwijanieBrakow`). Identyfikatory techniczne — w `InformacjeAudytowe` (tryb ekspercki).
 * Dawna miniatura „Schemat kanoniczny” (stałe kolory, ucięty podpis, powtórzenie nazwy i roli,
 * jeden kwadrat aparatu) skasowana — tabela aparatów mówi więcej w mniejszym miejscu.
 *
 * Karta W5-C: wyposażenie pola SN (aparaty pierwotne) ustawia tu `EdytorWyposazeniaPola` —
 * jedyny dostawca operacji `set_bay_equipment` (katalog / szablon pola / usunięcie), ze
 * stanem danych i danymi przyjętymi z modelu odczytu pola. Pole nN ma własne operacje
 * rozdzielnicy nN — edytora SN dla niego nie ma (backend odmówiłby `bay_equipment.bay_not_mv`).
 * Obwody wtórne przekładników pola (CT/VT z `bay_ref` pola) poprawia `EdytorObwoduWtornegoPola`
 * — jedyny dostawca operacji `set_measurement_secondary_circuit`.
 *
 * Powiązania pola (`PowiazaniaPola`): odejście, aparat główny i zabezpieczenie z modelu, brak
 * z akcją naprawczą. Wejście „Konfiguruj” z tabeli pól GPZ niesie fokus (`payload.fokus`):
 * „aparat” przewija do edytora wyposażenia, „odejście”/„zabezpieczenie” do powiązań pola.
 *
 * Korekta 2026-10-15: dawna powierzchnia renderowała pusty szkielet ośmiu zakładek z tekstem
 * zastępczym i oceniała pole regułami frontu na kontekście DOPISANYM w przeglądarce (rola
 * domyślna „OUT", sekcje sprzęgła `SEC-1/SEC-2`, „pole rezerwowe" przy braku pola) — werdykt
 * „pole zgodne z regułami" bez podstawy w modelu. Skasowana razem z tamtym kontekstem.
 */
import { useCallback, useMemo, useRef } from 'react';

import { EdytorObwoduWtornegoPola } from '../../field/EdytorObwoduWtornegoPola';
import { EdytorWyposazeniaPola } from '../../field/EdytorWyposazeniaPola';
import { useFieldReadModel } from '../../field/useFieldReadModel';
import { useKatalogPola } from '../../field/useKatalogPola';
import { buildBaySections, SectionBlock } from '../../network-build/InspectorEngineeringView';
import { fokusZLadunku, PowiazaniaPola } from '../../network-build/cards/PowiazaniaPola';
import { KartaTechnicznaElementu } from '../../network-build/inspektor-elementu/KartaTechnicznaElementu';
import { useKatalogiKarty } from '../../network-build/inspektor-elementu/katalogiKarty';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { czyPoleNn } from '../../shared/polaStacji';
import { buildKartaTechnicznaPola, type EdycjaWiersza, type KartaTechniczna } from '../../sld/shared/kartaTechnicznaElementu';
import { fieldRoleLabelOrNullPl } from '../../sld/v2/station-rozdzielnia/contract';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useProblemyGotowosci } from '../../../ui2/spaces/gotowosc/adapters/gotowoscAdapter';
import { InformacjeAudytowe } from '../../../ui2/wyniki/wzorzec/InformacjeAudytowe';
import { useShellStore } from '../../../ui2/shell/useShellStore';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface BayConfiguratorSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

/** Sekcje modelu odczytu pola, które niesie karta techniczna K6 (identyfikacja, aparaty z typem
 *  i znamionami, tor pomiarowy z przekładniami, zabezpieczenie z funkcjami) — na karcie pola
 *  pokazane raz, w K6. */
export const SEKCJE_POLA_W_KARCIE_K6: ReadonlySet<string> = new Set(['ident', 'devices', 'measurements', 'protection']);

/**
 * Karta K6 pola bez wierszy powtarzających nagłówek karty (nazwa, rola). Wiersz nazwy zostaje
 * w trybie edycji modelu — niesie wtedy akcję „Zmień” (zmiana nazwy pola), nie samą powtórkę.
 */
export function kartaPolaBezNaglowka(karta: KartaTechniczna, edycjaNazwy: boolean): KartaTechniczna {
  const zbedne = new Set(edycjaNazwy ? ['rola'] : ['nazwa', 'rola']);
  return {
    ...karta,
    sekcje: karta.sekcje.map((sekcja) =>
      sekcja.id === 'identyfikacja'
        ? { ...sekcja, wiersze: sekcja.wiersze.filter((w) => !zbedne.has(w.klucz)) }
        : sekcja,
    ),
  };
}

export function BayConfiguratorSurface({ surface }: BayConfiguratorSurfaceProps): JSX.Element {
  const bayRef = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeMode = useAppStateStore((state) => state.activeMode);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const szczegolyAudytowe = useShellStore((state) => state.szczegolyAudytowe);
  const readinessIssues = useProblemyGotowosci();
  const { itemsByBayId, itemsByBayRef, isLoading, error } = useFieldReadModel();
  const katalogiKarty = useKatalogiKarty();

  const bayInModel = useMemo(
    () => (bayRef
      ? snapshot?.bays?.find((bay) => bay.id === bayRef || bay.ref_id === bayRef) ?? null
      : null),
    [snapshot, bayRef],
  );
  const item = useMemo(() => {
    if (!bayRef) return null;
    return itemsByBayId.get(bayRef)
      ?? itemsByBayRef.get(bayRef)
      ?? (bayInModel
        ? itemsByBayId.get(bayInModel.id) ?? itemsByBayRef.get(bayInModel.ref_id) ?? null
        : null);
  }, [bayRef, bayInModel, itemsByBayId, itemsByBayRef]);

  const katalog = useKatalogPola(
    item?.canonical_model.base_model.bay_template_ref,
    item?.canonical_model.base_model.switchgear_family_ref,
  );
  const bayName = item?.bay_name ?? bayInModel?.name ?? bayRef ?? 'Pole SN';
  const { sections, audyt } = useMemo(
    () => buildBaySections(
      item,
      isLoading,
      error,
      readinessIssues,
      bayRef ?? '',
      bayName,
      katalog,
      bayInModel?.ports ?? null,
    ),
    [item, isLoading, error, readinessIssues, bayRef, bayName, katalog, bayInModel],
  );
  const edycjaModelu = activeMode === 'MODEL_EDIT';
  const kartaK6 = useMemo(() => {
    const karta = bayInModel ? buildKartaTechnicznaPola(snapshot, bayInModel.ref_id, katalogiKarty) : null;
    return karta ? kartaPolaBezNaglowka(karta, edycjaModelu) : null;
  }, [bayInModel, edycjaModelu, katalogiKarty, snapshot]);
  // Sekcje niesione przez K6 pokazane raz — w K6; bez K6 (pole spoza migawki) zostają.
  const sekcjePozaK6 = useMemo(
    () => (kartaK6 ? sections.filter((s) => !SEKCJE_POLA_W_KARCIE_K6.has(s.id)) : sections),
    [kartaK6, sections],
  );
  const edytuj = useCallback(
    (edycja: EdycjaWiersza) =>
      openOperationForm('update_element_parameters', {
        element_ref: edycja.elementRef,
        field: edycja.parametr,
        value: edycja.wartosc,
        source: 'karta_pola',
      }),
    [openOperationForm],
  );
  const fokus = fokusZLadunku(surface.routeState?.payload);
  const wyposazenie = useRef<HTMLDivElement | null>(null);
  const przejdzDoWyposazenia = useCallback(() => {
    const edytor = wyposazenie.current;
    edytor?.scrollIntoView?.({ block: 'start' });
    edytor?.querySelector<HTMLElement>('select, input, button')?.focus({ preventScroll: true });
  }, []);
  const poleSn = bayInModel !== null && !czyPoleNn(snapshot, bayInModel);
  const roleLabel = item
    ? fieldRoleLabelOrNullPl(item.canonical_model.base_model.bay_role)
    : null;

  return (
    <div data-testid="bay-configurator-surface" className="flex h-full w-full flex-col p-4">
      <div className="mb-2">
        <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-scada-muted">
          Karta pola SN
        </div>
        <h2 className="mt-0.5 text-base font-semibold text-scada-text">{bayName}</h2>
        {roleLabel && <p className="text-[length:var(--mvd-font-size-data)] text-scada-muted">{roleLabel}</p>}
      </div>
      {!bayRef ? (
        <p
          data-testid="bay-card-no-ref"
          className="rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-3 text-[length:var(--mvd-font-size-data)] text-sygnal-uwaga-tusz"
        >
          Brak referencji do pola SN w kontekście. Wybierz pole z lewego nawigatora
          modelu lub kliknij pole w SLD i wybierz &quot;Otwórz kartę pola&quot;.
        </p>
      ) : snapshot && !bayInModel && !item && !isLoading ? (
        <p
          data-testid="bay-card-missing"
          className="rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-3 text-[length:var(--mvd-font-size-data)] text-sygnal-uwaga-tusz"
        >
          Wskazane pole nie występuje w modelu sieci. Wybierz istniejące pole z nawigatora modelu.
        </p>
      ) : (
        <div
          data-testid="bay-card-sections"
          className="min-w-0 max-w-[960px] flex-1 overflow-auto rounded border border-scada-border bg-scada-surface"
        >
          {bayInModel && poleSn ? (
            <PowiazaniaPola
              bay={bayInModel}
              snapshot={snapshot}
              urzadzenia={item?.canonical_model.base_model.primary_devices ?? null}
              fokus={fokus}
              onPrzejdzDoWyposazenia={przejdzDoWyposazenia}
            />
          ) : null}
          {kartaK6 ? (
            <div data-testid="karta-pola-k6" className="border-b border-scada-border">
              <KartaTechnicznaElementu karta={kartaK6} onEdytuj={edycjaModelu ? edytuj : null} />
            </div>
          ) : null}
          {sekcjePozaK6.map((section, index) => (
            <SectionBlock
              key={`${section.id}:${index}`}
              section={section}
              elementId={bayRef}
              activeCaseId={activeCaseId}
              executeDomainOperation={executeDomainOperation}
            />
          ))}
          {bayInModel && poleSn ? (
            <div
              ref={wyposazenie}
              data-testid="karta-pola-wyposazenie"
              data-wyroznione={fokus === 'aparat' ? 'true' : undefined}
              className={fokus === 'aparat' ? 'outline outline-1 outline-scada-sn' : undefined}
            >
              <EdytorWyposazeniaPola
                key={bayInModel.ref_id}
                bay={bayInModel}
                snapshot={snapshot}
                stanDanych={item?.canonical_model.base_model.equipment_data_state ?? null}
                danePrzyjete={item?.canonical_model.base_model.equipment_assumed_data ?? []}
                activeCaseId={activeCaseId}
                executeDomainOperation={executeDomainOperation}
                bladStore={() => useSnapshotStore.getState().error}
              />
            </div>
          ) : null}
          {bayInModel ? (
            <EdytorObwoduWtornegoPola
              bayRef={bayInModel.ref_id}
              snapshot={snapshot}
              activeCaseId={activeCaseId}
              executeDomainOperation={executeDomainOperation}
              bladStore={() => useSnapshotStore.getState().error}
            />
          ) : null}
          <InformacjeAudytowe wiersze={audyt} szczegolyAudytowe={szczegolyAudytowe} testid="karta-pola-informacje-audytowe" />
        </div>
      )}
    </div>
  );
}

export default BayConfiguratorSurface;
