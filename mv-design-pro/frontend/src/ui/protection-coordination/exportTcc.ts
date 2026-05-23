/**
 * exportTcc — eksport krzywych TCC (Time-Current Characteristic) do programów
 * vendor: SEL ProACT (CSV), EATON eSCADA (PLT), ABB Relion (530).
 *
 * Każdy vendor ma własny format - implementujemy minimalny CSV/PLT/CFG.
 * Pozwala projektantowi przenieść skonfigurowane krzywe zabezpieczeń
 * bezpośrednio do programu nastawczego relaya.
 *
 * BINDING: 100% PL w komentarzach.
 */

export interface TccCurvePoint {
  /** Prąd jako wielokrotność I_set (multiplier). */
  readonly current_multiplier: number;
  /** Czas zadziałania [s]. */
  readonly time_s: number;
}

export interface TccCurveExport {
  /** Identyfikator urządzenia (np. "CB-Pole-1"). */
  readonly device_id: string;
  /** Nazwa krzywej (np. "SI", "VI", "EI", "DT" lub custom). */
  readonly curve_name: string;
  /** Funkcja zabezpieczenia (ANSI/IEC code: 50, 51, 67, etc.). */
  readonly function_code: string;
  /** Nastawa prądu [A]. */
  readonly I_set_A: number;
  /** Nastawa czasu (TMS dla IDMT lub t_set dla DT) [s]. */
  readonly t_set_s: number;
  /** Punkty krzywej (multiplier vs time). */
  readonly points: readonly TccCurvePoint[];
}

/**
 * Eksport do formatu CSV - generic, używany przez SEL ProACT i inne.
 *
 * Format:
 *   DeviceID,FunctionCode,CurveName,I_set[A],TMS[s],I_mult,t[s]
 *   CB-1,51,SI,500,0.3,2.0,4.5
 *   CB-1,51,SI,500,0.3,5.0,1.2
 *   ...
 */
export function exportTccCsv(curves: readonly TccCurveExport[]): string {
  const rows: string[] = [];
  rows.push('DeviceID,FunctionCode,CurveName,I_set[A],TMS[s],I_mult,t[s]');
  for (const curve of curves) {
    for (const point of curve.points) {
      rows.push(
        [
          curve.device_id,
          curve.function_code,
          curve.curve_name,
          curve.I_set_A.toFixed(2),
          curve.t_set_s.toFixed(3),
          point.current_multiplier.toFixed(3),
          point.time_s.toFixed(4),
        ].join(','),
      );
    }
  }
  return rows.join('\n');
}

/**
 * Eksport do formatu EATON PLT (Power Logic Trace) - minimalny.
 *
 * Format binarny w produkcji, tu uproszczony tekst z metadanymi.
 */
export function exportTccEatonPlt(curves: readonly TccCurveExport[]): string {
  const lines: string[] = [];
  lines.push('# EATON eSCADA Power Logic Trace - TCC Curves');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Vendor: EATON Corporation`);
  lines.push(`# Format: Simplified text (binary PLT requires eSCADA SDK)`);
  lines.push('');
  for (const curve of curves) {
    lines.push(`[DEVICE]`);
    lines.push(`Name=${curve.device_id}`);
    lines.push(`ANSI=${curve.function_code}`);
    lines.push(`Curve=${curve.curve_name}`);
    lines.push(`Ipickup=${curve.I_set_A}`);
    lines.push(`TimeDial=${curve.t_set_s}`);
    lines.push(`PointCount=${curve.points.length}`);
    for (let i = 0; i < curve.points.length; i++) {
      const p = curve.points[i];
      lines.push(`Point${i}=${p.current_multiplier},${p.time_s}`);
    }
    lines.push('[/DEVICE]');
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Eksport do formatu ABB Relion 530 - config XML.
 */
export function exportTccAbbRelion(curves: readonly TccCurveExport[]): string {
  const xml: string[] = [];
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push('<RelionConfig vendor="ABB" series="Relion 530" version="2.0">');
  xml.push(`  <Metadata generated="${new Date().toISOString()}"/>`);
  for (const curve of curves) {
    xml.push(`  <Protection device="${escapeXml(curve.device_id)}" ansi="${curve.function_code}">`);
    xml.push(`    <Curve type="${escapeXml(curve.curve_name)}"/>`);
    xml.push(`    <Settings>`);
    xml.push(`      <Pickup unit="A">${curve.I_set_A}</Pickup>`);
    xml.push(`      <TimeDial unit="s">${curve.t_set_s}</TimeDial>`);
    xml.push(`    </Settings>`);
    xml.push(`    <CurvePoints>`);
    for (const p of curve.points) {
      xml.push(`      <Point I="${p.current_multiplier}" t="${p.time_s}"/>`);
    }
    xml.push(`    </CurvePoints>`);
    xml.push(`  </Protection>`);
  }
  xml.push('</RelionConfig>');
  return xml.join('\n');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type TccExportFormat = 'sel_csv' | 'eaton_plt' | 'abb_relion';

const FORMAT_EXTENSION: Record<TccExportFormat, string> = {
  sel_csv: 'csv',
  eaton_plt: 'plt',
  abb_relion: 'xml',
};

const FORMAT_MIME: Record<TccExportFormat, string> = {
  sel_csv: 'text/csv',
  eaton_plt: 'text/plain',
  abb_relion: 'application/xml',
};

export function generateTccExport(curves: readonly TccCurveExport[], format: TccExportFormat): string {
  switch (format) {
    case 'sel_csv':
      return exportTccCsv(curves);
    case 'eaton_plt':
      return exportTccEatonPlt(curves);
    case 'abb_relion':
      return exportTccAbbRelion(curves);
  }
}

export function downloadTccExport(
  curves: readonly TccCurveExport[],
  format: TccExportFormat,
  filename: string,
): void {
  const content = generateTccExport(curves, format);
  const blob = new Blob([content], { type: FORMAT_MIME[format] });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.includes('.') ? filename : `${filename}.${FORMAT_EXTENSION[format]}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
