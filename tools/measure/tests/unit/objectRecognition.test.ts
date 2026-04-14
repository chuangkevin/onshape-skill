import { describe, it, expect } from 'vitest';
import { buildAnalysisResult } from '../../src/server/services/objectRecognition.js';

describe('buildAnalysisResult', () => {
  it('preserves vehicle identification and dimensions in the final video result', () => {
    const result = buildAnalysisResult(
      {
        object_type: 'car',
        common_name: 'sport utility vehicle',
        model_number: null,
        manufacturer: 'Lamborghini',
        description: 'A high-performance SUV',
        estimated_size_class: 'vehicle',
      },
      [],
      {
        found: true,
        make: 'Lamborghini',
        model: 'Urus',
        year: 2023,
        variant: 'S',
        view_angle: 'three_quarter',
      },
      {
        length_mm: 5112,
        width_mm: 2016,
        height_mm: 1638,
        wheelbase_mm: 3003,
      },
    );

    expect(result.vehicle?.make).toBe('Lamborghini');
    expect(result.vehicle?.model).toBe('Urus');
    expect(result.vehicle_dimensions?.length_mm).toBe(5112);
    expect(result.modelling_ready).toBe(false);
  });
});
