export declare function isRealVersion(value: unknown): boolean

export declare function gitVersion(): string | null

export declare function envFileVersion(...searchDirs: string[]): string | null

export declare function resolveVersion(
  configured: string | undefined,
  options?: { getGitVersion?: () => string | null; envFileDirs?: string[] },
): string | null
