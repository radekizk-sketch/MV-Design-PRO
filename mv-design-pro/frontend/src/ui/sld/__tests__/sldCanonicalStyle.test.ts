/**
 * CANONICAL Style System — Snapshot Tests
 *
 * PR-SLD-CANONICAL-STYLE-02: CANONICAL 1:1 Visual Parity
 *
 * PURPOSE:
 * - Ensure style tokens remain stable across changes
 * - Prevent accidental regressions in visual styling
 * - Document canonical CANONICAL style values
 *
 * RULES:
 * - If a snapshot changes, review carefully before accepting
 * - Style changes should be intentional and documented
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_STROKE,
  CANONICAL_STROKE_SELECTED,
  CANONICAL_VOLTAGE_COLORS,
  CANONICAL_VOLTAGE_MAP,
  CANONICAL_STATE_COLORS,
  CANONICAL_FILL_COLORS,
  CANONICAL_TYPOGRAPHY,
  CANONICAL_LABEL_ANCHORS,
  CANONICAL_LINE_LABEL,
  CANONICAL_CALLOUT,
  CANONICAL_CALLOUT_ANCHORS,
  CANONICAL_SYMBOL_SIZES,
  CANONICAL_GRID,
  getKrokVoltageColor,
  getKrokStrokeColor,
  getKrokFillColor,
  getKrokOpacity,
  getCanonicalLabelAnchor,
  getCanonicalSymbolSize,
  getKrokStrokeWidth,
  // Line label placement (PR-SLD-CANONICAL-LABELS-01)
  parsePathSegments,
  selectLabelSegment,
  calculateLineLabelPosition,
  checkLabelSymbolCollision,
  nudgeLabelPosition,
  type LineSegment,
  type LineLabelPosition,
} from '../sldCanonicalStyle';

describe('sldKrokStyle', () => {
  describe('Style Token Stability', () => {
    it('CANONICAL_STROKE hierarchy is stable', () => {
      expect(CANONICAL_STROKE).toMatchInlineSnapshot(`
        {
          "aux": 1.5,
          "busbar": 5,
          "detail": 1,
          "feeder": 2.5,
          "leader": 1,
          "symbol": 2,
        }
      `);
    });

    it('CANONICAL_STROKE_SELECTED hierarchy is stable', () => {
      expect(CANONICAL_STROKE_SELECTED).toMatchInlineSnapshot(`
        {
          "aux": 2,
          "busbar": 6,
          "detail": 1.5,
          "feeder": 3.5,
          "leader": 1.5,
          "symbol": 3,
        }
      `);
    });

    it('CANONICAL_VOLTAGE_COLORS palette is stable', () => {
      expect(CANONICAL_VOLTAGE_COLORS).toMatchInlineSnapshot(`
        {
          "SN": "#1D4ED8",
          "WN": "#B91C1C",
          "default": "#374151",
          "nN": "#B45309",
        }
      `);
    });

    it('CANONICAL_STATE_COLORS palette is stable', () => {
      expect(CANONICAL_STATE_COLORS).toMatchInlineSnapshot(`
        {
          "deenergized": "#6B7280",
          "energized": null,
          "error": "#DC2626",
          "info": "#2563EB",
          "outOfService": "#9CA3AF",
          "selected": "#2563EB",
          "warning": "#D97706",
        }
      `);
    });

    it('CANONICAL_FILL_COLORS palette is stable', () => {
      expect(CANONICAL_FILL_COLORS).toMatchInlineSnapshot(`
        {
          "deenergized": "#F3F4F6",
          "none": "none",
          "normal": "#FFFFFF",
          "selected": "#DBEAFE",
        }
      `);
    });

    it('CANONICAL_TYPOGRAPHY settings are stable', () => {
      expect(CANONICAL_TYPOGRAPHY).toMatchInlineSnapshot(`
        {
          "fontFamily": "'Inter', 'Segoe UI', 'Arial', sans-serif",
          "fontSize": {
            "large": 12,
            "medium": 10,
            "small": 9,
            "xsmall": 8,
          },
          "fontWeight": {
            "bold": 700,
            "medium": 500,
            "normal": 400,
            "semibold": 600,
          },
          "labelColor": "#1F2937",
          "lineHeight": {
            "normal": 1.3,
            "relaxed": 1.5,
            "tight": 1.1,
          },
          "secondaryColor": "#4B5563",
        }
      `);
    });

    it('CANONICAL_SYMBOL_SIZES are stable', () => {
      expect(CANONICAL_SYMBOL_SIZES).toMatchInlineSnapshot(`
        {
          "Bus": {
            "height": 20,
            "width": 100,
          },
          "LineBranch": {
            "height": 30,
            "width": 50,
          },
          "Load": {
            "height": 44,
            "width": 36,
          },
          "Source": {
            "height": 60,
            "width": 50,
          },
          "Switch": {
            "height": 48,
            "width": 36,
          },
          "TransformerBranch": {
            "height": 56,
            "width": 40,
          },
          "default": {
            "height": 40,
            "width": 40,
          },
        }
      `);
    });

    it('CANONICAL_GRID settings are stable', () => {
      expect(CANONICAL_GRID).toMatchInlineSnapshot(`
        {
          "axisColor": "#CBD5E1",
          "axisStrokeWidth": 0.8,
          "defaultVisible": true,
          "majorColor": "#E2E8F0",
          "majorEvery": 5,
          "majorStrokeWidth": 0.6,
          "minorColor": "#F1F5F9",
          "minorStrokeWidth": 0.4,
          "opacity": 0.6,
          "size": 20,
        }
      `);
    });

    it('CANONICAL_LABEL_ANCHORS are stable', () => {
      expect(CANONICAL_LABEL_ANCHORS).toMatchInlineSnapshot(`
        {
          "Bus": {
            "offsetX": 0,
            "offsetY": -12,
            "position": "top",
            "textAnchor": "middle",
          },
          "LineBranch": {
            "offsetX": 0,
            "offsetY": -6,
            "position": "top",
            "textAnchor": "middle",
          },
          "Load": {
            "offsetX": 0,
            "offsetY": 8,
            "position": "bottom",
            "textAnchor": "middle",
          },
          "Source": {
            "offsetX": 0,
            "offsetY": -10,
            "position": "top",
            "textAnchor": "middle",
          },
          "Switch": {
            "offsetX": 0,
            "offsetY": -8,
            "position": "top",
            "textAnchor": "middle",
          },
          "TransformerBranch": {
            "offsetX": 30,
            "offsetY": 0,
            "position": "right",
            "textAnchor": "start",
          },
          "default": {
            "offsetX": 0,
            "offsetY": -8,
            "position": "top",
            "textAnchor": "middle",
          },
        }
      `);
    });

    it('CANONICAL_CALLOUT settings are stable', () => {
      expect(CANONICAL_CALLOUT).toMatchInlineSnapshot(`
        {
          "block": {
            "borderRadius": 2,
            "borderWidth": 1,
            "maxWidth": 140,
            "minWidth": 80,
            "padding": 6,
          },
          "colors": {
            "background": "#FFFFFF",
            "border": "#D1D5DB",
            "text": "#1F2937",
            "unit": "#6B7280",
            "value": "#111827",
          },
          "fields": [
            {
              "key": "Un",
              "label": "Un",
              "unit": "kV",
            },
            {
              "key": "Ikss",
              "label": "Ik''",
              "unit": "kA",
            },
            {
              "key": "Skss",
              "label": "Sk''",
              "unit": "MVA",
            },
            {
              "key": "ip",
              "label": "ip",
              "unit": "kA",
            },
            {
              "key": "Ith",
              "label": "Ith",
              "unit": "kA",
            },
          ],
          "labelValueGap": 8,
          "leader": {
            "dashArray": "4,2",
            "length": 30,
            "nodeOffset": 20,
            "strokeColor": "#6B7280",
            "strokeWidth": 1,
          },
          "rowHeight": 16,
        }
      `);
    });
  });

  describe('Stroke Hierarchy Invariants', () => {
    it('busbar stroke is thicker than feeder', () => {
      expect(CANONICAL_STROKE.busbar).toBeGreaterThan(CANONICAL_STROKE.feeder);
    });

    it('feeder stroke is thicker than symbol', () => {
      expect(CANONICAL_STROKE.feeder).toBeGreaterThan(CANONICAL_STROKE.symbol);
    });

    it('symbol stroke is thicker than aux', () => {
      expect(CANONICAL_STROKE.symbol).toBeGreaterThan(CANONICAL_STROKE.aux);
    });

    it('aux stroke is thicker than or equal to leader', () => {
      expect(CANONICAL_STROKE.aux).toBeGreaterThanOrEqual(CANONICAL_STROKE.leader);
    });

    it('selected strokes are thicker than normal', () => {
      expect(CANONICAL_STROKE_SELECTED.busbar).toBeGreaterThan(CANONICAL_STROKE.busbar);
      expect(CANONICAL_STROKE_SELECTED.feeder).toBeGreaterThan(CANONICAL_STROKE.feeder);
      expect(CANONICAL_STROKE_SELECTED.symbol).toBeGreaterThan(CANONICAL_STROKE.symbol);
    });
  });

  describe('Helper Functions', () => {
    describe('getKrokVoltageColor', () => {
      it('returns WN color for high voltage', () => {
        expect(getKrokVoltageColor(110)).toBe(CANONICAL_VOLTAGE_COLORS.WN);
        expect(getKrokVoltageColor(220)).toBe(CANONICAL_VOLTAGE_COLORS.WN);
        expect(getKrokVoltageColor('400')).toBe(CANONICAL_VOLTAGE_COLORS.WN);
      });

      it('returns SN color for medium voltage', () => {
        expect(getKrokVoltageColor(10)).toBe(CANONICAL_VOLTAGE_COLORS.SN);
        expect(getKrokVoltageColor(15)).toBe(CANONICAL_VOLTAGE_COLORS.SN);
        expect(getKrokVoltageColor(20)).toBe(CANONICAL_VOLTAGE_COLORS.SN);
        expect(getKrokVoltageColor('30')).toBe(CANONICAL_VOLTAGE_COLORS.SN);
      });

      it('returns nN color for low voltage', () => {
        expect(getKrokVoltageColor(0.4)).toBe(CANONICAL_VOLTAGE_COLORS.nN);
        expect(getKrokVoltageColor('0.23')).toBe(CANONICAL_VOLTAGE_COLORS.nN);
      });

      it('returns default color for unknown voltage', () => {
        expect(getKrokVoltageColor(999)).toBe(CANONICAL_VOLTAGE_COLORS.default);
        expect(getKrokVoltageColor(undefined)).toBe(CANONICAL_VOLTAGE_COLORS.default);
      });
    });

    describe('getKrokStrokeColor', () => {
      it('returns selected color when selected', () => {
        expect(getKrokStrokeColor({ selected: true })).toBe(CANONICAL_STATE_COLORS.selected);
      });

      it('returns out of service color when not in service', () => {
        expect(getKrokStrokeColor({ inService: false })).toBe(CANONICAL_STATE_COLORS.outOfService);
      });

      it('returns deenergized color when not energized', () => {
        expect(getKrokStrokeColor({ energized: false })).toBe(CANONICAL_STATE_COLORS.deenergized);
      });

      it('returns voltage color when energized', () => {
        expect(getKrokStrokeColor({ voltageKV: 20 })).toBe(CANONICAL_VOLTAGE_COLORS.SN);
      });
    });

    describe('getKrokFillColor', () => {
      it('returns selected fill when selected', () => {
        expect(getKrokFillColor({ selected: true })).toBe(CANONICAL_FILL_COLORS.selected);
      });

      it('returns deenergized fill when not energized', () => {
        expect(getKrokFillColor({ energized: false })).toBe(CANONICAL_FILL_COLORS.deenergized);
      });

      it('returns normal fill by default', () => {
        expect(getKrokFillColor({})).toBe(CANONICAL_FILL_COLORS.normal);
      });
    });

    describe('getKrokOpacity', () => {
      it('returns 0.5 when not in service', () => {
        expect(getKrokOpacity({ inService: false })).toBe(0.5);
      });

      it('returns 0.7 when not energized', () => {
        expect(getKrokOpacity({ energized: false })).toBe(0.7);
      });

      it('returns 1 by default', () => {
        expect(getKrokOpacity({})).toBe(1);
      });
    });

    describe('getCanonicalLabelAnchor', () => {
      it('returns correct anchor for Bus', () => {
        expect(getCanonicalLabelAnchor('Bus')).toBe(CANONICAL_LABEL_ANCHORS.Bus);
      });

      it('returns correct anchor for Switch', () => {
        expect(getCanonicalLabelAnchor('Switch')).toBe(CANONICAL_LABEL_ANCHORS.Switch);
      });

      it('returns default anchor for unknown type', () => {
        expect(getCanonicalLabelAnchor('Unknown')).toBe(CANONICAL_LABEL_ANCHORS.default);
      });
    });

    describe('getCanonicalSymbolSize', () => {
      it('returns correct size for Bus', () => {
        expect(getCanonicalSymbolSize('Bus')).toEqual(CANONICAL_SYMBOL_SIZES.Bus);
      });

      it('returns default size for unknown type', () => {
        expect(getCanonicalSymbolSize('Unknown')).toEqual(CANONICAL_SYMBOL_SIZES.default);
      });
    });

    describe('getKrokStrokeWidth', () => {
      it('returns correct stroke for busbar', () => {
        expect(getKrokStrokeWidth('busbar')).toBe(CANONICAL_STROKE.busbar);
        expect(getKrokStrokeWidth('busbar', true)).toBe(CANONICAL_STROKE_SELECTED.busbar);
      });

      it('returns correct stroke for feeder', () => {
        expect(getKrokStrokeWidth('feeder')).toBe(CANONICAL_STROKE.feeder);
        expect(getKrokStrokeWidth('feeder', true)).toBe(CANONICAL_STROKE_SELECTED.feeder);
      });
    });
  });

  // ==========================================================================
  // LINE LABEL PLACEMENT (PR-SLD-CANONICAL-LABELS-01)
  // ==========================================================================

  describe('Line Label Placement', () => {
    describe('CANONICAL_LINE_LABEL tokens', () => {
      it('has correct offset value', () => {
        expect(CANONICAL_LINE_LABEL.offset).toBe(8);
      });

      it('has correct halo settings', () => {
        expect(CANONICAL_LINE_LABEL.haloPadding).toBe(2);
        expect(CANONICAL_LINE_LABEL.haloColor).toBe('#FFFFFF');
        expect(CANONICAL_LINE_LABEL.haloOpacity).toBe(0.9);
      });
    });

    describe('parsePathSegments', () => {
      it('returns empty array for empty path', () => {
        expect(parsePathSegments([])).toEqual([]);
        expect(parsePathSegments([{ x: 0, y: 0 }])).toEqual([]);
      });

      it('parses single horizontal segment', () => {
        const path = [
          { x: 0, y: 100 },
          { x: 200, y: 100 },
        ];
        const segments = parsePathSegments(path);

        expect(segments).toHaveLength(1);
        expect(segments[0].orientation).toBe('horizontal');
        expect(segments[0].length).toBe(200);
        expect(segments[0].midpoint).toEqual({ x: 100, y: 100 });
        expect(segments[0].perpendicular).toEqual({ x: 0, y: -1 }); // above
      });

      it('parses single vertical segment', () => {
        const path = [
          { x: 100, y: 0 },
          { x: 100, y: 200 },
        ];
        const segments = parsePathSegments(path);

        expect(segments).toHaveLength(1);
        expect(segments[0].orientation).toBe('vertical');
        expect(segments[0].length).toBe(200);
        expect(segments[0].midpoint).toEqual({ x: 100, y: 100 });
        expect(segments[0].perpendicular).toEqual({ x: -1, y: 0 }); // left
      });

      it('parses multi-segment orthogonal path', () => {
        // L-shaped path: horizontal then vertical
        const path = [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
        ];
        const segments = parsePathSegments(path);

        expect(segments).toHaveLength(2);
        expect(segments[0].orientation).toBe('horizontal');
        expect(segments[0].length).toBe(100);
        expect(segments[1].orientation).toBe('vertical');
        expect(segments[1].length).toBe(50);
      });

      it('assigns correct indices to segments', () => {
        const path = [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];
        const segments = parsePathSegments(path);

        expect(segments[0].index).toBe(0);
        expect(segments[1].index).toBe(1);
        expect(segments[2].index).toBe(2);
      });
    });

    describe('selectLabelSegment', () => {
      it('returns null for empty segments', () => {
        expect(selectLabelSegment([])).toBeNull();
      });

      it('selects longest segment', () => {
        const segments: LineSegment[] = [
          {
            start: { x: 0, y: 0 },
            end: { x: 50, y: 0 },
            index: 0,
            length: 50,
            orientation: 'horizontal',
            midpoint: { x: 25, y: 0 },
            perpendicular: { x: 0, y: -1 },
          },
          {
            start: { x: 50, y: 0 },
            end: { x: 50, y: 100 },
            index: 1,
            length: 100, // longest
            orientation: 'vertical',
            midpoint: { x: 50, y: 50 },
            perpendicular: { x: -1, y: 0 },
          },
        ];

        const selected = selectLabelSegment(segments);
        expect(selected?.index).toBe(1);
        expect(selected?.length).toBe(100);
      });

      it('prefers horizontal over vertical when lengths are equal (tie-break)', () => {
        const segments: LineSegment[] = [
          {
            start: { x: 0, y: 0 },
            end: { x: 0, y: 100 },
            index: 0,
            length: 100,
            orientation: 'vertical',
            midpoint: { x: 0, y: 50 },
            perpendicular: { x: -1, y: 0 },
          },
          {
            start: { x: 0, y: 100 },
            end: { x: 100, y: 100 },
            index: 1,
            length: 100, // same length
            orientation: 'horizontal', // preferred
            midpoint: { x: 50, y: 100 },
            perpendicular: { x: 0, y: -1 },
          },
        ];

        const selected = selectLabelSegment(segments);
        expect(selected?.orientation).toBe('horizontal');
        expect(selected?.index).toBe(1);
      });

      it('prefers lower index when everything else is equal (tie-break)', () => {
        const segments: LineSegment[] = [
          {
            start: { x: 0, y: 0 },
            end: { x: 100, y: 0 },
            index: 0,
            length: 100,
            orientation: 'horizontal',
            midpoint: { x: 50, y: 0 },
            perpendicular: { x: 0, y: -1 },
          },
          {
            start: { x: 100, y: 0 },
            end: { x: 200, y: 0 },
            index: 1,
            length: 100, // same length, same orientation
            orientation: 'horizontal',
            midpoint: { x: 150, y: 0 },
            perpendicular: { x: 0, y: -1 },
          },
        ];

        const selected = selectLabelSegment(segments);
        expect(selected?.index).toBe(0); // lower index wins
      });
    });

    describe('calculateLineLabelPosition', () => {
      it('returns null for path with fewer than 2 points', () => {
        expect(calculateLineLabelPosition([])).toBeNull();
        expect(calculateLineLabelPosition([{ x: 0, y: 0 }])).toBeNull();
      });

      it('places label above horizontal segment', () => {
        const path = [
          { x: 0, y: 100 },
          { x: 200, y: 100 },
        ];
        const result = calculateLineLabelPosition(path);

        expect(result).not.toBeNull();
        expect(result?.position.x).toBe(100); // midpoint x
        expect(result?.position.y).toBe(100 - CANONICAL_LINE_LABEL.offset); // above
        expect(result?.offsetDirection).toBe('above');
        expect(result?.textAnchor).toBe('middle');
      });

      it('places label to the left of vertical segment', () => {
        const path = [
          { x: 100, y: 0 },
          { x: 100, y: 200 },
        ];
        const result = calculateLineLabelPosition(path);

        expect(result).not.toBeNull();
        expect(result?.position.x).toBe(100 - CANONICAL_LINE_LABEL.offset); // left
        expect(result?.position.y).toBe(100); // midpoint y
        expect(result?.offsetDirection).toBe('left');
      });

      it('selects longest segment for multi-segment path', () => {
        const path = [
          { x: 0, y: 0 },
          { x: 50, y: 0 }, // short horizontal (50px)
          { x: 50, y: 150 }, // long vertical (150px) — should be selected
          { x: 100, y: 150 }, // short horizontal (50px)
        ];
        const result = calculateLineLabelPosition(path);

        expect(result).not.toBeNull();
        expect(result?.segmentIndex).toBe(1); // the long vertical segment
        expect(result?.offsetDirection).toBe('left');
      });
    });

    describe('DETERMINISM', () => {
      it('produces identical output for identical input (single segment)', () => {
        const path = [
          { x: 100, y: 200 },
          { x: 300, y: 200 },
        ];

        const result1 = calculateLineLabelPosition(path, 'conn-1');
        const result2 = calculateLineLabelPosition(path, 'conn-1');

        expect(result1).toEqual(result2);
      });

      it('produces identical output for identical input (multi-segment)', () => {
        const path = [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ];

        const result1 = calculateLineLabelPosition(path, 'conn-complex');
        const result2 = calculateLineLabelPosition(path, 'conn-complex');

        expect(result1).toEqual(result2);
      });

      it('produces consistent segment selection across multiple runs', () => {
        const path = [
          { x: 0, y: 0 },
          { x: 80, y: 0 }, // 80px horizontal
          { x: 80, y: 80 }, // 80px vertical (tie with first, but horizontal preferred)
          { x: 160, y: 80 }, // 80px horizontal (tie, but lower index wins)
        ];

        // Run 100 times to ensure no randomness
        const results = Array.from({ length: 100 }, () =>
          calculateLineLabelPosition(path, 'conn-tie')
        );

        // All results should be identical
        for (const result of results) {
          expect(result?.segmentIndex).toBe(0); // first horizontal wins
          expect(result?.offsetDirection).toBe('above');
        }
      });
    });

    describe('checkLabelSymbolCollision', () => {
      it('detects collision when label overlaps symbol', () => {
        const labelPos = { x: 100, y: 100 };
        const labelWidth = 50;
        const labelHeight = 12;
        const symbolBounds = { x: 80, y: 90, width: 40, height: 40 };

        expect(checkLabelSymbolCollision(labelPos, labelWidth, labelHeight, symbolBounds)).toBe(true);
      });

      it('returns false when label is far from symbol', () => {
        const labelPos = { x: 100, y: 100 };
        const labelWidth = 50;
        const labelHeight = 12;
        const symbolBounds = { x: 200, y: 200, width: 40, height: 40 };

        expect(checkLabelSymbolCollision(labelPos, labelWidth, labelHeight, symbolBounds)).toBe(false);
      });

      it('respects clearance parameter', () => {
        const labelPos = { x: 100, y: 100 };
        const labelWidth = 40;
        const labelHeight = 12;
        // Symbol just outside label bounds
        const symbolBounds = { x: 125, y: 90, width: 40, height: 40 };

        // Without clearance, no collision
        expect(checkLabelSymbolCollision(labelPos, labelWidth, labelHeight, symbolBounds, 0)).toBe(false);

        // With clearance, collision detected
        expect(checkLabelSymbolCollision(labelPos, labelWidth, labelHeight, symbolBounds, 10)).toBe(true);
      });
    });

    describe('nudgeLabelPosition', () => {
      it('nudges label further in perpendicular direction', () => {
        const labelPos = { x: 100, y: 92 }; // 8px above line at y=100
        const segment: LineSegment = {
          start: { x: 0, y: 100 },
          end: { x: 200, y: 100 },
          index: 0,
          length: 200,
          orientation: 'horizontal',
          midpoint: { x: 100, y: 100 },
          perpendicular: { x: 0, y: -1 }, // above
        };

        const nudged = nudgeLabelPosition(labelPos, segment);

        // Should move further up (negative y)
        expect(nudged.y).toBeLessThan(labelPos.y);
        expect(nudged.x).toBe(labelPos.x); // no horizontal change
      });

      it('uses default nudge distance of 2x offset', () => {
        const labelPos = { x: 100, y: 92 };
        const segment: LineSegment = {
          start: { x: 0, y: 100 },
          end: { x: 200, y: 100 },
          index: 0,
          length: 200,
          orientation: 'horizontal',
          midpoint: { x: 100, y: 100 },
          perpendicular: { x: 0, y: -1 },
        };

        const nudged = nudgeLabelPosition(labelPos, segment);
        const expectedY = labelPos.y - CANONICAL_LINE_LABEL.offset * 2;

        expect(nudged.y).toBe(expectedY);
      });

      it('allows custom nudge distance', () => {
        const labelPos = { x: 100, y: 92 };
        const segment: LineSegment = {
          start: { x: 0, y: 100 },
          end: { x: 200, y: 100 },
          index: 0,
          length: 200,
          orientation: 'horizontal',
          midpoint: { x: 100, y: 100 },
          perpendicular: { x: 0, y: -1 },
        };

        const nudged = nudgeLabelPosition(labelPos, segment, 30);

        expect(nudged.y).toBe(labelPos.y - 30);
      });
    });
  });
});
