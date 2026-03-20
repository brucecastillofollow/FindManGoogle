import type { GitHubUserDetail, PersonContact } from "../types.js";

const URL_IN_TEXT =
  /https?:\/\/[^\s\)\]>"']+/gi;

/** US-style phone patterns sometimes pasted in bios (no guarantee of accuracy). */
const PHONE_PATTERNS = [
  /\b\+1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
  /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
];

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function stripTrailingPunct(url: string): string {
  return url.replace(/[.,;:!?)]+$/, "");
}

function extractUrls(...chunks: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const c of chunks) {
    if (!c) continue;
    const m = c.match(URL_IN_TEXT);
    if (m) out.push(...m.map(stripTrailingPunct));
  }
  return unique(out);
}

function extractPhones(...chunks: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const c of chunks) {
    if (!c) continue;
    for (const re of PHONE_PATTERNS) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(c)) !== null) {
        out.push(match[0].trim());
      }
    }
  }
  return unique(out);
}

function normalizeBlog(blog: string | null): string | null {
  if (!blog?.trim()) return null;
  const b = blog.trim();
  if (/^https?:\/\//i.test(b)) return b;
  return `https://${b}`;
}

export function userToContact(u: GitHubUserDetail): PersonContact {
  const blog = normalizeBlog(u.blog);
  const urlsFromText = extractUrls(u.bio, blog ?? undefined);
  const linkedInUrls: string[] = [];
  const otherSocialUrls: string[] = [];

  for (const raw of urlsFromText) {
    const lower = raw.toLowerCase();
    if (lower.includes("linkedin.com")) linkedInUrls.push(raw);
    else otherSocialUrls.push(raw);
  }

  const twitterUsername = u.twitter_username?.trim() || null;
  const twitterUrl = twitterUsername
    ? `https://twitter.com/${twitterUsername}`
    : null;

  return {
    login: u.login,
    name: u.name,
    githubUrl: u.html_url,
    avatarUrl: u.avatar_url,
    location: u.location,
    company: u.company,
    email: u.email,
    blog,
    twitterUsername,
    twitterUrl,
    linkedInUrls: unique(linkedInUrls),
    otherSocialUrls: unique(otherSocialUrls),
    phoneNumbers: extractPhones(u.bio, blog ?? undefined),
    rawBio: u.bio,
  };
}
