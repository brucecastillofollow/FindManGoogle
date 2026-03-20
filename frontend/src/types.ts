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
