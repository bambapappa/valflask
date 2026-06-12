/**
 * Feature flags for drygast.nu intäktsskikt (§13).
 *
 * E1 Affiliate — "Läs vidare"-modul med boklänkar. PÅ vid lansering, bakom flagga.
 * E2 Stöd    — Swish-QR + Buy Me a Coffee på /om. PÅ vid lansering (ägarsteg).
 * E3 AdSense — Displayannonser. AV vid lansering, omprövas augusti 2026.
 *
 * Aktivera genom att sätta flaggan till true. Commit och deploy.
 */
export const FEATURES = {
  /** E1: affiliate-länkar ("Läs vidare"-modul med samhällsekonomi-/politikböcker) */
  E1_AFFILIATE: false,
  /** E3: Google AdSense (kräver CMP + CSP-profil B — se bilaga C) */
  E3_ADSENSE: false,
} as const;

export type FeatureName = keyof typeof FEATURES;

export function isEnabled(feature: FeatureName): boolean {
  return FEATURES[feature] === true;
}
