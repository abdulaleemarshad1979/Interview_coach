import { ServiceError } from './errors';
function invalid(message: string): never { throw new ServiceError(400, 'INVALID_CAMPUS_INPUT', message); }
export function boundedText(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`${label} must contain 1–${max} characters.`);
  return (value as string).trim();
}
export function validateClass(body: any) {
  if (body?.portal !== 'aus' && body?.portal !== 'acet') invalid('Choose AUS or ACET.');
  const department = boundedText(body.department, 'Department', 100).toUpperCase();
  const section = boundedText(body.section, 'Section', 30).toUpperCase();
  const cohort = boundedText(body.cohort, 'Academic years', 9);
  const match = /^(20\d{2})-(20\d{2})$/.exec(cohort);
  if (!match || +match[2] <= +match[1] || +match[2] - +match[1] > 8) invalid('Use academic years such as 2024-2028.');
  return { portal: body.portal as 'aus' | 'acet', department, cohort, section };
}
export function validateProctors(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 2 || new Set(value).size !== value.length || value.some(id => typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id))) invalid('Select up to two different faculty accounts.');
  return value as string[];
}
export function validateQuestionBank(body: any) {
  const company = boundedText(body?.company, 'Company', 120), role = boundedText(body?.role, 'Role', 160);
  if (!Array.isArray(body?.questions) || !body.questions.length || body.questions.length > 50) invalid('Provide 1–50 questions.');
  const questions = body.questions.map((q: unknown) => boundedText(q, 'Question', 1000));
  return { company, role, questions };
}
export function pageParameters(query: any) {
  const limit = query.limit === undefined ? 50 : Number(query.limit), offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) invalid('Provide limit 1–100 and offset 0–100000.');
  return { limit, offset };
}
