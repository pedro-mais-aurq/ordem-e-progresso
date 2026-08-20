export interface GradebookContextOption {
  key: string;
}

export function resolveAuthorizedContextKey(
  options: GradebookContextOption[],
  requestedKey: string,
): string {
  if (requestedKey && options.some((option) => option.key === requestedKey)) {
    return requestedKey;
  }
  return options[0]?.key ?? "";
}

export function createLatestContextRequestSequence() {
  let latest = 0;

  return {
    issue(): number {
      latest += 1;
      return latest;
    },
    isLatest(requestId: number): boolean {
      return requestId === latest;
    },
  };
}
