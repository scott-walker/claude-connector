import type { SettingSource } from './client.js';

/**
 * Claude Code settings, as found in `settings.json` at any tier.
 *
 * Aliased directly from the SDK: the interface is auto-generated from the
 * settings JSON schema and is ~2500 lines, so it is tracked rather than copied
 * — a schema regeneration in a future SDK bump propagates here for free.
 *
 * @example
 * ```ts
 * const settings: Settings = {
 *   model: 'claude-sonnet-4-6',
 *   permissions: { allow: ['Read(*)'] },
 * }
 * ```
 */
export type Settings = import('@anthropic-ai/claude-agent-sdk').Settings;

// ── Settings resolution ───────────────────────────────────────────

/**
 * Source that contributed an effective setting value.
 *
 * Filesystem tiers reuse {@link SettingSource}; `'managed'` is the policy tier
 * (`managed-settings.json`, MDM, or the `managedSettings` option) and `'flag'`
 * is the `--settings` CLI flag tier, which wins over everything else.
 *
 * @alpha
 */
export type ResolvedSettingSource = SettingSource | 'managed' | 'flag';

/**
 * Which policy sub-source supplied a `'managed'` value.
 *
 * - `'helper'` — the admin-configured `policyHelper` subprocess
 * - `'remote'` — server-managed settings (cached or passed in)
 * - `'plist'` — macOS MDM profile
 * - `'hklm'` / `'hkcu'` — Windows registry policy
 * - `'file'` — on-disk `managed-settings.json`
 * - `'parent'` — inherited from a parent process
 *
 * @alpha
 */
export type PolicySettingsOrigin =
  | 'helper'
  | 'remote'
  | 'plist'
  | 'hklm'
  | 'file'
  | 'parent'
  | 'hkcu';

/**
 * Where a single resolved setting key came from.
 *
 * @alpha
 */
export interface ProvenanceEntry {
  /** Tier that supplied the winning value. */
  readonly source: ResolvedSettingSource;

  /** Absolute path to the settings file, for filesystem-backed sources. */
  readonly path?: string;

  /** Which policy sub-source supplied the value, when `source === 'managed'`. */
  readonly policyOrigin?: PolicySettingsOrigin;
}

/**
 * One tier of the settings cascade, with its raw (unmerged) contents.
 *
 * @alpha
 */
export interface ResolvedSettingsLayer {
  /** Tier this layer represents. */
  readonly source: ResolvedSettingSource;

  /** Raw settings read from this tier, before merging. */
  readonly settings: Settings;

  /** Absolute path to the settings file, for filesystem-backed sources. */
  readonly path?: string;

  /** Policy sub-source, when `source === 'managed'`. */
  readonly policyOrigin?: PolicySettingsOrigin;
}

/**
 * The effective settings a `query()` would see, plus where each value came from.
 *
 * @alpha
 *
 * @example
 * ```ts
 * const resolved = await resolveSettings({ cwd: process.cwd() })
 * console.log(resolved.effective.model)
 * console.log(resolved.provenance.model?.source) // 'project' | 'managed' | ...
 * ```
 */
export interface ResolvedSettings {
  /** Merged settings after applying every enabled source in precedence order. */
  readonly effective: Settings;

  /** For each top-level key of `effective`, the tier that supplied the value. */
  readonly provenance: Partial<Record<keyof Settings, ProvenanceEntry>>;

  /**
   * Per-source raw settings, low to high precedence. Use this when per-key
   * provenance is too coarse — e.g. to see which tier set a *nested* key.
   */
  readonly sources: readonly ResolvedSettingsLayer[];
}

/**
 * Options for resolving the effective settings without spawning the CLI.
 *
 * @remarks
 * The result is the **raw settings cascade**, not a security decision:
 *
 * - The policy tier matches CLI startup (`managed-settings.json`,
 *   remote-cached managed settings, MDM via macOS plist or Windows HKLM/HKCU,
 *   and `managedSettings`) **except** that the admin-configured `policyHelper`
 *   subprocess is not executed. MDM resolution may invoke `plutil` (macOS) or
 *   `reg.exe` (Windows/WSL) on the first call per process.
 * - `permissions.defaultMode` is reported as-is across all tiers, including
 *   `project`. The CLI applies a separate trust filter before honoring
 *   escalating modes (`bypassPermissions`, `auto`, `acceptEdits`) from
 *   repo-committed files — pass the result through the SDK's
 *   `filterEscalatingDefaultMode()` before acting on `defaultMode`.
 *
 * @alpha
 */
export interface ResolveSettingsOptions {
  /**
   * Directory to resolve `project`/`local` settings relative to.
   * Defaults to the current process's working directory.
   */
  readonly cwd?: string;

  /**
   * Which filesystem tiers to load. When omitted, all of them are loaded
   * (matching CLI defaults). Pass `[]` to skip user/project/local entirely —
   * the managed-settings policy tier is still read from disk.
   */
  readonly settingSources?: readonly SettingSource[];

  /**
   * Restrictive policy-tier settings — the equivalent of `managedSettings` on a
   * query. Feeds the lowest-precedence policy sub-source and is filtered through
   * a restrictive-key allowlist (`allowManaged*Only` locks, `permissions.deny`
   * and `permissions.ask`, sandbox restrictions); non-restrictive keys such as
   * `model`, `env` or `cleanupPeriodDays` are silently dropped.
   */
  readonly managedSettings?: Settings;

  /**
   * Server-managed settings payload (the result of fetching
   * `/api/claude_code/settings`). Feeds the `'remote'` policy sub-source — the
   * same trust level as the on-disk cache it replaces, so non-restrictive keys
   * flow through unfiltered. Use it when the embedding host has a fresher
   * result than the CLI's `~/.claude/remote-settings.json` cache.
   */
  readonly serverManagedSettings?: Settings;
}
