import { describe, expect, it } from 'vitest';
import { statusColor, systemObservation } from './serviceStatus';
const service = (status: string) => ({ status, statusText: status, statusColor: '', details: {} });
describe('system observations', () => {
  it('does not infer healthy collection from the browser or database', () => {
    expect(
      systemObservation({
        database: service('OK'),
        opcua: service('UNKNOWN'),
        overall: service('CONNECTED'),
      }).status,
    ).toBe('UNKNOWN');
    expect(statusColor('UNKNOWN')).toBe('default');
    expect(
      systemObservation({
        database: service('OK'),
        opcua: service('OK'),
        overall: service('UNKNOWN'),
      }).status,
    ).toBe('UNKNOWN');
  });
  it('reports a known failure even when another service is unknown', () => {
    expect(
      systemObservation({
        database: service('ERROR'),
        opcua: service('UNKNOWN'),
        overall: service('CONNECTED'),
      }).status,
    ).toBe('ERROR');
  });
  it('requires all observations for a connected summary and retains degradation', () => {
    expect(
      systemObservation({
        database: service('OK'),
        opcua: service('CONNECTED'),
        overall: service('CONNECTED'),
      }).status,
    ).toBe('CONNECTED');
    expect(
      systemObservation({
        database: service('OK'),
        opcua: service('WARNING'),
        overall: service('CONNECTED'),
      }).status,
    ).toBe('WARNING');
  });
});
