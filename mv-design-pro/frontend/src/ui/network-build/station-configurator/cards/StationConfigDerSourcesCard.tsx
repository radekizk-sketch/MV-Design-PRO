/**
 * Układy PV/BESS/FW.
 *
 * Karta techniczna pokazuje wszystkie układy przyłączeniowe przypięte
 * do bieżącej stacji wraz z konfiguracją katalogową i akcjami nawigacyjnymi.
 *
 * Single source of truth: ten sam StationDerConnection renderuje się tutaj
 * i w E-21/E-22/E-23 — zmiana w jednym miejscu propaguje się do drugiego.
 */

import { useMemo } from 'react';

import { MISSING_DASH } from '../../../shared/formatPolishValue';
import {
  getNcRfgOperator,
  getConnectionSideLabelPl,
  getBlockTransformer,
  type BlockTransformerItem,
  type NcRfgOperatorItem,
  type StationDerConnection,
} from '../../station-der';

export type AddDerKindRequest = 'PV' | 'BESS' | 'FW';

export interface StationConfigDerSourcesCardProps {
  /** ID stacji (z entityRef surface'u). */
  readonly stationId: string;
  readonly stationLabel?: string;
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
  /** Czy dany DER moze byc odlaczony przez te karte bez pustej akcji. */
  readonly canDetachDer?: (derId: string) => boolean;
  /**
   * Karta FAB-J: snapshot audytu 2 (transformatory dedykowane) i katalog
   * operatorów NC RfG — WYŁĄCZNIE z backendu (`useAudit2CatalogSnapshot`,
   * `useNcRfgOperatorCatalog`). Pominięcie nie jest błędem: etykiety
   * pokazują wtedy uczciwy stan „brak danych z katalogu backendu", nie
   * fabrykowaną nazwę z listy lokalnej.
   */
  readonly blockTransformers?: readonly BlockTransformerItem[];
  readonly ncRfgOperators?: readonly NcRfgOperatorItem[];
}

const KIND_LABEL_PL: Record<AddDerKindRequest, string> = {
  PV: 'PV / FV',
  BESS: 'BESS',
  FW: 'Farma wiatrowa',
};

const KIND_BADGE_COLOR: Record<AddDerKindRequest, string> = {
  PV: 'bg-sygnal-uwaga-tlo text-sygnal-uwaga-tusz',
  BESS: 'bg-sygnal-ok-tlo text-sygnal-ok-tusz',
  FW: 'bg-sygnal-info-tlo text-sygnal-info-tusz',
};

const COMPLETENESS_LABEL_PL: Record<StationDerConnection['completeness'], string> = {
  complete: 'skonfigurowane',
  partial: 'w konfiguracji',
  missing_catalog: 'wariant katalogowy do wyboru',
  missing_profile: 'profil do wyboru',
  voltage_mismatch: 'niezgodność napięcia',
  no_pcc: 'PCC do wyboru',
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
  readonly blockTransformerPl: string | null;
  readonly profilePl: string;
}

function buildRow(
  der: StationDerConnection,
  blockTransformers: readonly BlockTransformerItem[],
  ncRfgOperators: readonly NcRfgOperatorItem[],
): DerRow {
  // Karta FAB-K: napięcie WYŁĄCZNIE z modelu (`connection_voltage_kv`) — dawny
  // `voltage_level_ref` (osobna referencja katalogu poziomów) był fantomem.
  const voltageKv = der.connection_voltage_kv ?? null;
  const profile = getNcRfgOperator(ncRfgOperators, der.profiles.nc_rfg_profile_ref);
  const blockTransformer = getBlockTransformer(
    blockTransformers,
    der.catalogs.block_transformer_catalog_ref,
  );
  const blockTransformerPl = blockTransformer
    ? `TR blokowy ${blockTransformer.sn_kva.toLocaleString('pl-PL')} kVA ${blockTransformer.vector_group}`
    : null;
  const voltagePl = blockTransformer
    ? `${blockTransformer.hv_kv.toLocaleString('pl-PL')}/${blockTransformer.lv_kv.toLocaleString('pl-PL')} kV`
    : voltageKv != null ? `${voltageKv.toLocaleString('pl-PL')} kV` : MISSING_DASH;
  return {
    der,
    connectionSidePl: getConnectionSideLabelPl(der.connection_side),
    voltagePl,
    blockTransformerPl,
    profilePl: profile?.operator_name_pl ?? MISSING_DASH,
  };
}

export function StationConfigDerSourcesCard(
  props: StationConfigDerSourcesCardProps,
): JSX.Element {
  const {
    stationId,
    stationLabel,
    ders,
    onOpenDer,
    onShowOnSld,
    onAddDer,
    onDetachDer,
    canDetachDer,
    blockTransformers = [],
    ncRfgOperators = [],
  } = props;

  const rows = useMemo(
    () => ders.map((der) => buildRow(der, blockTransformers, ncRfgOperators)),
    [ders, blockTransformers, ncRfgOperators],
  );
  const displayStationLabel = stationLabel ?? 'Stacja';
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
            Układy PV/BESS/FW
          </div>
          <div className="mt-1 text-sm text-scada-text">
            Stacja: <span className="font-semibold text-scada-sn">{displayStationLabel}</span> · {counts.total} ukł. (PV: {counts.pv} · BESS: {counts.bess} · FW: {counts.fw})
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
            Układy PV/BESS/FW do zaprojektowania
          </div>
          <p className="mt-2 text-xs text-scada-muted">
            Wybierz gotowy wariant PV, BESS albo farmy wiatrowej z katalogu.
            Kreator dobierze urządzenia, transformator dedykowany, profil NC RfG,
            PCC i wymagane dane przyłączeniowe przed zapisem.
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
                <th className="px-2 py-1.5 font-medium">Konfiguracja</th>
                <th className="px-2 py-1.5 text-right font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ der, connectionSidePl, voltagePl, blockTransformerPl, profilePl }) => (
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
                  <td className="px-2 py-1.5 text-scada-muted">
                    <div data-testid={`der-voltage-${der.id}`}>{voltagePl}</div>
                    {blockTransformerPl && (
                      <div
                        data-testid={`der-block-transformer-${der.id}`}
                        className="mt-0.5 text-[10px] font-semibold text-scada-text"
                      >
                        {blockTransformerPl}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-scada-muted">{profilePl}</td>
                  <td className={`px-2 py-1.5 ${COMPLETENESS_TONE[der.completeness]}`}>
                    {COMPLETENESS_LABEL_PL[der.completeness]}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      {onOpenDer && (
                        <RowAction
                          testId={`der-action-open-${der.id}`}
                          title="Otwórz konfigurację układu"
                          onClick={() => onOpenDer(der.id, der.der_kind)}
                        >
                          Otwórz
                        </RowAction>
                      )}
                      {onShowOnSld && (
                        <RowAction
                          testId={`der-action-sld-${der.id}`}
                          title="Pokaż na schemacie SLD"
                          onClick={() => onShowOnSld(der.id)}
                        >
                          SLD
                        </RowAction>
                      )}
                      {onDetachDer && (canDetachDer?.(der.id) ?? true) && (
                        <RowAction
                          testId={`der-action-detach-${der.id}`}
                          title="Odłącz źródło lub magazyn (operacja wymaga potwierdzenia)"
                          onClick={() => onDetachDer(der.id)}
                          destructive
                        >
                          Usuń
                        </RowAction>
                      )}
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
        Klik wiersza otwiera konfigurację właściwą dla PV, BESS albo farmy wiatrowej
        z zachowaniem kontekstu stacji.
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
          ? 'border-sygnal-blokada bg-sygnal-blokada-tlo text-sygnal-blokada-tusz hover:bg-red-900/40'
          : 'border-scada-border bg-scada-panel text-scada-text hover:border-scada-sn')
      }
    >
      {children}
    </button>
  );
}

export default StationConfigDerSourcesCard;
