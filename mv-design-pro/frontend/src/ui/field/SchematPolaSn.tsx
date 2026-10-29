/**
 * Schemat pola SN w oknie pola (powierzchnia „Pole SN", inspektor pola) — WYCINEK rysunku
 * kanwy `SldCanvasV3`, nie osobny rysunek.
 *
 * Karta UX-04/POLE-LINIOWE-WZORZEC (reguła KLASA): dawny `BayWindowSchematic` był drugą
 * ścieżką rysunku tego samego pola — własne współrzędne, własne kształty aparatów (kwadrat,
 * romb, kółko), wypełnienie kolorem stanu w konwencji odwrotnej do SCADA (otwarty czerwony,
 * zamknięty zielony) i stan nieznany malowany jak zamknięty. Skasowany. Tu scena kanwy
 * (`buildSceneV3`, ten sam ENM, ta sama kompozycja portów i te same glify QElectroTech
 * EN 60617 na kaflu stanu z JEDNEJ tabeli `STATE_COLOR` — czerwony zamknięty, zielony
 * otwarty, szary „?" nieustalony, fioletowy „!" awaria; identyczny w obu motywach) jest
 * przycinana do pola (`kadrPolaZeSceny`). Zero fizyki i zero układu tutaj.
 *
 * Rysunek jest bierny: wybór i przełączanie aparatu odbywają się na kanwie (klik = wybór,
 * przełączenie osobną akcją menu).
 */
import { useMemo } from 'react';

import type { EnergyNetworkModel } from '../../types/enm';
import type { FieldReadModelItem } from './useFieldReadModel';
import { fieldRoleLabelPl } from '../sld/v2/station-rozdzielnia/contract';
import { buildSceneV3 } from '../sld/v3/scene/buildScene';
import { kadrPolaZeSceny } from '../sld/v3/scene/kadrPola';
import { PreviewLabelNode, PreviewSegmentNode, PreviewSymbolNode } from '../sld/v3/compose/preview';
import { sldPaletteForTheme } from '../sld/v3/theme/palette';
import { baseSegmentStrokeColor, baseSymbolStrokeColor } from '../sld/v3/theme/colorTokens';
import { useThemeModeStore } from '../../ui2/theme/themeMode';
import { atrybucjaSymboliSceny } from '../sld/v3/sheet/projectLegend';

interface SchematPolaSnProps {
  readonly item: FieldReadModelItem;
  /** Migawka ENM — to samo źródło, z którego rysuje kanwa. */
  readonly snapshot: EnergyNetworkModel | null;
}

/** Poziom szczegółu sceny z aparatami pól (ten sam co kanwa przy pracy z bliska). */
const LOD_POLA = 2;

export function SchematPolaSn({ item, snapshot }: SchematPolaSnProps): JSX.Element {
  const themeMode = useThemeModeStore((state) => state.mode);
  const palette = sldPaletteForTheme(themeMode);
  const kadr = useMemo(
    () => (snapshot ? kadrPolaZeSceny(buildSceneV3(snapshot, LOD_POLA), item.bay_ref) : null),
    [snapshot, item.bay_ref],
  );
  const role = item.canonical_model.base_model.bay_role;

  return (
    <section
      aria-label="Schemat pola SN"
      data-testid="schemat-pola-sn"
      className="mx-4 mb-4 rounded-lg border border-slate-200 bg-white p-3 text-slate-900"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">Schemat pola</h4>
          <p className="mt-1 text-xs text-slate-600">{item.bay_name}</p>
        </div>
        <span className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600">
          {fieldRoleLabelPl(role)}
        </span>
      </div>

      {kadr ? (
        <svg
          data-testid="bay-svg-renderer"
          data-theme-mode={themeMode}
          viewBox={`${kadr.rect.x} ${kadr.rect.y} ${kadr.rect.width} ${kadr.rect.height}`}
          className="h-80 w-full rounded border border-slate-200"
          role="img"
          aria-label={`Schemat pola ${item.bay_name}`}
        >
          <rect
            x={kadr.rect.x}
            y={kadr.rect.y}
            width={kadr.rect.width}
            height={kadr.rect.height}
            fill={palette.canvasBackground}
          />
          <g data-preview-layer="segments">
            {kadr.segments.map((segment, index) => (
              <PreviewSegmentNode
                key={`${segment.meta?.ownerRef ?? 'odcinek'}-${index}`}
                segment={segment}
                stroke={baseSegmentStrokeColor(segment.meta, palette)}
              />
            ))}
          </g>
          <g data-preview-layer="symbols">
            {kadr.symbols.map((symbol, index) => (
              <PreviewSymbolNode
                key={`${symbol.meta?.deviceRef ?? symbol.symbolId}-${index}`}
                symbol={symbol}
                stroke={baseSymbolStrokeColor(symbol.symbolId, symbol.meta, palette)}
                kafleStanu={palette.state}
              />
            ))}
          </g>
          <g data-preview-layer="labels">
            {kadr.labels.map((label, index) => (
              <PreviewLabelNode key={`${label.ownerRef}-${index}`} label={label} stroke={palette.baseStroke} />
            ))}
          </g>
        </svg>
      ) : (
        <p data-testid="schemat-pola-sn-brak" className="text-xs text-slate-600">
          Pole nie ma rysunku na schemacie: model nie niesie aparatów pierwotnych pola ani gałęzi
          aparatu, z których powstaje rysunek.
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-500" data-testid="schemat-pola-sn-opis">
        Wycinek schematu jednokreskowego — ten sam rysunek co na kanwie.
        {kadr && atrybucjaSymboliSceny(kadr) ? ` ${atrybucjaSymboliSceny(kadr)}.` : ''}
      </p>
    </section>
  );
}
