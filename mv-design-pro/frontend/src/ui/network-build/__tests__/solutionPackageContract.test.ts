import { describe, expect, it } from 'vitest';

import {
  REFERENCE_SOLUTION_PACKAGES,
  buildSolutionCompletenessReport,
  validateSolutionPackageCompleteness,
  type SolutionKind,
  type SolutionPackage,
} from '../solutionPackageContract';

describe('Solution package contract', () => {
  it('referencyjne pakiety katalogowe sa kompletne dla kazdego publicznego rodzaju ukladu', () => {
    const reports = buildSolutionCompletenessReport(REFERENCE_SOLUTION_PACKAGES);
    const errors = reports.flatMap((report) => report.errors);

    expect(errors).toEqual([]);
    expect(reports.every((report) => report.complete)).toBe(true);

    const kinds = new Set(REFERENCE_SOLUTION_PACKAGES.map((solution) => solution.solution_kind));
    const requiredKinds: readonly SolutionKind[] = [
      'GPZ',
      'MV_LINE_SEGMENT',
      'MV_LV_STATION',
      'DER_STATION',
      'PROTECTION_SET',
      'REPORT_PROOF_BINDING',
    ];

    for (const kind of requiredKinds) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  it('odcinek SN musi materializowac galaz, korytarz i ciag topologiczny', () => {
    const lineSegment = REFERENCE_SOLUTION_PACKAGES.find(
      (solution) => solution.solution_kind === 'MV_LINE_SEGMENT',
    );

    expect(lineSegment).toBeDefined();

    const brokenLineSegment: SolutionPackage = {
      ...lineSegment!,
      materialized_elements: lineSegment!.materialized_elements.filter(
        (element) => element.kind !== 'line_run',
      ),
    };

    const report = validateSolutionPackageCompleteness(brokenLineSegment);

    expect(report.complete).toBe(false);
    expect(report.errors).toContain('Pakiet MV_LINE_SEGMENT nie materializuje elementu ENM: line_run.');
  });

  it('stacja SN/nN musi materializowac rozdzielnie, transformator, odbior, pomiar i zabezpieczenia', () => {
    const station = REFERENCE_SOLUTION_PACKAGES.find(
      (solution) => solution.solution_kind === 'MV_LV_STATION',
    );

    expect(station).toBeDefined();

    const stationKinds = new Set(station!.materialized_elements.map((element) => element.kind));

    expect(stationKinds.has('bus')).toBe(true);
    expect(stationKinds.has('bay')).toBe(true);
    expect(stationKinds.has('transformer')).toBe(true);
    expect(stationKinds.has('load')).toBe(true);
    expect(stationKinds.has('measurement')).toBe(true);
    expect(stationKinds.has('protection')).toBe(true);
    expect(stationKinds.has('line_run')).toBe(true);
  });

  it('pakiet OZE musi obejmowac PCC, transformator blokowy, zrodlo, pomiar i zabezpieczenia', () => {
    const derStation = REFERENCE_SOLUTION_PACKAGES.find(
      (solution) => solution.solution_kind === 'DER_STATION',
    );

    expect(derStation).toBeDefined();

    const roles = new Set(derStation!.materialized_elements.map((element) => element.role));

    expect(roles.has('pcc_bus')).toBe(true);
    expect(roles.has('block_transformer')).toBe(true);
    expect(roles.has('pv_generator')).toBe(true);
    expect(roles.has('pcc_metering')).toBe(true);
    expect(roles.has('der_protection')).toBe(true);
  });

  it('etykiety techniczne nie ujawniaja identyfikatorow wewnetrznych w widoku projektanta', () => {
    const station = REFERENCE_SOLUTION_PACKAGES.find(
      (solution) => solution.solution_kind === 'MV_LV_STATION',
    );

    expect(station).toBeDefined();

    const brokenStation: SolutionPackage = {
      ...station!,
      materialized_elements: [
        ...station!.materialized_elements,
        {
          kind: 'bay',
          role: 'debug_label',
          labelPl: 'stn/1234567890abcdef/bay/001',
        },
      ],
    };

    const report = validateSolutionPackageCompleteness(brokenStation);

    expect(report.complete).toBe(false);
    expect(report.errors.some((error) => error.includes('identyfikatora wewnętrznego'))).toBe(true);
  });
});
