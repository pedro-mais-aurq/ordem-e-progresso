function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export function deriveGitHubPagesBasePath(
  repository = process.env.GITHUB_REPOSITORY ?? "",
  explicitBasePath = process.env.GITHUB_PAGES_BASE_PATH ?? "",
): string {
  if (explicitBasePath.trim()) return normalizeBasePath(explicitBasePath);
  const [owner, repositoryName] = repository.split("/");
  if (!owner || !repositoryName || repositoryName === `${owner}.github.io`) {
    return "";
  }
  return normalizeBasePath(repositoryName);
}

export const PUBLIC_BASE_PATH = normalizeBasePath(
  process.env.NEXT_PUBLIC_BASE_PATH ?? "",
);

export function withBasePath(path: string, basePath = PUBLIC_BASE_PATH): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (!basePath || path === basePath || path.startsWith(`${basePath}/`)) return path;
  return `${normalizeBasePath(basePath)}${path}`;
}
