/**
 * Accounts by invite. There is no sign-up: the owner (APP_PASSCODE) generates a code,
 * a friend enters it, and gets their own follows, devices and alerts.
 *
 * A code is single use for *creating* an account. Once used it becomes that person's
 * sign-in code, so they can open the app on their other devices with it too; they can
 * swap it for a new one from Settings, and the owner can remove the account entirely.
 * An unused code expires after a week.
 */

import { randomBytes } from 'node:crypto';
import { scopeStore } from './store/scoped.js';

const USERS = 'pn:users';
const INVITES = 'pn:invites';
export const INVITE_TTL = 7 * 24 * 3_600_000;

/** No 0/O, 1/I/L: codes get read out loud and typed on phones. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newCode() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** "k7qm 3xtp" / "K7QM-3XTP" -> "K7QM3XTP"; null when it can't be a code. */
export function normaliseCode(input) {
  const code = String(input ?? '').toUpperCase().replace(/[\s-]/g, '');
  return code.length === 8 && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

/** "K7QM3XTP" -> "K7QM-3XTP" */
export function formatCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function listUsers(raw) {
  return Object.values(await raw.hgetall(USERS)).sort((a, b) => a.createdAt - b.createdAt);
}

export async function userExists(raw, id) {
  return Boolean((await raw.hgetall(USERS))[id]);
}

export async function listInvites(raw, now = Date.now()) {
  const invites = Object.values(await raw.hgetall(INVITES));
  return invites
    .filter((i) => i.userId || i.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** @param {{name?: string|null, userId?: string|null, now?: number}} options */
export async function createInvite(raw, { name = null, userId = null, now = Date.now() } = {}) {
  const invite = {
    code: newCode(),
    name: name ? String(name).trim().slice(0, 40) || null : null,
    createdAt: now,
    expiresAt: now + INVITE_TTL,
    userId,
  };
  await raw.hset(INVITES, invite.code, invite);
  return invite;
}

/**
 * Sign in with a code: an existing account's code signs in as that account; an unused,
 * unexpired invite creates the account first.
 *
 * @returns {Promise<{userId: string, created: boolean} | null>}
 */
export async function redeemCode(raw, input, now = Date.now()) {
  const code = normaliseCode(input);
  if (!code) return null;
  const invite = (await raw.hgetall(INVITES))[code];
  if (!invite) return null;

  if (invite.userId) return (await userExists(raw, invite.userId)) ? { userId: invite.userId, created: false } : null;
  if (invite.expiresAt <= now) return null;

  const userId = `u_${randomBytes(6).toString('hex')}`;
  await raw.hset(USERS, userId, { id: userId, name: invite.name, createdAt: now });
  await raw.hset(INVITES, code, { ...invite, userId, usedAt: now });
  return { userId, created: true };
}

/** The account's current sign-in code(s). */
export async function codesFor(raw, userId) {
  return Object.values(await raw.hgetall(INVITES)).filter((i) => i.userId === userId);
}

/** Replace a user's sign-in code (the old one stops working). */
export async function rotateCode(raw, userId, now = Date.now()) {
  for (const old of await codesFor(raw, userId)) await raw.hdel(INVITES, old.code);
  const user = (await raw.hgetall(USERS))[userId];
  return createInvite(raw, { name: user?.name ?? null, userId, now });
}

export async function revokeInvite(raw, code) {
  const invite = (await raw.hgetall(INVITES))[code];
  if (invite && !invite.userId) await raw.hdel(INVITES, code);
}

/** Delete an account and everything in it. */
export async function removeUser(raw, userId) {
  await scopeStore(raw, userId).destroy();
  for (const code of await codesFor(raw, userId)) await raw.hdel(INVITES, code.code);
  await raw.hdel(USERS, userId);
}
