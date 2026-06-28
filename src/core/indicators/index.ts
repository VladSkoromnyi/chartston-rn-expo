/**
 * Indicators (PLAN §6.3, RESEARCH §9): the pure {@link calculators} plus a small
 * registry of declarative {@link StudyDescriptor}s so consumers can ship their own.
 */

import type { StudyDescriptor } from '../../types';

export * from './calculators';

const registry = new Map<string, StudyDescriptor>();

export function registerStudy(descriptor: StudyDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

export function getStudy(id: string): StudyDescriptor | undefined {
  return registry.get(id);
}

export function listStudies(): StudyDescriptor[] {
  return [...registry.values()];
}
