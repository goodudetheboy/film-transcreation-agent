import { useEffect, useState, type FormEvent } from 'react';
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getKillswitch,
  setKillswitch,
  listActivity,
  type Account,
  type AccountQuotas,
  type ActivityEntry,
  type KillswitchState,
} from '../api/adminApiClient';
import { ConfirmModal } from '../components/ConfirmModal';
import { Modal } from '../components/Modal';

type Tab = 'accounts' | 'activity';

const ACTIVITY_POLL_MS = 5000;

function emptyQuotas(): AccountQuotas {
  return { maxFilms: 5, maxProjects: 5, maxConcurrentAgentRuns: 2 };
}

/** A quota this large is the "admin, effectively unlimited" convention set by
 * scripts/bootstrap-admin.ts — shown as "Unlimited" rather than the literal
 * number. */
function formatQuota(n: number): string {
  return n >= 999_999 ? 'Unlimited' : String(n);
}

function formatLastActive(a: Account): string {
  if (!a.lastCallAt) return 'Never active';
  return `Active ${new Date(a.lastCallAt).toLocaleString()}`;
}

/**
 * Admin-only page — manage provisioned accounts, the global killswitch, and
 * recent API activity. Only reachable when the signed-in user's Firebase ID
 * token carries `role: 'admin'` (see App.tsx, which only renders the "Admin"
 * nav link and this route's content for that role).
 */
export function AdminView() {
  const [tab, setTab] = useState<Tab>('accounts');

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [quotas, setQuotas] = useState(emptyQuotas());
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [justProvisioned, setJustProvisioned] = useState<{ email: string; password: string } | null>(null);

  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editQuotas, setEditQuotas] = useState(emptyQuotas());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingUid, setTogglingUid] = useState<string | null>(null);

  const [killswitch, setKillswitchState] = useState<KillswitchState | null>(null);
  const [killswitchError, setKillswitchError] = useState<string | null>(null);
  const [showKillswitchConfirm, setShowKillswitchConfirm] = useState(false);
  const [killswitchReason, setKillswitchReason] = useState('');
  const [killswitchBusy, setKillswitchBusy] = useState(false);

  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAccounts()
      .then((a) => {
        if (!cancelled) setAccounts(a);
      })
      .catch((err) => {
        if (!cancelled) setAccountsError(err instanceof Error ? err.message : 'failed to load accounts');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getKillswitch()
      .then((k) => {
        if (!cancelled) setKillswitchState(k);
      })
      .catch((err) => {
        if (!cancelled) setKillswitchError(err instanceof Error ? err.message : 'failed to load killswitch state');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== 'activity') return;
    let cancelled = false;

    function poll() {
      listActivity(50)
        .then((entries) => {
          if (!cancelled) setActivity(entries);
        })
        .catch((err) => {
          if (!cancelled) setActivityError(err instanceof Error ? err.message : 'failed to load activity');
        });
    }

    poll();
    const interval = setInterval(poll, ACTIVITY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tab]);

  async function handleProvision(e: FormEvent) {
    e.preventDefault();
    if (email.trim() === '' || password === '' || label.trim() === '') return;
    setProvisioning(true);
    setProvisionError(null);
    try {
      const account = await createAccount({ email: email.trim(), password, label: label.trim(), role, quotas });
      setAccounts((prev) => (prev ? [account, ...prev] : [account]));
      setJustProvisioned({ email: account.email, password });
      setShowProvisionModal(false);
      setEmail('');
      setPassword('');
      setLabel('');
      setRole('user');
      setQuotas(emptyQuotas());
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'failed to provision account');
    } finally {
      setProvisioning(false);
    }
  }

  function openEdit(account: Account) {
    setEditTarget(account);
    setEditLabel(account.label);
    setEditRole(account.role);
    setEditQuotas(account.quotas);
    setEditError(null);
  }

  async function handleEditSave(e: FormEvent) {
    e.preventDefault();
    if (!editTarget || editLabel.trim() === '') return;
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await updateAccount(editTarget.uid, { label: editLabel.trim(), role: editRole, quotas: editQuotas });
      setAccounts((prev) => prev?.map((a) => (a.uid === updated.uid ? updated : a)) ?? prev);
      setEditTarget(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'failed to update account');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggleDisabled(account: Account) {
    setTogglingUid(account.uid);
    try {
      const updated = await updateAccount(account.uid, { disabled: !account.disabled });
      setAccounts((prev) => prev?.map((a) => (a.uid === updated.uid ? updated : a)) ?? prev);
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'failed to update account');
    } finally {
      setTogglingUid(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAccount(deleteTarget.uid);
      setAccounts((prev) => prev?.filter((a) => a.uid !== deleteTarget.uid) ?? prev);
      setDeleteTarget(null);
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'failed to delete account');
    } finally {
      setDeleting(false);
    }
  }

  async function handleKillswitchConfirmed() {
    if (!killswitch) return;
    setKillswitchBusy(true);
    try {
      const next = await setKillswitch({ enabled: !killswitch.enabled, reason: killswitchReason.trim() || undefined });
      setKillswitchState(next);
      setShowKillswitchConfirm(false);
      setKillswitchReason('');
    } catch (err) {
      setKillswitchError(err instanceof Error ? err.message : 'failed to update killswitch');
    } finally {
      setKillswitchBusy(false);
    }
  }

  const adminCount = accounts?.filter((a) => a.role === 'admin').length ?? 0;
  const activeCount = accounts?.filter((a) => !a.disabled).length ?? 0;

  return (
    <div className="app-body-inner">
      <div className="page-header">
        <div className="page-header__heading">
          <h1 className="page-header__title">Admin</h1>
          <p className="page-header__subtitle">Manage accounts, the global killswitch, and recent activity.</p>
        </div>
      </div>

      {killswitchError && <p className="passcode-gate__error">{killswitchError}</p>}
      {killswitch && (
        <div className={`admin-killswitch-card${killswitch.enabled ? ' admin-killswitch-card--on' : ''}`}>
          <div className="admin-killswitch-card__status">
            <span className={`status-dot${killswitch.enabled ? ' status-dot--running' : ''}`} />
            <div>
              <p className="content-card__primary">
                {killswitch.enabled ? 'Killswitch is ON — all agent activity is blocked' : 'Killswitch is off'}
              </p>
              {killswitch.enabled && killswitch.reason && <p className="content-card__secondary">Reason: {killswitch.reason}</p>}
              {killswitch.enabled && killswitch.setBy && (
                <p className="content-card__caption">
                  Set by {killswitch.setBy}
                  {killswitch.setAt ? ` at ${new Date(killswitch.setAt).toLocaleString()}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            className={killswitch.enabled ? 'btn btn--primary' : 'btn btn--ghost'}
            onClick={() => setShowKillswitchConfirm(true)}
          >
            {killswitch.enabled ? 'Turn off killswitch' : 'Turn on killswitch'}
          </button>
        </div>
      )}

      {accounts !== null && (
        <div className="admin-stats">
          <div className="admin-stat">
            <span className="admin-stat__value">{accounts.length}</span>
            <span className="admin-stat__label">account{accounts.length === 1 ? '' : 's'}</span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat__value">{activeCount}</span>
            <span className="admin-stat__label">enabled</span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat__value">{adminCount}</span>
            <span className="admin-stat__label">admin{adminCount === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}

      <nav className="workspace-tabs">
        <button type="button" className={`workspace-tabs__tab${tab === 'accounts' ? ' workspace-tabs__tab--active' : ''}`} onClick={() => setTab('accounts')}>
          Accounts
        </button>
        <button type="button" className={`workspace-tabs__tab${tab === 'activity' ? ' workspace-tabs__tab--active' : ''}`} onClick={() => setTab('activity')}>
          Activity
        </button>
      </nav>

      {tab === 'accounts' && (
        <>
          <div className="section-heading-row">
            <p className="section-heading">Accounts</p>
            <button type="button" className="btn btn--primary" onClick={() => setShowProvisionModal(true)}>
              + Provision account
            </button>
          </div>

          {justProvisioned && (
            <div className="content-card" style={{ borderColor: 'var(--success)' }}>
              <p className="content-card__primary">Account created for {justProvisioned.email}</p>
              <p className="content-card__secondary">
                Password: <strong>{justProvisioned.password}</strong> — shown once, it can&rsquo;t be retrieved again through this
                page.
              </p>
              <button type="button" className="btn" onClick={() => setJustProvisioned(null)}>
                Dismiss
              </button>
            </div>
          )}

          {accountsError && <p className="passcode-gate__error">{accountsError}</p>}
          {accounts === null && !accountsError && <p className="results-placeholder">Loading…</p>}
          {accounts !== null && accounts.length === 0 && <p className="results-placeholder">No accounts yet.</p>}

          {accounts !== null && accounts.length > 0 && (
            <div className="account-grid">
              {accounts.map((a) => (
                <div className="content-card account-card" key={a.uid}>
                  <div className="content-card__top">
                    <div className="content-card__body">
                      <p className="content-card__primary">{a.label}</p>
                      <p className="content-card__secondary">{a.email}</p>
                    </div>
                    <div className="content-card__badges">
                      <span className={`status-badge status-badge--${a.role === 'admin' ? 'done' : 'pending'}`}>{a.role}</span>
                      <span className={`status-badge status-badge--${a.disabled ? 'error' : 'done'}`}>
                        {a.disabled ? 'disabled' : 'enabled'}
                      </span>
                    </div>
                  </div>

                  <div className="account-card__quotas">
                    <span className="project-card__stat project-card__stat--total">{formatQuota(a.quotas.maxFilms)} films</span>
                    <span className="project-card__stat project-card__stat--total">{formatQuota(a.quotas.maxProjects)} projects</span>
                    <span className="project-card__stat project-card__stat--total">
                      {formatQuota(a.quotas.maxConcurrentAgentRuns)} concurrent
                    </span>
                  </div>

                  <p className="content-card__caption">
                    {a.callCount24h} call{a.callCount24h === 1 ? '' : 's'} in the last 24h · {formatLastActive(a)}
                    {a.lastEndpoint ? ` (${a.lastEndpoint})` : ''}
                  </p>

                  <div className="account-card__actions">
                    <button type="button" className="btn" onClick={() => openEdit(a)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={togglingUid === a.uid}
                      onClick={() => handleToggleDisabled(a)}
                    >
                      {a.disabled ? 'Enable' : 'Disable'}
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => setDeleteTarget(a)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'activity' && (
        <>
          {activityError && <p className="passcode-gate__error">{activityError}</p>}
          {activity === null && !activityError && <p className="results-placeholder">Loading…</p>}
          {activity !== null && activity.length === 0 && <p className="results-placeholder">No activity yet.</p>}
          {activity !== null && activity.length > 0 && (
            <div className="details-table-wrap">
              <div className="details-table-scroll">
                <table className="details-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Method</th>
                      <th>Path</th>
                      <th>Status</th>
                      <th>Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((entry, i) => (
                      <tr key={`${entry.ts}-${i}`}>
                        <td className="details-table__cell--nowrap-exempt">{new Date(entry.ts).toLocaleString()}</td>
                        <td title={entry.uid}>
                          {entry.uid} ({entry.role})
                        </td>
                        <td>{entry.method}</td>
                        <td>{entry.path}</td>
                        <td>{entry.status}</td>
                        <td>{entry.latencyMs}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {showProvisionModal && (
        <Modal title="Provision account" onClose={() => setShowProvisionModal(false)} busy={provisioning}>
          <form className="admin-form" onSubmit={handleProvision}>
            <div className="admin-form-grid">
              <div className="field">
                <label htmlFor="new-account-email">Email</label>
                <input id="new-account-email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} disabled={provisioning} autoFocus />
              </div>
              <div className="field">
                <label htmlFor="new-account-password">Password</label>
                <span style={{ display: 'flex', gap: 6 }}>
                  <input
                    id="new-account-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={provisioning}
                  />
                  <button type="button" className="btn btn--ghost" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </span>
              </div>
              <div className="field">
                <label htmlFor="new-account-label">Label</label>
                <input id="new-account-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} disabled={provisioning} />
              </div>
              <div className="field">
                <label htmlFor="new-account-role">Role</label>
                <select id="new-account-role" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')} disabled={provisioning}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="new-account-max-films">Max films</label>
                <input
                  id="new-account-max-films"
                  type="number"
                  min={0}
                  value={quotas.maxFilms}
                  onChange={(e) => setQuotas({ ...quotas, maxFilms: Number(e.target.value) })}
                  disabled={provisioning}
                />
              </div>
              <div className="field">
                <label htmlFor="new-account-max-projects">Max projects</label>
                <input
                  id="new-account-max-projects"
                  type="number"
                  min={0}
                  value={quotas.maxProjects}
                  onChange={(e) => setQuotas({ ...quotas, maxProjects: Number(e.target.value) })}
                  disabled={provisioning}
                />
              </div>
              <div className="field">
                <label htmlFor="new-account-max-concurrent">Max concurrent agent runs</label>
                <input
                  id="new-account-max-concurrent"
                  type="number"
                  min={0}
                  value={quotas.maxConcurrentAgentRuns}
                  onChange={(e) => setQuotas({ ...quotas, maxConcurrentAgentRuns: Number(e.target.value) })}
                  disabled={provisioning}
                />
              </div>
            </div>

            {provisionError && <p className="passcode-gate__error">{provisionError}</p>}

            <div className="admin-form__footer">
              <button type="button" className="btn" onClick={() => setShowProvisionModal(false)} disabled={provisioning}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={provisioning}>
                {provisioning ? 'Provisioning…' : 'Provision account'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editTarget && (
        <Modal title={`Edit ${editTarget.label}`} onClose={() => setEditTarget(null)} busy={editSaving}>
          <form className="admin-form" onSubmit={handleEditSave}>
            <p className="content-card__secondary">{editTarget.email}</p>
            <div className="admin-form-grid">
              <div className="field">
                <label htmlFor="edit-account-label">Label</label>
                <input id="edit-account-label" type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} disabled={editSaving} autoFocus />
              </div>
              <div className="field">
                <label htmlFor="edit-account-role">Role</label>
                <select id="edit-account-role" value={editRole} onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')} disabled={editSaving}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="edit-account-max-films">Max films</label>
                <input
                  id="edit-account-max-films"
                  type="number"
                  min={0}
                  value={editQuotas.maxFilms}
                  onChange={(e) => setEditQuotas({ ...editQuotas, maxFilms: Number(e.target.value) })}
                  disabled={editSaving}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-account-max-projects">Max projects</label>
                <input
                  id="edit-account-max-projects"
                  type="number"
                  min={0}
                  value={editQuotas.maxProjects}
                  onChange={(e) => setEditQuotas({ ...editQuotas, maxProjects: Number(e.target.value) })}
                  disabled={editSaving}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-account-max-concurrent">Max concurrent agent runs</label>
                <input
                  id="edit-account-max-concurrent"
                  type="number"
                  min={0}
                  value={editQuotas.maxConcurrentAgentRuns}
                  onChange={(e) => setEditQuotas({ ...editQuotas, maxConcurrentAgentRuns: Number(e.target.value) })}
                  disabled={editSaving}
                />
              </div>
            </div>

            {editError && <p className="passcode-gate__error">{editError}</p>}

            <div className="admin-form__footer">
              <button type="button" className="btn" onClick={() => setEditTarget(null)} disabled={editSaving}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete this account?"
          body={`"${deleteTarget.label}" (${deleteTarget.email}) will lose access immediately. This can't be undone.`}
          busy={deleting}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showKillswitchConfirm && killswitch && (
        <Modal
          title={killswitch.enabled ? 'Turn off the killswitch?' : 'Turn on the killswitch?'}
          onClose={() => setShowKillswitchConfirm(false)}
          busy={killswitchBusy}
        >
          <p className="hint-text">
            {killswitch.enabled
              ? 'This will re-enable agent activity for every account.'
              : 'This immediately blocks every agent run across every account, for everyone.'}
          </p>
          <div className="field">
            <label htmlFor="killswitch-reason">Reason (optional)</label>
            <input
              id="killswitch-reason"
              type="text"
              value={killswitchReason}
              onChange={(e) => setKillswitchReason(e.target.value)}
              disabled={killswitchBusy}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" className="btn" onClick={() => setShowKillswitchConfirm(false)} disabled={killswitchBusy}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={handleKillswitchConfirmed} disabled={killswitchBusy}>
              {killswitchBusy ? 'Saving…' : killswitch.enabled ? 'Turn off killswitch' : 'Turn on killswitch'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
