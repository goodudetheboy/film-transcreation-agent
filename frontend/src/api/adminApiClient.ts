import { resolveBaseUrl, throwOnError, authHeaders, type ApiClientOptions } from './httpHelpers';

export type { ApiClientOptions };

export interface AccountQuotas {
  maxFilms: number;
  maxProjects: number;
  maxConcurrentAgentRuns: number;
}

export interface Account {
  uid: string;
  email: string;
  role: 'admin' | 'user';
  label: string;
  quotas: AccountQuotas;
  disabled: boolean;
  createdAt: string;
  callCount24h: number;
  lastCallAt: string | null;
  lastEndpoint: string | null;
}

export interface KillswitchState {
  enabled: boolean;
  reason?: string;
  setBy?: string;
  setAt?: string;
}

export interface ActivityEntry {
  uid: string;
  role: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  ts: string;
}

export interface CreateAccountPayload {
  email: string;
  password: string;
  label: string;
  role: 'admin' | 'user';
  quotas: AccountQuotas;
}

export type UpdateAccountPayload = Partial<{
  label: string;
  quotas: AccountQuotas;
  disabled: boolean;
  role: 'admin' | 'user';
}>;

export async function listAccounts(options: ApiClientOptions = {}): Promise<Account[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/admin/accounts`, { headers: await authHeaders() });
  await throwOnError(res);
  const { accounts } = (await res.json()) as { accounts: Account[] };
  return accounts;
}

export async function createAccount(payload: CreateAccountPayload, options: ApiClientOptions = {}): Promise<Account> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/admin/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Account;
}

export async function updateAccount(
  uid: string,
  payload: UpdateAccountPayload,
  options: ApiClientOptions = {},
): Promise<Account> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/admin/accounts/${uid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Account;
}

export async function deleteAccount(uid: string, options: ApiClientOptions = {}): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/admin/accounts/${uid}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  await throwOnError(res);
}

export async function getKillswitch(options: ApiClientOptions = {}): Promise<KillswitchState> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/admin/killswitch`, { headers: await authHeaders() });
  await throwOnError(res);
  return (await res.json()) as KillswitchState;
}

export async function setKillswitch(
  payload: { enabled: boolean; reason?: string },
  options: ApiClientOptions = {},
): Promise<KillswitchState> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/admin/killswitch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as KillswitchState;
}

export async function listActivity(limit = 50, options: ApiClientOptions = {}): Promise<ActivityEntry[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/admin/activity?limit=${limit}`, { headers: await authHeaders() });
  await throwOnError(res);
  const { entries } = (await res.json()) as { entries: ActivityEntry[] };
  return entries;
}
