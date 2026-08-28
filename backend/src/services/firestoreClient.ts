import { Firestore } from '@google-cloud/firestore';

export function createFirestoreClient(config: { googleCloudProject: string }): Firestore {
  return new Firestore({ projectId: config.googleCloudProject });
}
