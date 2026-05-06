/**
 * Karta 7 — Źródła i magazyny (PV/FV, BESS, FW).
 *
 * Karta pomostowa E-13 ↔ E-21/E-22/E-23. Pokazuje wszystkie DERy przypięte
 * do bieżącej stacji (z `useStationDerStore`) wraz z statusem kompletności,
 * profilami NC RfG, gotowością obliczeń i akcjami nawigacyjnymi.
 *
 * Single source of truth: ten sam StationDerConnection renderuje się tutaj
 * i w E-21/E-22/E-23 — zmiana w jednym miejscu propaguje się do drugiego.
 */

import { useMemo } from 'react';

import { MISSING_DASH } from '../../../shared/formatPolishValue';
import {
  getNcRfgProfile,
  getLvVoltageLevel,
  getConnectionSideLabelPl,
  type StationDerConnection,
} from '../../station-der';

export type AddDerKindRequest = 'PV' | 'BESS' | 'FW';

export interface StationConfigDerSourcesCardProps {
  /** ID stacji (z entityRef surface'u). */
  readonly stationId: string;
  /** Lista DERów przypiętych do stacji (z useStationDerStore). */
  readonly ders: readonly StationDerConnection[];
  /** Otwarcie konfiguratora dla DERa (E-21/E-22/E-23). */
  readonly onOpenDer?: (derId: string, derKind: AddDerKindRequest) => void;
  /** Otwarcie SLD focused na DERze. */
  readonly onShowOnSld?: (derId: string) => void;
  /** Wywołanie kreatora dodawania DERa. */
  readonly onAddDer?: (kind: AddDerKindRequest) => void;
  /** Usunięcie DERa (po potwierdzeniu w UI). */
  readonly onDetachDer?: (derId: string) => void;
}

const KIND_LABEL_PL: Record<AddDerKindRequest, string> = {
  PV: 'PV / FV',
  BESS: 'BESS',
  FW: 'Farma wiatrowa',
};

const KIND_BADGE_COLOR: Record<AddDerKindRequest, string> = {
  PV: 'bg-amber-900 text-amber-200',
  BESS: 'bg-emerald-900 text-emerald-200',
  FW: 'bg-sky-900 text-sky-200',
};

const COMPLETENESS_LABEL_PL: Record<StationDerConnection['completeness'], string> = {
  complete: 'kompletne',
  partial: 'częściowe',
  missing_catalog: 'brak katalogu',
  missing_profile: 'brak profilu',
  voltage_mismatch: 'niezgodność napięcia',
  no_pcc: 'brak PCC',
};

const COMPLETENESS_TONE: Record<StationDerConnection['completeness'], string> = {
  complete: 'text-status-ok',
  partial: 'text-status-warn',
  missing_catalog: 'text-status-error',
  missing_profile: 'text-status-error',
  voltage_mismatch: 'text-status-error',
  no_pcc: 'text-status-error',
};

interface DerRow {
  readonly der: StationDerConnection;
  readonly connectionSidePl: string;
  readonly voltagePl: string;
  readonly profilePl: string;
}

function buildRow(der: StationDerConnection): DerRow {
  const voltage = der.voltage_level_ref ? getLvVoltageLevel(der.voltage_level_ref) : null;
  const profile = der.profiles.nc_rfg_profile_ref
    ? getNcRfgProfile(der.profiles.nc_rfg_profile_ref)
    : null;
  return {
    der,
    connectionSidePl: getConnectionSideLabelPl(der.connection_side),
    voltagePl: voltage ? `${voltage.nominal_kv} kV` : der.connection_side === 'SN' ? 'SN' : MISSING_DASH,
    profilePl: profile?.label_pl ?? MISSING_DASH,
  };
}

export function StationConfigDerSourcesCard(
  props: StationConfigDerSourcesCardProps,
): JSX.Element {
  const { stationId, ders, onOpenDer, onShowOnSld, onAddDer, onDetachDer } = props;

  const rows = useMemo(() => ders.map(buildRow), [ders]);
  const counts = useMemo(() => {
    const pv = ders.filter((d) => d.der_kind === 'PV').length;
    const bess = ders.filter((d) => d.der_kind === 'BESS').length;
    const fw = ders.filter((d) => d.der_kind === 'FW').length;
    return { pv, bess, fw, total: ders.length };
  }, [ders]);

  return (
    <div
      data-testid="station-config-der-sources"
      data-station-id={stationId}
      className="flex flex-col gap-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
            Karta 7 · Źródła i magazyny
          </div>
          <div className="mt-1 text-sm text-scada-text">
            Stacja: <code className="text-scada-sn">{stationId}</code> · {counts.total} DER (PV: {counts.pv} · BESS: {counts.bess} · FW: {counts.fw})
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <AddDerButton kind="PV" onClick={() => onAddDer?.('PV')} />
          <AddDerButton kind="BESS" onClick={() => onAddDer?.('BESS')} />
          <AddDerButton kind="FW" onClick={() => onAddDer?.('FW')} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-scada-border bg-scada-surface p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-widest text-scada-muted">
            Brak źródeł i magazynów
          </div>
          <p className="mt-2 text-xs text-scada-muted">
            Stacja nie ma jeszcze przyłączonych źródeł OZE ani magazynów energii.
            Użyj przycisków powyżej, aby uruchomić kreator dodawania PV/BESS/FW.
            Wszystkie wybory techniczne (urządzenia, transformatory, kable, profile)
            będą pochodzić z katalogów.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-scada-border bg-scada-surface">
          <table className="w-full text-[11px]">
            <thead className="bg-scada-panel-raised">
              <tr className="text-left text-scada-muted">
                <th className="px-2 py-1.5 font-medium">Nazwa</th>
                <th className="px-2 py-1.5 font-medium">Rodzaj</th>
                <th className="px-2 py-1.5 font-medium">Punkt przyłączenia</th>
                <th className="px-2 py-1.5 text-right font-medium">Moc [kW]</th>
                <th className="px-2 py-1.5 font-medium">Napięcie</th>
                <th className="px-2 py-1.5 font-medium">Profil NC RfG</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5 text-right font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ der, connectionSidePl, voltagePl, profilePl }) => (
                <tr
                  key={der.id}
                  data-testid={`der-row-${der.id}`}
                  data-der-kind={der.der_kind}
                  className="border-t border-scada-border hover:bg-scada-hover-nav"
                >
                  <td className="px-2 py-1.5 font-medium text-scada-text">{der.name}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${KIND_BADGE_COLOR[der.der_kind]}`}
                    >
                      {KIND_LABEL_PL[der.der_kind]}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-scada-muted">{connectionSidePl}</td>
                  <td className="px-2 py-1.5 text-right text-scada-text">
                    {der.nominal_power_kw !== null ? der.nominal_power_kw.toFixed(0) : MISSING_DASH}
                  </td>
                  <td className="px-2 py-1.5 text-scada-muted">{voltagePl}</td>
                  <td className="px-2 py-1.5 text-scada-muted">{profilePl}</td>
                  <td className={`px-2 py-1.5 ${COMPLETENESS_TONE[der.completeness]}`}>
                    {COMPLETENESS_LABEL_PL[der.completeness]}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      <RowAction
                        testId={`der-action-open-${der.id}`}
                        title="Otwórz konfigurator DER"
                        onClick={() => onOpenDer?.(der.id, der.der_kind)}
                      >
                        Otwórz
                      </RowAction>
                      <RowAction
                        testId={`der-action-sld-${der.id}`}
                        title="Pokaż na schemacie SLD"
                        onClick={() => onShowOnSld?.(der.id)}
                      >
                        SLD
                      </RowAction>
                      <RowAction
                        testId={`der-action-detach-${der.id}`}
                        title="Odłącz DER (operacja wymaga potwierdzenia)"
                        onClick={() => onDetachDer?.(der.id)}
                        destructive
                      >
                        Usuń
                      </RowAction>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-scada-muted">
        Wszystkie urządzenia, profile i parametry techniczne pochodzą z katalogów.
        Klik wiersza otwiera odpowiedni konfigurator (E-21 dla PV, E-22 dla BESS,
        E-23 dla FW) z zachowaniem kontekstu stacji.
      </p>
    </div>
  );
}

function AddDerButton({ kind, onClick }: { kind: AddDerKindRequest; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={`station-add-der-${kind.toLowerCase()}`}
      onClick={onClick}
      className="rounded border border-scada-border bg-scada-panel px-3 py-1.5 text-xs font-medium text-scada-text hover:border-scada-sn hover:bg-scada-hover-nav"
    >
      <span className={`mr-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-bold ${KIND_BADGE_COLOR[kind]}`}>
        +
      </span>
      Dodaj {KIND_LABEL_PL[kind]}
    </button>
  );
}

function RowAction({
  testId,
  title,
  onClick,
  destructive,
  children,
}: {
  testId: string;
  title: string;
  onClick?: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      onClick={onClick}
      className={
        'rounded border px-2 py-0.5 text-[10px] font-medium '
        + (destructive
          ? 'border-red-700 bg-red-950/30 text-red-300 hover:bg-red-900/40'
          : 'border-scada-border bg-scada-panel text-scada-text hover:border-scada-sn')
      }
    >
      {children}
    </button>
  );
}

export default StationConfigDerSourcesCard;
