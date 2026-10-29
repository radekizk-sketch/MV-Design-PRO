/**
 * Powierzchnia „Pole SN" (ekran E-11) — karta pola z JEDNEGO modelu pola.
 *
 * Treść karty pochodzi z tego samego modelu odczytu co karta pola w inspektorze
 * (`GET /api/cases/{id}/enm/field-view`, `useFieldReadModel`) i jest składana TĄ SAMĄ funkcją
 * (`buildBaySections`), więc powierzchnia i inspektor nie mogą się rozjechać: aparaty pierwotne
 * (także złożone z łączników gałęzi), tor pomiarowy, zabezpieczenie, uzależnienia, wyniki
 * projektowe i wywód pola, katalog producenta (`useKatalogPola`) i jawne zaciski `Bay.ports`.
 * Schemat pola to wycinek rysunku kanwy z tej samej migawki ENM (`SchematPolaSn`).
 *
 * Karta W5-C: wyposażenie pola SN (aparaty pierwotne) ustawia tu `EdytorWyposazeniaPola` —
 * jedyny dostawca operacji `set_bay_equipment` (katalog / szablon pola / usunięcie), ze
 * stanem danych i danymi przyjętymi z modelu odczytu pola. Pole nN ma własne operacje
 * rozdzielnicy nN — edytora SN dla niego nie ma (backend odmówiłby `bay_equipment.bay_not_mv`).
 * Obwody wtórne przekładników pola (CT/VT z `bay_ref` pola) poprawia `EdytorObwoduWtornegoPola`
 * — jedyny dostawca operacji `set_measurement_secondary_circuit`. Pole liniowe GPZ pokazuje ocenę
 * wg klasy pola z modelu odczytu (`ocena_pola_liniowego`, `OcenaPolaLiniowegoGpz`).
 *
 * Korekta 2026-10-15: dawna powierzchnia renderowała pusty szkielet ośmiu zakładek z tekstem
 * zastępczym i oceniała pole regułami frontu na kontekście DOPISANYM w przeglądarce (rola
 * domyślna „OUT", sekcje sprzęgła `SEC-1/SEC-2`, „pole rezerwowe" przy braku pola) — werdykt
 * „pole zgodne z regułami" bez podstawy w modelu. Skasowana razem z tamtym kontekstem.
 */
import { useMemo } from 'react';

import { EdytorObwoduWtornegoPola } from '../../field/EdytorObwoduWtornegoPola';
import { EdytorStanuObiektuPola } from '../../field/EdytorStanuObiektuPola';
import { EdytorWyposazeniaPola } from '../../field/EdytorWyposazeniaPola';
import { OcenaPolaLiniowegoGpz } from '../../field/OcenaPolaLiniowegoGpz';
import { SchematPolaSn } from '../../field/SchematPolaSn';
import { useFieldReadModel } from '../../field/useFieldReadModel';
import { useKatalogPola } from '../../field/useKatalogPola';
import { buildBaySections, SectionBlock } from '../../network-build/InspectorEngineeringView';
import { useAppStateStore } from '../../app-state';
import { czyPoleNn } from '../../shared/polaStacji';
import { fieldRoleLabelOrNullPl } from '../../sld/v2/station-rozdzielnia/contract';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useProblemyGotowosci } from '../../../ui2/spaces/gotowosc/adapters/gotowoscAdapter';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface BayConfiguratorSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

export function BayConfiguratorSurface({ surface }: BayConfiguratorSurfaceProps): JSX.Element {
  const bayRef = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const readinessIssues = useProblemyGotowosci();
  const { itemsByBayId, itemsByBayRef, isLoading, error } = useFieldReadModel();

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
  const { sections } = useMemo(
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
  const roleLabel = item
    ? fieldRoleLabelOrNullPl(item.canonical_model.base_model.bay_role)
    : null;

  return (
    <div data-testid="bay-configurator-surface" className="flex h-full w-full flex-col p-4">
      <div className="mb-3">
        <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-scada-muted">
          Karta pola SN
        </div>
        <h2 className="mt-1 text-base font-semibold text-scada-text">{bayName}</h2>
        {roleLabel && <p className="mt-0.5 text-[length:var(--mvd-font-size-data)] text-scada-muted">{roleLabel}</p>}
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
          // UX-04 (pomiar 2026-10-29, okno 1600 px): siatka dwóch kolumn wg progu OKNA
          // (`xl:`) zostawiała karcie ~570 px między nawigatorem a inspektorem — tabela
          // wymagań łamała podstawę normową po 2–3 słowa, a kolumna schematu pod nim
          // była pusta. Jedna kolumna: schemat pola na górze, sekcje na pełną szerokość.
          className="flex flex-1 flex-col gap-3 overflow-auto rounded border border-scada-border bg-white"
        >
          {item && (
            <div className="min-w-0">
              <SchematPolaSn item={item} snapshot={snapshot} />
            </div>
          )}
          <div className="min-w-0">
            {sections.map((section, index) => (
              <SectionBlock
                key={`${section.id}:${index}`}
                section={section}
                elementId={bayRef}
                activeCaseId={activeCaseId}
                executeDomainOperation={executeDomainOperation}
              />
            ))}
            {item?.ocena_pola_liniowego ? <OcenaPolaLiniowegoGpz ocena={item.ocena_pola_liniowego} /> : null}
            {bayInModel && !czyPoleNn(snapshot, bayInModel) ? (
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
            ) : null}
            {bayInModel ? (
              <EdytorStanuObiektuPola
                bay={bayInModel}
                activeCaseId={activeCaseId}
                executeDomainOperation={executeDomainOperation}
                bladStore={() => useSnapshotStore.getState().error}
              />
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
          </div>
        </div>
      )}
    </div>
  );
}

export default BayConfiguratorSurface;
