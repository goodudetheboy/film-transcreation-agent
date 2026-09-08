/** Shared record shapes for provisioned accounts (see docs/adr/0028). */

export type AccountRole = 'admin' | 'user';

export interface AccountQuotas {
  maxFilms: number;
  maxProjects: number;
  maxConcurrentAgentRuns: number;
}

export interface Account {
  uid: string;
  email: string;
  role: AccountRole;
  label: string;
  quotas: AccountQuotas;
  disabled: boolean;
  createdAt: string;
  createdBy: string;
}

export interface CreateAccountInput {
  uid: string;
  email: string;
  role: AccountRole;
  label: string;
  quotas: AccountQuotas;
  createdBy: string;
}

export interface UpdateAccountInput {
  label?: string;
  role?: AccountRole;
  quotas?: AccountQuotas;
  disabled?: boolean;
}
