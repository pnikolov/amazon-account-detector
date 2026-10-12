import { DEFAULT_MARKETPLACE } from './marketplaces.js';

// Thin wrapper over chrome.storage.local. One key per marketplace so a write
// for one marketplace can never clobber another.
export const stateKey = (id) => `auth:${id}`;

export async function getState(id) {
  return (await chrome.storage.local.get(stateKey(id)))[stateKey(id)] ?? null;
}

export async function patchState(id, patch) {
  const next = { ...(await getState(id)), ...patch };
  await chrome.storage.local.set({ [stateKey(id)]: next });
  return next;
}

export async function getSelected() {
  return (await chrome.storage.local.get('selected')).selected ?? DEFAULT_MARKETPLACE;
}

export const setSelected = (id) => chrome.storage.local.set({ selected: id });
