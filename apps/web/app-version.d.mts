export declare function normalizeAppVersion(value: unknown): string | null

export declare function versionFileAppVersion(...searchDirs: string[]): string | null

export declare function gitVersion(): string | null

export declare function resolveAppVersion(
  configured: string | undefined,
  options?: { getGitVersion?: () => string | null; versionFileDirs?: string[] },
): string | null
