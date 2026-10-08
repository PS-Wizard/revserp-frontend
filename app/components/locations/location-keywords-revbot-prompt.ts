export function buildLocationFindKeywordsPrompt({
  projectId,
  locationId,
}: {
  projectId: string
  locationId: string
}): string {
  return `Find localized keywords for this location only. Scope: project ${projectId}, location ${locationId}. Never touch the parent project or any sibling location.

1. Call get_business_profile with include_seed_prompts: true, get_project_keywords, and get_location_landmarks to read THIS location's own profile, services, verified geometry/locality, saved nearby landmarks, seed prompts, product description, and saved user-defined, Revserp-suggested, and selected lists.
2. Ground every suggestion only in this location's saved services, locality/geography, and saved landmarks. Never invent a landmark, service, or locality.
3. Write the suggestions with update_project_keywords, passing source: "revserp" plus both complete lists: brand_keywords and non_brand_keywords, localized to this location's local buyer intent. This replaces only this location's Revserp-suggested lists.
4. Preserve the user's own keywords and the selected list. This write must not change user-defined keywords and must not select or enable anything.
5. Update this location's own seed prompts, and only the location-scoped business profile fields that should carry localized intent, with update_business_profile so its AI questions localize. Preserve product_description exactly: omit product_description from every update_business_profile call.
6. Never charge credits, regenerate AI questions, or start a Maps or AI run. Stop after these writes; the user starts any generation explicitly.`
}
