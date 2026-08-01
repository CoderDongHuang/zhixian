export type FeedItem = { id: string; eventId: string; title: string; topic: string | null; summary: string; confidence: number; bookmarked: boolean; publishedAt: string };
export type LearningPath = { id: string; title: string; goal: string; level: string; progress: number };
export type LearningTask = { id: string; title: string; description: string; estimatedMinutes: number; completedAt: string | null; scheduledFor: string };
export type SyncSnapshot = { bookmarks: { feedItemId: string }[]; reads: { feedItemId: string }[]; paths: LearningPath[]; tasks: LearningTask[] };
export type SessionTokens = { accessToken: string; refreshToken: string; expiresIn: number; account?: { email: string | null; linked: boolean } };
