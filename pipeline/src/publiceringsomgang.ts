/** Ett publiceringsbeslut begärs bara för en planerad eller uttryckligt beställd omgång. */
export function arPubliceringsomgang(event: string, ref: string, manuellt: string): boolean {
  return ref === "refs/heads/main" && (event === "schedule" || (event === "workflow_dispatch" && manuellt === "true"));
}
