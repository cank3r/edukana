import type { ApprovedDemoTarget } from "./target-policy";

/**
 * Deliberately empty: no Preview database has been verified or approved yet.
 * Add only non-secret connection identities after verifying a dedicated demo DB
 * and the exact Preview environment binding. Never add passwords, URLs or API keys.
 * An environment variable alone cannot approve a remote target.
 */
export const APPROVED_DEMO_TARGETS: readonly ApprovedDemoTarget[] = Object.freeze([]);
