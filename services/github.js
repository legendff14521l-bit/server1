const axios = require("axios");

const githubClient = axios.create({
  baseURL: "https://api.github.com",
  timeout: 10000
});

/**
 * Build headers for GitHub requests.
 * Works with:
 *  ✔ GitHub token (higher rate limit)
 *  ✔ No token (anonymous mode, 60 req/hr)
 */
function getAuthHeaders() {
  const token = process.env.GITHUB_TOKEN;

  const base = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "workability-app"
  };

  if (!token) return base;

  return {
    ...base,
    Authorization: `Bearer ${token}`
  };
}

/**
 * Fetch GitHub user profile details.
 */
async function fetchGitHubUser(username) {
  try {
    const res = await githubClient.get(`/users/${username}`, {
      headers: getAuthHeaders()
    });
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) {
      throw new Error("USER_NOT_FOUND");
    }
    if (err.response?.status === 403) {
      // Rate limited or token expired
      throw new Error("RATE_LIMIT");
    }
    throw err;
  }
}

/**
 * Fetch user repositories.
 *
 * limit defaults to 50 but can be increased to 100.
 */
async function fetchUserRepos(username, limit = 50) {
  try {
    const res = await githubClient.get(`/users/${username}/repos`, {
      headers: getAuthHeaders(),
      params: {
        sort: "updated",
        per_page: limit,
        type: "owner"
      }
    });
    return res.data;
  } catch (err) {
    if (err.response?.status === 403) {
      throw new Error("RATE_LIMIT");
    }
    throw err;
  }
}

/**
 * Fetch language usage for a repository.
 * Returns empty object {} on ANY error (safe fallback).
 */
async function fetchRepoLanguages(owner, repo) {
  try {
    const res = await githubClient.get(`/repos/${owner}/${repo}/languages`, {
      headers: getAuthHeaders()
    });
    return res.data || {};
  } catch (err) {
    return {};
  }
}

/**
 * Fetch recent commits for a repository.
 * - Returns [] on errors or rate limits.
 * - Does NOT crash the system.
 */
async function fetchRepoCommits(owner, repo, limit = 20) {
  try {
    const res = await githubClient.get(`/repos/${owner}/${repo}/commits`, {
      headers: getAuthHeaders(),
      params: {
        per_page: limit
      }
    });
    return res.data || [];
  } catch (err) {
    if (err.response?.status === 403) return [];
    if (err.response?.status === 409) return []; // empty repo / no commits
    return [];
  }
}

module.exports = {
  fetchGitHubUser,
  fetchUserRepos,
  fetchRepoLanguages,
  fetchRepoCommits
};
