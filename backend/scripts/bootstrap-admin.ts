/**
 * One-time bootstrap for the admin account (see docs/adr/0028). Creates the
 * admin's Firebase Auth user, sets the `admin` custom claim, creates their
 * `accounts/{uid}` doc, and backfills `ownerUid` onto every existing
 * films/projects doc — the pre-existing shared workspace becomes theirs.
 *
 * Requires local ADC (`gcloud auth application-default login --project
 * silent-scholar-505618-u6`) and the same env this backend already reads
 * (see .env.example) — GOOGLE_CLOUD_PROJECT in particular.
 *
 * Run with (from backend/): ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_LABEL=... npm run bootstrap:admin
 */
import 'dotenv/config';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { loadConfig } from '../src/config/env.js';
import { createFirestoreClient } from '../src/services/firestoreClient.js';
import { createFirestoreAccountStore } from '../src/services/accountStore.js';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const label = process.env.ADMIN_LABEL ?? 'Admin';

if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD env vars are required.');
  process.exit(1);
}

const config = loadConfig();
initializeApp({ credential: applicationDefault(), projectId: config.googleCloudProject });
const auth = getAuth();
const firestore = createFirestoreClient(config);
const accountStore = createFirestoreAccountStore(firestore);

async function getOrCreateAdminUser(): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(email!);
    console.log(`Firebase Auth user already exists for ${email} (${existing.uid}) — reusing it.`);
    return existing.uid;
  } catch {
    const created = await auth.createUser({ email, password });
    console.log(`Created Firebase Auth user ${created.uid} for ${email}.`);
    return created.uid;
  }
}

async function backfillOwnership(uid: string): Promise<void> {
  for (const collectionName of ['films', 'projects']) {
    const snapshot = await firestore.collection(collectionName).get();
    let updated = 0;
    for (const doc of snapshot.docs) {
      if (doc.get('ownerUid')) continue;
      await doc.ref.update({ ownerUid: uid });
      updated++;
    }
    console.log(`${collectionName}: backfilled ownerUid on ${updated}/${snapshot.size} doc(s).`);
  }
}

async function main() {
  const uid = await getOrCreateAdminUser();
  await auth.setCustomUserClaims(uid, { role: 'admin' });
  console.log('Set custom claim role=admin.');

  const existingAccount = await accountStore.getAccount(uid);
  if (existingAccount) {
    console.log(`accounts/${uid} already exists — leaving it as-is.`);
  } else {
    await accountStore.createAccount({
      uid,
      email: email!,
      role: 'admin',
      label,
      // Admin is exempt from quota checks (see services/quota.ts) — these
      // values are display-only.
      quotas: { maxFilms: 999_999, maxProjects: 999_999, maxConcurrentAgentRuns: 999_999 },
      createdBy: uid,
    });
    console.log(`Created accounts/${uid}.`);
  }

  await backfillOwnership(uid);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
