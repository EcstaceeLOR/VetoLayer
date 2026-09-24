export type GitHubChangedFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
};

export type GitHubReview = {
  user: string;
  state: string;
  submittedAt?: string;
};

export type GitHubCheck = {
  name: string;
  status: string;
  conclusion?: string;
};

export type GitHubPullRequestSnapshot = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  headSha: string;
  baseBranch: string;
  draft: boolean;
  merged: boolean;
  changedFiles: GitHubChangedFile[];
  reviews: GitHubReview[];
  checks: GitHubCheck[];
};

export type GitHubClientConfig = {
  token: string;
  apiBaseUrl?: string;
};

export function createGitHubEvidenceClient(
  config: GitHubClientConfig,
  fetchImpl: typeof fetch = fetch,
) {
  const apiBaseUrl = (config.apiBaseUrl ?? "https://api.github.com").replace(/\/+$/, "");

  async function request<T>(path: string): Promise<T> {
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} while fetching ${path}`);
    }

    return (await response.json()) as T;
  }

  return {
    async collectPullRequest(
      owner: string,
      repo: string,
      number: number,
    ): Promise<GitHubPullRequestSnapshot> {
      const pull = await request<{
        title: string;
        html_url: string;
        draft: boolean;
        merged: boolean;
        head: { sha: string };
        base: { ref: string };
      }>(`/repos/${owner}/${repo}/pulls/${number}`);

      const [files, reviews, checks] = await Promise.all([
        request<Array<{ filename: string; status: string; additions: number; deletions: number }>>(
          `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`,
        ),
        request<Array<{ state: string; submitted_at?: string; user?: { login?: string } }>>(
          `/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`,
        ),
        request<{
          check_runs: Array<{ name: string; status: string; conclusion?: string | null }>;
        }>(`/repos/${owner}/${repo}/commits/${pull.head.sha}/check-runs?per_page=100`),
      ]);

      return {
        owner,
        repo,
        number,
        title: pull.title,
        url: pull.html_url,
        headSha: pull.head.sha,
        baseBranch: pull.base.ref,
        draft: pull.draft,
        merged: pull.merged,
        changedFiles: files,
        reviews: reviews.map((review) => ({
          user: review.user?.login ?? "unknown",
          state: review.state,
          ...(review.submitted_at ? { submittedAt: review.submitted_at } : {}),
        })),
        checks: checks.check_runs.map((check) => ({
          name: check.name,
          status: check.status,
          ...(check.conclusion ? { conclusion: check.conclusion } : {}),
        })),
      };
    },
  };
}
