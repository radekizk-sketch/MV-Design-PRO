import { describe, expect, it } from 'vitest';
import { odczytajWarstwyWms } from '../gisWmsR11';

const caps = () => '<?xml version="1.0"?><WMS_Capabilities version="1.3.0">' +
  '<Capability><Layer><Title>Krajowa usługa (syntetyczna)</Title><CRS>EPSG:3857</CRS>' +
  '<Layer><Name>TEST_WMS</Name><Title>Testowa warstwa</Title></Layer>' +
  '</Layer></Capability></WMS_Capabilities>';

describe('GIS R11: bezpieczne lokalne GetCapabilities', () => {
  it('dziedziczy CRS warstwy nadrzędnej', () => {
    expect(odczytajWarstwyWms(caps())).toEqual([{ name: 'TEST_WMS', title: 'Testowa warstwa' }]);
  });
  it('nie traktuje nazwy widocznej użytkownikowi jako Name', () => {
    expect(odczytajWarstwyWms(caps())[0].name).toBe('TEST_WMS');
  });
  it('odrzuca brak EPSG:3857', () =>
    expect(odczytajWarstwyWms(caps().replace('EPSG:3857','EPSG:2180'))).toEqual([]));
  it('odrzuca XML z DTD', () =>
    expect(() => odczytajWarstwyWms('<!DOCTYPE x [<!ENTITY y "bad">]>'+caps())).toThrow('XML_NIEDOZWOLONY'));
  it('odrzuca nieobsługiwaną wersję', () =>
    expect(() => odczytajWarstwyWms(caps().replace('version="1.3.0"', 'version="1.1.1"')))
      .toThrow('NIEZGODNY_WMS_1_3_0'));
  it('odrzuca wielokrotne identyfikatory Name', () => {
    const same = '<Layer><Name>TEST_WMS</Name><Title>Duplikat</Title></Layer>';
    expect(() => odczytajWarstwyWms(caps().replace('</Layer></Capability>',same+'</Layer></Capability>')))
      .toThrow('NAZWA_WARSTWY_NIEDOZWOLONA');
  });
  it('odrzuca wstrzyknięte parametry w Name', () =>
    expect(() => odczytajWarstwyWms(caps().replace('TEST_WMS', 'test&amp;REQUEST=DELETE')))
      .toThrow('NAZWA_WARSTWY_NIEDOZWOLONA'));
});
