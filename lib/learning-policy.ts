export type LearningQuestion = {
  id: string;
  concept: string;
  prompt: string;
  kind: "single" | "multi";
  options: string[];
  correctAnswers: string[];
  explanation: string;
};

export type LearningExercise = {
  version: 1;
  instructions: string;
  deliverable: string;
  questions: LearningQuestion[];
};

export type PublicLearningExercise = Omit<LearningExercise, "questions"> & {
  questions: Omit<LearningQuestion, "correctAnswers" | "explanation">[];
};

export type LearningSubmission = {
  answers: Record<string, string[]>;
  selfRating: number;
  reflection: string;
  output: string;
};

const TYPES = new Set(["READING", "PRACTICE", "CODE", "REVIEW"]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim().slice(0, maxLength)] : []))].slice(0, maxItems);
}

export function parseLearningExercise(value: unknown): LearningExercise | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source.version !== 1 || !Array.isArray(source.questions) || source.questions.length < 1 || source.questions.length > 5) return null;
  const questions: LearningQuestion[] = [];
  for (const raw of source.questions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const kind = item.kind === "single" || item.kind === "multi" ? item.kind : null;
    const options = cleanStringArray(item.options, 6, 240);
    const correctAnswers = cleanStringArray(item.correctAnswers, 6, 240);
    const id = cleanText(item.id, 80);
    const concept = cleanText(item.concept, 120);
    const prompt = cleanText(item.prompt, 500);
    if (!kind || !id || !concept || !prompt || options.length < 2 || !correctAnswers.length || correctAnswers.some((answer) => !options.includes(answer))) return null;
    if (kind === "single" && correctAnswers.length !== 1) return null;
    questions.push({ id, concept, prompt, kind, options, correctAnswers, explanation: cleanText(item.explanation, 500) });
  }
  if (new Set(questions.map((item) => item.id)).size !== questions.length || new Set(questions.map((item) => item.concept)).size !== questions.length) return null;
  return { version: 1, instructions: cleanText(source.instructions, 500), deliverable: cleanText(source.deliverable, 500), questions };
}

export function publicLearningExercise(exercise: LearningExercise): PublicLearningExercise {
  return { version: exercise.version, instructions: exercise.instructions, deliverable: exercise.deliverable, questions: exercise.questions.map((question) => ({ id: question.id, concept: question.concept, prompt: question.prompt, kind: question.kind, options: question.options })) };
}

export function parseLearningSubmission(value: unknown): LearningSubmission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!Number.isInteger(source.selfRating) || Number(source.selfRating) < 1 || Number(source.selfRating) > 5) return null;
  if (!source.answers || typeof source.answers !== "object" || Array.isArray(source.answers)) return null;
  const answers: Record<string, string[]> = {};
  for (const [id, answer] of Object.entries(source.answers as Record<string, unknown>).slice(0, 10)) {
    const cleanId = cleanText(id, 80);
    const values = cleanStringArray(Array.isArray(answer) ? answer : [answer], 6, 240);
    if (cleanId && values.length) answers[cleanId] = values;
  }
  return { answers, selfRating: Number(source.selfRating), reflection: cleanText(source.reflection, 2000), output: cleanText(source.output, 6000) };
}

function sameAnswers(left: string[], right: string[]) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

export function gradeLearningExercise(exercise: LearningExercise, submission: LearningSubmission) {
  const feedback = exercise.questions.map((question) => {
    const answers = submission.answers[question.id] || [];
    return { id: question.id, concept: question.concept, correct: sameAnswers(answers, question.correctAnswers), explanation: question.explanation };
  });
  const score = feedback.filter((item) => item.correct).length;
  return { score, maxScore: exercise.questions.length, feedback, incorrectConcepts: feedback.filter((item) => !item.correct).map((item) => item.concept) };
}

export function calculateQualityScore(input: { score: number; maxScore: number; selfRating: number; reflection: string; output: string; taskType: string }) {
  if (!TYPES.has(input.taskType)) throw new Error("unknown learning task type");
  const knowledge = input.maxScore ? input.score / input.maxScore * 70 : 0;
  const selfAssessment = input.selfRating / 5 * 10;
  const reflection = input.reflection.length >= 20 ? 10 : 0;
  const needsOutput = input.taskType === "PRACTICE" || input.taskType === "CODE";
  const deliverable = !needsOutput || input.output.length >= 30 ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(knowledge + selfAssessment + reflection + deliverable)));
}

export function calculatePathProgress(tasks: { completedAt: Date | string | null; qualityScore: number | null }[]) {
  if (!tasks.length) return 0;
  const earned = tasks.reduce((total, task) => total + (task.completedAt ? task.qualityScore ?? 60 : 0), 0);
  return Math.max(0, Math.min(100, Math.round(earned / tasks.length)));
}

export function chooseAdaptiveTaskType(input: { recentQuality: number | null; developerTrack: boolean; completedCount: number }) {
  if (input.recentQuality !== null && input.recentQuality < 60) return "PRACTICE" as const;
  if (input.developerTrack && (input.recentQuality === null || input.recentQuality >= 85 || input.completedCount % 2 === 0)) return "CODE" as const;
  return "PRACTICE" as const;
}

export function nextReviewSchedule(input: { correct: boolean; repetition: number; intervalDays: number; easeFactor: number }, now = new Date()) {
  const repetition = input.correct ? input.repetition + 1 : 0;
  const intervalDays = input.correct
    ? repetition === 1 ? 3 : repetition === 2 ? 7 : Math.min(90, Math.max(14, Math.round(input.intervalDays * input.easeFactor)))
    : 1;
  const easeFactor = Math.max(1.3, Math.min(3, input.easeFactor + (input.correct ? 0.1 : -0.2)));
  const dueAt = new Date(now.getTime() + intervalDays * 86_400_000);
  return { repetition, intervalDays, easeFactor, dueAt, resolvedAt: repetition >= 4 ? now : null };
}

export function safeLearningModelConfig(input: { key?: string; url?: string; model?: string; timeoutMs?: string | number }) {
  if (!input.key || !input.url || !input.model) return null;
  let url: URL;
  try { url = new URL(input.url); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const parsedTimeout = Number(input.timeoutMs ?? 30_000);
  const timeoutMs = Number.isFinite(parsedTimeout) ? Math.max(5_000, Math.min(60_000, Math.round(parsedTimeout))) : 30_000;
  return { key: input.key, url: url.toString(), model: input.model.slice(0, 120), timeoutMs };
}
