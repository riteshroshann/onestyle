// Rules and wording shared by the local and cloud stores, so both refuse the same things in the same words.
import { MarketError, STATUS_LABEL } from "./types.ts";
import type { RequestStatus, Role, SignUp } from "./types.ts";
import { missingLabel } from "./missing.ts";

export const MAX_BODY = 2000;
export const MIN_PASSWORD = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NOT_SIGNED_IN = "Sign in to continue.";
export const BAD_LOGIN = "That email or password is not right.";
export const EMAIL_TAKEN = "That email is already registered. Sign in instead.";
export const NOT_AVAILABLE = "That conversation is not available to you.";
export const NOT_YOUR_REQUEST = "Only the maker on this request can change it.";
export const NO_MAKER = "That maker could not be found.";
export const TRY_AGAIN = "Something went wrong. Check your connection and try again.";
export const CHECK_EMAIL = "Check your email to confirm your account, then sign in.";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const wrongDoor = (actual: Role) => new MarketError(`This account is a ${actual} account. Use the ${actual} sign-in.`);

/** Trim and validate sign-up fields. Maker-only fields are dropped for customers. */
export function checkSignUp(input: SignUp): SignUp {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (!name) throw new MarketError("Enter your name.");
  if (!EMAIL.test(email)) throw new MarketError("Enter a valid email address.");
  if (input.password.length < MIN_PASSWORD) throw new MarketError(`Use a password of at least ${MIN_PASSWORD} characters.`);
  const base = { email, password: input.password, name, city: input.city.trim(), role: input.role };
  if (input.role !== "maker") return base;
  const specialties = (input.specialties ?? []).map((s) => s.trim()).filter(Boolean);
  return { ...base, craft: input.craft, specialties, bio: input.bio?.trim() ?? "" };
}

export function cleanBody(raw: string): string {
  const body = raw.trim();
  if (!body) throw new MarketError("Write a message first.");
  if (body.length > MAX_BODY) throw new MarketError(`Messages can be up to ${MAX_BODY} characters. Shorten yours and send it again.`);
  return body;
}

/** A note that may be left blank. */
export const cleanNote = (raw: string) => (raw.trim() ? cleanBody(raw) : "");

export const cleanSlots = (slots: string[]) => [...new Set(slots.map((s) => s.trim()).filter(Boolean))];

export const statusNote = (status: RequestStatus) => `Marked as ${STATUS_LABEL[status].toLowerCase()}.`;

export function checkStatus(status: string): RequestStatus {
  if (!(status in STATUS_LABEL)) throw new MarketError("That status is not one this request can have.");
  return status as RequestStatus;
}

/** The maker's own words if they wrote any, otherwise a plain question listing what is missing. */
export function missingNote(slots: string[], note: string): string {
  const own = cleanNote(note);
  if (own) return own;
  const names = slots.map((s) => missingLabel(s).toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `Could you share the ${list}?`;
}

/** What the request list shows as the latest line. */
export const preview = (body: string) => (body.length > 140 ? `${body.slice(0, 139)}…` : body);
