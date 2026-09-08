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
  type ActivityEntry,
  type KillswitchState,
} from '../api/adminApiClient';
import { ConfirmModal } from '../components/ConfirmModal';
import { Modal } from '../components/Modal';

type Tab = 'accounts' | 'activity';

const ACTIVITY_POLL_MS = 5000;

function emptyQuotas() {
  return { maxFilms: 5, maxProjects: 5, maxConcurrentAgentRuns: 2 };
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [quotas, setQuotas] = useState(emptyQuotas());
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [justProvisioned, setJustProvisioned] = useState<{ email: string; password: string } | null>(null);

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
        <div
          className="content-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderColor: killswitch.enabled ? 'var(--danger)' : undefined,
          }}
        >
          <div>
            <p
              className="content-card__primary"
              style={killswitch.enabled ? { color: 'var(--danger)' } : undefined}
            >
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
          <button
            type="button"
            className={killswitch.enabled ? 'btn btn--primary' : 'btn btn--ghost'}
            onClick={() => setShowKillswitchConfirm(true)}
          >
            {killswitch.enabled ? 'Turn off killswitch' : 'Turn on killswitch'}
          </button>
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
          <form className="new-project-form" onSubmit={handleProvision}>
            <p className="section-heading">+ Provision account</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 220 }}>
                <label htmlFor="new-account-email">Email</label>
                <input id="new-account-email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} disabled={provisioning} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 220 }}>
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
              <div className="field" style={{ flex: 1, minWidth: 220 }}>
                <label htmlFor="new-account-label">Label</label>
                <input id="new-account-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} disabled={provisioning} />
              </div>
              <div className="field" style={{ minWidth: 140 }}>
                <label htmlFor="new-account-role">Role</label>
                <select id="new-account-role" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')} disabled={provisioning}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ maxWidth: 160 }}>
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
              <div className="field" style={{ maxWidth: 160 }}>
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
              <div className="field" style={{ maxWidth: 200 }}>
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

            <button type="submit" className="btn btn--primary" disabled={provisioning} style={{ width: 'fit-content' }}>
              {provisioning ? 'Provisioning…' : 'Provision account'}
            </button>
          </form>

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
            <div className="details-table-wrap">
              <div className="details-table-scroll">
                <table className="details-table">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Quotas</th>
                      <th>24h calls</th>
                      <th>Last active</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.uid}>
                        <td>{a.label}</td>
                        <td>{a.email}</td>
                        <td>{a.role}</td>
                        <td>
                          {a.quotas.maxFilms} films · {a.quotas.maxProjects} projects · {a.quotas.maxConcurrentAgentRuns} concurrent
                        </td>
                        <td>{a.callCount24h}</td>
                        <td className="details-table__cell--nowrap-exempt">
                          {a.lastCallAt ? `${new Date(a.lastCallAt).toLocaleString()} — ${a.lastEndpoint ?? ''}` : 'Never'}
                        </td>
                        <td>
                          <span className={`status-badge status-badge--${a.disabled ? 'error' : 'done'}`}>
                            {a.disabled ? 'disabled' : 'enabled'}
                          </span>
                        </td>
                        <td className="details-table__cell--nowrap-exempt">
                          <div style={{ display: 'flex', gap: 8 }}>
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
