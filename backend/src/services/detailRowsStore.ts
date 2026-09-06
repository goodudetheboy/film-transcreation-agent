import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { ColumnDoc, DetailRow, DetailRowProvenance, DetailRowValues } from './filmTypes.js';

export type { ColumnDoc, DetailRow, DetailRowProvenance, DetailRowValues } from './filmTypes.js';

export interface CreateDetailRowInput {
  startMs: number;
  endMs: number;
  subtitleText: string;
  values: Partial<DetailRowValues>;
  provenance: DetailRowProvenance;
}

function buildRow(filmId: string, input: CreateDetailRowInput, now: string): DetailRow {
  return {
    id: randomUUID(),
    filmId,
    startMs: input.startMs,
    endMs: input.endMs,
    subtitleText: input.subtitleText,
    values: fillValues(input.values),
    provenance: input.provenance,
    createdAt: now,
    updatedAt: now,
  };
}

function fillValues(values: Partial<DetailRowValues>): DetailRowValues {
  return {
    segmentDescription: values.segmentDescription ?? '',
    gesture: values.gesture ?? '',
    notes: values.notes ?? '',
    custom: values.custom ?? {},
  };
}

/** Merges a values patch onto the current values, deep-merging `custom`
 * specifically — a plain `{...current, ...patch}` would let a patch that
 * only touches one custom column (e.g. via the chat agent's edit_detail_row
 * tool) silently wipe every other custom column on the row. */
function mergeValues(current: DetailRowValues, patch: Partial<DetailRowValues>): DetailRowValues {
  return fillValues({
    ...current,
    ...patch,
    custom: { ...current.custom, ...(patch.custom ?? {}) },
  });
}

/**
 * Owns the two per-film Firestore subcollections that make up the Details
 * table: `films/{filmId}/detailRows` (the rows themselves) and
 * `films/{filmId}/columns` (user-added custom columns only — the three
 * wireframe-fixed columns are shared constants, see filmTypes.ts).
 */
export interface DetailRowsStore {
  listRows(filmId: string): Promise<DetailRow[]>;
  addRow(filmId: string, input: CreateDetailRowInput): Promise<DetailRow>;
  /** Bulk variant of addRow — one Firestore batch commit instead of N
   * sequential writes, same precedent as projectItemStore.ts's createItems. */
  addRows(filmId: string, inputs: CreateDetailRowInput[]): Promise<DetailRow[]>;
  updateRow(
    filmId: string,
    rowId: string,
    patch: Partial<Pick<DetailRow, 'startMs' | 'endMs' | 'subtitleText' | 'values'>>,
  ): Promise<DetailRow | undefined>;
  deleteRow(filmId: string, rowId: string): Promise<boolean>;
  listColumns(filmId: string): Promise<ColumnDoc[]>;
  addColumn(filmId: string, name: string, description: string): Promise<ColumnDoc>;
}

function rowsCollection(firestore: Firestore, filmId: string) {
  return firestore.collection('films').doc(filmId).collection('detailRows');
}
function columnsCollection(firestore: Firestore, filmId: string) {
  return firestore.collection('films').doc(filmId).collection('columns');
}

function columnKeyFromName(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || randomUUID().slice(0, 8);
}

export function createFirestoreDetailRowsStore(firestore: Firestore): DetailRowsStore {
  return {
    async listRows(filmId) {
      const snapshot = await rowsCollection(firestore, filmId).orderBy('createdAt', 'asc').get();
      return snapshot.docs.map((d) => d.data() as DetailRow);
    },

    async addRow(filmId, input) {
      const row = buildRow(filmId, input, new Date().toISOString());
      await rowsCollection(firestore, filmId).doc(row.id).set(row);
      return row;
    },

    async addRows(filmId, inputs) {
      if (inputs.length === 0) return [];
      const now = new Date().toISOString();
      const batch = firestore.batch();
      const rows = inputs.map((input) => buildRow(filmId, input, now));
      for (const row of rows) {
        batch.set(rowsCollection(firestore, filmId).doc(row.id), row);
      }
      await batch.commit();
      return rows;
    },

    async updateRow(filmId, rowId, patch) {
      const ref = rowsCollection(firestore, filmId).doc(rowId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const current = doc.data() as DetailRow;
      const updated: DetailRow = {
        ...current,
        ...patch,
        values: patch.values ? mergeValues(current.values, patch.values) : current.values,
        updatedAt: new Date().toISOString(),
      };
      await ref.set(updated);
      return updated;
    },

    async deleteRow(filmId, rowId) {
      const ref = rowsCollection(firestore, filmId).doc(rowId);
      const doc = await ref.get();
      if (!doc.exists) return false;
      await ref.delete();
      return true;
    },

    async listColumns(filmId) {
      const snapshot = await columnsCollection(firestore, filmId).orderBy('createdAt', 'asc').get();
      return snapshot.docs.map((d) => d.data() as ColumnDoc);
    },

    async addColumn(filmId, name, description) {
      const column: ColumnDoc = {
        id: randomUUID(),
        filmId,
        name,
        description,
        key: columnKeyFromName(name),
        createdAt: new Date().toISOString(),
      };
      await columnsCollection(firestore, filmId).doc(column.id).set(column);
      return column;
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryDetailRowsStore(): DetailRowsStore {
  const rows = new Map<string, DetailRow>(); // rowId -> row
  const columns = new Map<string, ColumnDoc>(); // columnId -> column

  return {
    async listRows(filmId) {
      return [...rows.values()]
        .filter((r) => r.filmId === filmId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async addRow(filmId, input) {
      const row = buildRow(filmId, input, new Date().toISOString());
      rows.set(row.id, row);
      return row;
    },

    async addRows(filmId, inputs) {
      const now = new Date().toISOString();
      const created = inputs.map((input) => buildRow(filmId, input, now));
      for (const row of created) rows.set(row.id, row);
      return created;
    },

    async updateRow(filmId, rowId, patch) {
      const current = rows.get(rowId);
      if (!current || current.filmId !== filmId) return undefined;
      const updated: DetailRow = {
        ...current,
        ...patch,
        values: patch.values ? mergeValues(current.values, patch.values) : current.values,
        updatedAt: new Date().toISOString(),
      };
      rows.set(rowId, updated);
      return updated;
    },

    async deleteRow(filmId, rowId) {
      const current = rows.get(rowId);
      if (!current || current.filmId !== filmId) return false;
      return rows.delete(rowId);
    },

    async listColumns(filmId) {
      return [...columns.values()]
        .filter((c) => c.filmId === filmId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async addColumn(filmId, name, description) {
      const column: ColumnDoc = {
        id: randomUUID(),
        filmId,
        name,
        description,
        key: columnKeyFromName(name),
        createdAt: new Date().toISOString(),
      };
      columns.set(column.id, column);
      return column;
    },
  };
}
