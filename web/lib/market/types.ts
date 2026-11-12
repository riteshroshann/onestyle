// The marketplace: customers send a design to a maker (designer or tailor); the two talk on a thread per request.
import type { Spec } from "../engine/spec.ts";
import type { Measurements, SheetLine } from "../engine/describe.ts";

export type Role = "customer" | "maker";
export type Craft = "Fashion designer" | "Tailor" | "Boutique";

export interface Profile {
  id: string;
  role: Role;
  name: string;
  email: string;
  city: string;
  // makers only
  craft?: Craft;
  specialties?: string[];
  bio?: string;
}

export type RequestStatus = "new" | "needs-info" | "accepted" | "in-progress" | "ready" | "declined";
export const STATUS_LABEL: Record<RequestStatus, string> = {
  new: "New", "needs-info": "Waiting on details", accepted: "Accepted", "in-progress": "Being made", ready: "Ready", declined: "Declined",
};

/** A design frozen at the moment it was sent, so the maker always cuts from what the customer approved. */
export interface DesignSnapshot { title: string; spec: Spec; lines: SheetLine[]; measurements: Measurements }

export interface DesignRequest {
  id: string;
  customerId: string;
  customerName: string;
  makerId: string;
  makerName: string;
  design: DesignSnapshot;
  status: RequestStatus;
  /** Slots the maker has flagged as missing, e.g. "sleeve.length". Empty when nothing is outstanding. */
  missing: string[];
  createdAt: number;
  updatedAt: number;
  lastMessage?: string;
  /** Messages the signed-in person has not read yet. */
  unread: number;
}

export type MessageKind = "text" | "missing" | "status";
export interface Message { id: string; requestId: string; senderId: string; senderName: string; kind: MessageKind; body: string; createdAt: number }

export interface SignUp { email: string; password: string; name: string; city: string; role: Role; craft?: Craft; specialties?: string[]; bio?: string }

/** Thrown by every store method with a message fit to show the person as is. */
export class MarketError extends Error {}

export interface Store {
  /** "local": this browser only. "cloud": Supabase. */
  readonly mode: "local" | "cloud";
  session(): Promise<Profile | null>;
  onSession(cb: (p: Profile | null) => void): () => void;
  signUp(input: SignUp): Promise<Profile>;
  /** Signing in through the wrong door (a maker on the customer page) is refused with a pointer to the right one. */
  signIn(email: string, password: string, role: Role): Promise<Profile>;
  signOut(): Promise<void>;
  /** Emails a link to set a new password; the link opens /reset/. */
  resetPassword(email: string): Promise<void>;
  /** Sets the password for the person the reset link signed in. */
  updatePassword(password: string): Promise<void>;
  /** Sends the confirmation email again, for a link that expired. */
  resendConfirmation(email: string, role: Role): Promise<void>;

  makers(): Promise<Profile[]>;
  createRequest(makerId: string, design: DesignSnapshot, note: string): Promise<DesignRequest>;
  /** The signed-in person's requests, newest activity first. */
  requests(): Promise<DesignRequest[]>;
  request(id: string): Promise<DesignRequest | null>;
  /** Makers only. Flagging missing slots sets status "needs-info" and posts a "missing" message; clearing them returns it to "accepted". */
  setMissing(id: string, missing: string[], note: string): Promise<DesignRequest>;
  /** Makers only. Posts a "status" message. */
  setStatus(id: string, status: RequestStatus): Promise<DesignRequest>;

  messages(requestId: string): Promise<Message[]>;
  send(requestId: string, body: string): Promise<Message>;
  markRead(requestId: string): Promise<void>;
  /** Fires whenever anything the signed-in person can see changes: a new message, a status, a new request. */
  subscribe(cb: () => void): () => void;
}
