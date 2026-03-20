export interface GitHubUserSearchItem {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

export interface GitHubUserDetail {
  login: string;
  id: number;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  bio: string | null;
  twitter_username: string | null;
  html_url: string;
  avatar_url: string;
}

export interface PersonContact {
  login: string;
  name: string | null;
  githubUrl: string;
  avatarUrl: string;
  location: string | null;
  company: string | null;
  email: string | null;
  blog: string | null;
  twitterUsername: string | null;
  twitterUrl: string | null;
  linkedInUrls: string[];
  otherSocialUrls: string[];
  phoneNumbers: string[];
  rawBio: string | null;
}

export interface SearchResponse {
  totalCount: number;
  incompleteResults: boolean;
  people: PersonContact[];
  page: number;
  perPage: number;
  usedTokens: number;
}

/** Saved row returned by GET /api/saved and stored in SQLite. */
export interface SavedPersonRow {
  login: string;
  note: string;
  savedAt: string;
  person: PersonContact;
}
