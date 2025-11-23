export type AdaptiveModelTier = 'WEAK' | 'MEDIUM' | 'STRONG' | 'PLANNING';

export function normalizeAdaptiveTier(tier?: string | null): AdaptiveModelTier {
  switch ((tier || '').toUpperCase()) {
    case 'WEAK':
      return 'WEAK';
    case 'MEDIUM':
      return 'MEDIUM';
    case 'PLANNING':
      return 'PLANNING';
    case 'STRONG':
    default:
      return 'STRONG';
  }
}
