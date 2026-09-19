import type { CatalogContextEntry, ExtendedTrace, TraceStep } from '../../results-inspector/types';
import { rozpakujWartoscSladu } from '../../results-inspector/traceValue';

const LABELS = {
  documentTitle: 'Ślad obliczeń',
  runId: 'ID wykonania',
  snapshotId: 'ID migawki',
  inputHash: 'Hash danych wejściowych',
  exportedAt: 'Data eksportu',
  totalSteps: 'Liczba kroków',
  catalogContext: 'Kontekst katalogowy',
  sourceCatalog: 'Źródło katalogowe',
  parameterOrigin: 'Pochodzenie parametrów',
  materializedParams: 'Zmaterializowane parametry',
  manualOverrides: 'Nadpisania ręczne',
  relatedElement: 'Element techniczny',
  formula: 'Wzór',
  inputs: 'Dane wejściowe',
  substitution: 'Podstawienie',
  result: 'Wynik',
  notes: 'Uwagi',
  noData: 'Brak danych',
  readOnly: 'Dokument tylko do odczytu',
  generatedBy: 'Wygenerowano przez MV-DESIGN-PRO',
} as const;

const PHASE_LABELS: Record<string, string> = {
  INITIALIZATION: 'Inicjalizacja',
  CALCULATION: 'Obliczenia',
  AGGREGATION: 'Agregacja',
  VALIDATION: 'Walidacja',
  OUTPUT: 'Wyniki',
};

// Rozpakowanie surowej wartości kroku śladu WHITE BOX (skalar / {re,im} /
// opakowany TraceValue) jest WSPÓLNE dla całego frontu — patrz
// `results-inspector/traceValue.ts::rozpakujWartoscSladu` (KLASA NIE
// INSTANCJA, karta WB-2; ta funkcja była kopią `TraceStepView.tsx::formatValue`).
// Formatowanie do napisu zostaje tutaj (per ekran/eksport).
function formatValue(value: unknown): string {
  const { wartosc, re, im, unit } = rozpakujWartoscSladu(value);

  if (typeof re === 'number' && typeof im === 'number') {
    // Brak dedykowanego formatu zespolonego w tym eksporcie — surowy JSON
    // składowych, jak dotychczas, NIGDY "[object Object]".
    return JSON.stringify({ re, im });
  }

  if (wartosc === null) return '-';

  let formatted: string;
  if (typeof wartosc === 'number') {
    if (Math.abs(wartosc) < 0.01 && wartosc !== 0) {
      formatted = wartosc.toExponential(3);
    } else {
      formatted = wartosc.toLocaleString('pl-PL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
    }
  } else if (typeof wartosc === 'boolean') {
    formatted = wartosc ? 'Tak' : 'Nie';
  } else {
    formatted = wartosc;
  }

  return unit ? `${formatted} ${unit}` : formatted;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatJson(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function getStepTitle(step: TraceStep, index: number): string {
  return step.title ?? step.description ?? `Krok ${index + 1}`;
}

function getPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return '';
  return PHASE_LABELS[phase] ?? phase;
}

function generatePdfStyles(): string {
  return `
    @media print {
      @page {
        size: A4;
        margin: 15mm;
      }
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 20px;
      background: white;
      color: #1e293b;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 10pt;
      line-height: 1.5;
    }

    .header {
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }

    .header h1 {
      margin: 0 0 8px 0;
      font-size: 18pt;
      font-weight: 600;
    }

    .header-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      font-size: 9pt;
      color: #64748b;
    }

    .header-meta dt {
      font-weight: 600;
      color: #475569;
    }

    .header-meta dd {
      margin: 0;
      font-family: Consolas, 'Courier New', monospace;
      font-size: 8pt;
    }

    .read-only-badge {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 8px;
      border-radius: 4px;
      background: #fef3c7;
      color: #92400e;
      font-size: 8pt;
      font-weight: 600;
    }

    .section-title {
      margin: 0 0 10px 0;
      font-size: 12pt;
      font-weight: 600;
    }

    .step, .catalog-entry {
      page-break-inside: avoid;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
    }

    .step-header {
      padding: 12px 16px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .step-header h2 {
      margin: 0;
      font-size: 12pt;
      font-weight: 600;
    }

    .step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      margin-right: 8px;
      border-radius: 50%;
      background: #3b82f6;
      color: white;
      font-size: 10pt;
      font-weight: 600;
    }

    .phase {
      display: inline-block;
      margin-left: 8px;
      padding: 2px 8px;
      border-radius: 4px;
      background: #dbeafe;
      color: #1d4ed8;
      font-size: 8pt;
      font-weight: 500;
    }

    .step-content, .catalog-content {
      padding: 16px;
    }

    .step-section {
      margin-bottom: 12px;
    }

    .step-section:last-child {
      margin-bottom: 0;
    }

    .step-section h3 {
      margin: 0 0 8px 0;
      color: #64748b;
      font-size: 9pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .formula-block, .json-block {
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      background: #f8fafc;
      overflow-x: auto;
    }

    .formula-block {
      font-family: 'Cambria Math', 'Times New Roman', serif;
      font-size: 11pt;
      text-align: center;
    }

    .json-block {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: Consolas, 'Courier New', monospace;
      font-size: 8pt;
      text-align: left;
    }

    .values-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }

    .values-table th {
      padding: 8px;
      text-align: left;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #475569;
      font-weight: 600;
    }

    .values-table td {
      padding: 8px;
      border: 1px solid #e2e8f0;
    }

    .values-table td:last-child {
      text-align: right;
      font-family: Consolas, 'Courier New', monospace;
    }

    .notes-block {
      padding: 12px;
      border: 1px solid #fcd34d;
      border-radius: 4px;
      background: #fef3c7;
      color: #92400e;
      font-size: 9pt;
    }

    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      color: #94a3b8;
      font-size: 8pt;
      text-align: center;
    }
  `;
}

function generateValuesTable(values: Record<string, unknown> | undefined): string {
  if (!values || Object.keys(values).length === 0) {
    return `<p style="color: #94a3b8; font-style: italic;">${LABELS.noData}</p>`;
  }

  const rows = Object.entries(values)
    .map(([key, value]) => `
      <tr>
        <td>${escapeHtml(key)}</td>
        <td>${escapeHtml(formatValue(value))}</td>
      </tr>
    `)
    .join('');

  return `
    <table class="values-table">
      <thead>
        <tr>
          <th>Wielkość</th>
          <th>Wartość</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function resolveStepCatalogEntry(step: TraceStep): CatalogContextEntry | null {
  return step.catalog_context_entry ?? null;
}

function generateStepHtml(step: TraceStep, index: number): string {
  const title = getStepTitle(step, index);
  const phaseLabel = getPhaseLabel(step.phase);
  const catalogEntry = resolveStepCatalogEntry(step);
  const sourceCatalog =
    step.source_catalog
    ?? catalogEntry?.source_catalog
    ?? step.catalog_binding
    ?? catalogEntry?.catalog_binding
    ?? null;
  const sourceCatalogLabel =
    step.source_catalog_label
    ?? catalogEntry?.source_catalog_label
    ?? null;
  const parameterOrigin =
    step.parameter_origin
    ?? step.parameter_source
    ?? catalogEntry?.parameter_origin
    ?? catalogEntry?.parameter_source
    ?? null;
  const materializedParams =
    step.materialized_params
    ?? catalogEntry?.materialized_params
    ?? null;
  const manualOverrides =
    step.manual_overrides
    ?? catalogEntry?.manual_overrides
    ?? null;
  const elementId =
    step.element_id
    ?? catalogEntry?.element_id
    ?? step.target_id
    ?? null;

  return `
    <div class="step">
      <div class="step-header">
        <h2>
          <span class="step-number">${index + 1}</span>
          ${escapeHtml(title)}
          ${phaseLabel ? `<span class="phase">${escapeHtml(phaseLabel)}</span>` : ''}
        </h2>
      </div>
      <div class="step-content">
        ${elementId ? `
          <div class="step-section">
            <h3>${LABELS.relatedElement}</h3>
            <div class="json-block">${escapeHtml(elementId)}</div>
          </div>
        ` : ''}
        ${sourceCatalog || sourceCatalogLabel ? `
          <div class="step-section">
            <h3>${LABELS.sourceCatalog}</h3>
            <div class="json-block">${sourceCatalogLabel ? escapeHtml(sourceCatalogLabel) : formatJson(sourceCatalog)}</div>
          </div>
        ` : ''}
        ${parameterOrigin ? `
          <div class="step-section">
            <h3>${LABELS.parameterOrigin}</h3>
            <div class="json-block">${escapeHtml(parameterOrigin)}</div>
          </div>
        ` : ''}
        ${materializedParams ? `
          <div class="step-section">
            <h3>${LABELS.materializedParams}</h3>
            <div class="json-block">${formatJson(materializedParams)}</div>
          </div>
        ` : ''}
        ${manualOverrides && manualOverrides.length > 0 ? `
          <div class="step-section">
            <h3>${LABELS.manualOverrides}</h3>
            <div class="json-block">${formatJson(manualOverrides)}</div>
          </div>
        ` : ''}
        ${step.formula_latex ? `
          <div class="step-section">
            <h3>${LABELS.formula}</h3>
            <div class="formula-block">${escapeHtml(step.formula_latex)}</div>
          </div>
        ` : ''}
        ${step.inputs ? `
          <div class="step-section">
            <h3>${LABELS.inputs}</h3>
            ${generateValuesTable(step.inputs)}
          </div>
        ` : ''}
        ${step.substitution ? `
          <div class="step-section">
            <h3>${LABELS.substitution}</h3>
            <div class="formula-block">${escapeHtml(step.substitution)}</div>
          </div>
        ` : ''}
        ${step.result ? `
          <div class="step-section">
            <h3>${LABELS.result}</h3>
            ${generateValuesTable(step.result)}
          </div>
        ` : ''}
        ${step.notes ? `
          <div class="step-section">
            <h3>${LABELS.notes}</h3>
            <div class="notes-block">${escapeHtml(step.notes)}</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function generateCatalogContextHtml(trace: ExtendedTrace): string {
  if (trace.catalog_context.length === 0) {
    return '';
  }

  const summaryRows = trace.catalog_context
    .map((entry) => `
      <tr>
        <td>${escapeHtml(entry.element_type)}</td>
        <td>${escapeHtml(entry.element_id)}</td>
        <td>${escapeHtml(entry.catalog_binding?.catalog_item_id ?? '-')}</td>
      </tr>
    `)
    .join('');

  const detailSections = trace.catalog_context
    .map((entry) => {
      const parameterOrigin = entry.parameter_origin ?? entry.parameter_source ?? null;
      const manualOverrides = entry.manual_overrides ?? entry.overrides ?? [];
      const sourceCatalog = entry.source_catalog ?? entry.catalog_binding ?? null;
      return `
        <div class="catalog-entry">
          <div class="step-header">
            <h2>${escapeHtml(entry.element_type)}: ${escapeHtml(entry.element_id)}</h2>
          </div>
          <div class="catalog-content">
            <div class="step-section">
              <h3>Powiązanie katalogowe</h3>
              <div class="json-block">${formatJson(entry.catalog_binding ?? null)}</div>
            </div>
            ${sourceCatalog ? `
              <div class="step-section">
                <h3>${LABELS.sourceCatalog}</h3>
                <div class="json-block">${entry.source_catalog_label ? escapeHtml(entry.source_catalog_label) : formatJson(sourceCatalog)}</div>
              </div>
            ` : ''}
            ${entry.materialized_params ? `
              <div class="step-section">
                <h3>${LABELS.materializedParams}</h3>
                <div class="json-block">${formatJson(entry.materialized_params)}</div>
              </div>
            ` : ''}
            ${parameterOrigin ? `
              <div class="step-section">
                <h3>${LABELS.parameterOrigin}</h3>
                <div class="json-block">${escapeHtml(parameterOrigin)}</div>
              </div>
            ` : ''}
            ${manualOverrides.length > 0 ? `
              <div class="step-section">
                <h3>${LABELS.manualOverrides}</h3>
                <div class="json-block">${formatJson(manualOverrides)}</div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <section style="margin-bottom: 24px;">
      <h2 class="section-title">${LABELS.catalogContext}</h2>
      <table class="values-table" style="margin-bottom: 16px;">
        <thead>
          <tr>
            <th>Klasa</th>
            <th>Element</th>
            <th>Pozycja katalogowa</th>
          </tr>
        </thead>
        <tbody>${summaryRows}</tbody>
      </table>
      ${detailSections}
    </section>
  `;
}

function generatePdfHtml(trace: ExtendedTrace): string {
  const exportedAt = new Date().toLocaleString('pl-PL', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const stepsHtml = trace.white_box_trace
    .map((step, index) => generateStepHtml(step, index))
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="pl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${LABELS.documentTitle}</title>
      <style>${generatePdfStyles()}</style>
    </head>
    <body>
      <div class="header">
        <h1>${LABELS.documentTitle}</h1>
        <dl class="header-meta">
          <div>
            <dt>${LABELS.runId}:</dt>
            <dd>${escapeHtml(trace.run_id)}</dd>
          </div>
          <div>
            <dt>${LABELS.snapshotId}:</dt>
            <dd>${escapeHtml(trace.snapshot_id ?? '-')}</dd>
          </div>
          <div>
            <dt>${LABELS.inputHash}:</dt>
            <dd>${escapeHtml(trace.input_hash.slice(0, 16))}...</dd>
          </div>
          <div>
            <dt>${LABELS.totalSteps}:</dt>
            <dd>${trace.white_box_trace.length}</dd>
          </div>
          <div>
            <dt>${LABELS.catalogContext}:</dt>
            <dd>${trace.catalog_context.length}</dd>
          </div>
          <div>
            <dt>${LABELS.exportedAt}:</dt>
            <dd>${escapeHtml(exportedAt)}</dd>
          </div>
        </dl>
        <div class="read-only-badge">${LABELS.readOnly}</div>
      </div>

      <main>
        ${generateCatalogContextHtml(trace)}
        ${stepsHtml}
      </main>

      <footer class="footer">
        ${LABELS.generatedBy}
      </footer>
    </body>
    </html>
  `;
}

export function generatePdfFilename(trace: ExtendedTrace): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runIdShort = trace.run_id.slice(0, 8);
  return `slad_obliczen_${runIdShort}_${timestamp}.pdf`;
}

export function exportTracePdf(trace: ExtendedTrace): void {
  const html = generatePdfHtml(trace);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.error('Failed to open print window. Please allow popups.');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.print();
  };

  setTimeout(() => {
    if (printWindow.document.readyState === 'complete') {
      printWindow.print();
    }
  }, 500);
}

export function generateTracePdfHtml(trace: ExtendedTrace): string {
  return generatePdfHtml(trace);
}
