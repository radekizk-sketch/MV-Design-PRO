/**
 * Surface'y źródeł OZE (Etap 5):
 *  - PvSourceSurface (E-21): PV/FV
 *  - BessSurface (E-22): BESS (magazyn energii)
 *  - FwSurface (E-23): Farma wiatrowa
 *
 * Wrapują istniejący DerConfigurator z odpowiednim derKind. Dodają nagłówek
 * Surface'u, info o profilach NC RfG (5 OSD: PSE/Energa/Tauron/Enea/PGE) oraz
 * krzywych FRT/LVRT/HVRT z backendu (frt_hvrt solver).
 */

import { DerConfigurator, type DerKind } from '../../network-build/der-configurator/DerConfigurator';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface DerSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

interface DerWrapperProps {
  readonly surface: WorkspaceSurfaceDescriptor;
  readonly screenCode: string;
  readonly derKind: DerKind;
  readonly title: string;
  readonly testId: string;
}

function DerSurfaceShell({ surface, screenCode, derKind, title, testId }: DerWrapperProps): JSX.Element {
  const ref = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const sourceName = (() => {
    if (!ref) return null;
    if (!snapshot) return ref;
    const src = (snapshot.sources ?? []).find((s: { ref_id: string; name?: string }) => s.ref_id === ref);
    return src?.name ?? ref;
  })();

  return (
    <div data-testid={testId} className="flex h-full w-full flex-col p-4">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
          {screenCode} · {title}
        </div>
        <h2 className="mt-1 text-base font-semibold text-scada-text">
          {sourceName ?? 'Źródło niewybrane'}
        </h2>
        {!ref && (
          <p className="mt-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
            Brak referencji do źródła OZE w kontekście. Wybierz źródło z lewego
            nawigatora modelu lub kliknij źródło w SLD i wybierz "Otwórz kartę…".
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto rounded border border-scada-border bg-scada-panel">
        <DerConfigurator derId={ref ?? 'unselected'} derKind={derKind} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        <Hint
          title="Profile operatorów (NC RfG)"
          body="PSE / Energa-Operator / Tauron Dystrybucja / Enea Operator / PGE Dystrybucja — wybór wpływa na wymagania Q(U), P(f) i FRT/HVRT."
        />
        <Hint
          title="Krzywe FRT/LVRT/HVRT"
          body="Modele dynamiczne z backendu (frt_hvrt). Pełne wykresy wraz z kontrolą zgodności — Etap 8."
        />
        <Hint
          title="Dane zwarciowe"
          body="Source contribution (Ik''/ip/Ith) z modelu falownika — używane przez solver IEC 60909 (PR-15/16)."
        />
      </div>
    </div>
  );
}

function Hint({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded border border-scada-border bg-scada-surface p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">{title}</div>
      <div className="mt-1 text-xs text-scada-text">{body}</div>
    </div>
  );
}

export function PvSourceSurface({ surface }: DerSurfaceProps): JSX.Element {
  return (
    <DerSurfaceShell
      surface={surface}
      screenCode="E-21"
      derKind="PV"
      title="Konfigurator źródła PV/FV"
      testId="pv-source-surface"
    />
  );
}

export function BessSurface({ surface }: DerSurfaceProps): JSX.Element {
  return (
    <DerSurfaceShell
      surface={surface}
      screenCode="E-22"
      derKind="BESS"
      title="Konfigurator BESS (magazyn energii)"
      testId="bess-surface"
    />
  );
}

export function FwSurface({ surface }: DerSurfaceProps): JSX.Element {
  return (
    <DerSurfaceShell
      surface={surface}
      screenCode="E-23"
      derKind="FW"
      title="Konfigurator farmy wiatrowej"
      testId="fw-surface"
    />
  );
}
