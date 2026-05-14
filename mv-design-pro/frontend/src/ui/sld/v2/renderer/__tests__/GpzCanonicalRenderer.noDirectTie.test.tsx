import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  type CanonicalGpzBay,
  type CanonicalGpzSection,
  type CanonicalGpzTransformer,
  GpzCanonicalRenderer,
} from '../GpzCanonicalRenderer';

const TR1: CanonicalGpzTransformer = {
  transformerRef: 'tr-1',
  designation: 'TR1',
  snMva: 25,
  uhvKv: 110,
  ulvKv: 15,
  vectorGroup: 'YNd11',
};

const LINE_BAY: CanonicalGpzBay = {
  bayRef: 'b-1',
  bayNumber: '1',
  feederName: 'ODPŁYW 1',
  destinationLabel: 'ST-01',
  fieldRole: 'LINE_OUT',
  cbState: 'closed',
  dsState: 'closed',
  esState: 'open',
  qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
};

const SECTIONS: CanonicalGpzSection[] = [
  {
    sectionId: 'sec-1',
    order: 1,
    label: 'S1',
    busVoltageKv: 15,
    bays: [LINE_BAY],
  },
];

describe('GpzCanonicalRenderer — guard no_direct_110kv_tr_tie_without_switchgear', () => {
  it('TR 110/SN kończy się na kotwie pola TR, a do szyny SN prowadzi kolumna aparatów', () => {
    const { container } = render(
      <svg width={1200} height={900}>
        <GpzCanonicalRenderer
          id="gpz-test"
          x={0}
          y={0}
          name="GPZ TEST"
          transformers={[TR1]}
          sections={SECTIONS}
          couplers={[]}
        />
      </svg>,
    );

    const tr1 = container.querySelector('[data-testid="gpz-canonical-transformer-tr-1"]');
    const fieldAnchor = tr1?.querySelector(
      '[data-parity-key="gpz.transformer.field_anchor_connector"]',
    );
    const hvConnector = tr1?.querySelector('[data-parity-key="gpz.transformer.hv_connector"]');
    const hvTrBay = tr1?.querySelector('[data-testid="gpz-canonical-hv-tr-bay-tr-1"]');
    const directLvTie = tr1?.querySelector('[data-parity-key="gpz.transformer.lv_connector"]');
    const trField = container.querySelector('[data-testid="gpz-canonical-tr-field-tr-1"]');

    expect(hvConnector).toBeTruthy();
    expect(hvConnector?.getAttribute('data-direct-110kv-tr-tie')).toBe('false');
    expect(hvConnector?.getAttribute('data-terminates-at')).toBe('hv_tr_bay_apparatus');
    expect(hvTrBay).toBeTruthy();
    expect(hvTrBay?.querySelector('[data-testid="gpz-canonical-hv-tr-bay-tr-1-ds"]')).toBeTruthy();
    expect(hvTrBay?.querySelector('[data-testid="gpz-canonical-hv-tr-bay-tr-1-cb"]')).toBeTruthy();
    expect(hvTrBay?.querySelector('[data-testid="gpz-canonical-hv-tr-bay-tr-1-ct"]')).toBeTruthy();

    expect(fieldAnchor).toBeTruthy();
    expect(fieldAnchor?.getAttribute('data-direct-sn-bus-tie')).toBe('false');
    expect(fieldAnchor?.getAttribute('data-terminates-at')).toBe('tr_field_anchor');
    expect(directLvTie).toBeNull();

    expect(trField).toBeTruthy();
    expect(trField?.querySelector('[data-testid="gpz-canonical-tr-field-tr-1-ds"]')).toBeTruthy();
    expect(trField?.querySelector('[data-testid="gpz-canonical-tr-field-tr-1-cb"]')).toBeTruthy();
    expect(trField?.querySelector('[data-testid="gpz-canonical-tr-field-tr-1-ct"]')).toBeTruthy();
    expect(trField?.querySelector('[data-testid="gpz-canonical-tr-field-tr-1-es"]')).toBeTruthy();
  });
});
