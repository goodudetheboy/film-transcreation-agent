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

function fillValues(values: Partial<DetailRowValues>): DetailRowValues {
  return {
    segmentDescription: values.segmentDescription ?? '',
    gesture: values.gesture ?? '',
    notes: values.notes ?? '',
    custom: values.custom ?? {},
  };
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
  updateRow(
    filmId: string,
    rowId: string,
    patch: Partial<Pick<DetailRow, 'startMs' | 'endMs' | 'subtitleText' | 'values'>>,
  ): Promise<DetailRow | undefined>;
  deleteRow(filmId: string, rowId: string): Promise<boolean>;
  listColumns(filmId: string): Promise<ColumnDoc[]>;
  addColumn(filmId: string, name: string): Promise<ColumnDoc>;
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
      const now = new Date().toISOString();
      const row: DetailRow = {
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
      await rowsCollection(firestore, filmId).doc(row.id).set(row);
      return row;
    },

    async updateRow(filmId, rowId, patch) {
      const ref = rowsCollection(firestore, filmId).doc(rowId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const current = doc.data() as DetailRow;
      const updated: DetailRow = {
        ...current,
        ...patch,
        values: patch.values ? fillValues({ ...current.values, ...patch.values }) : current.values,
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

    async addColumn(filmId, name) {
      const column: ColumnDoc = {
        id: randomUUID(),
        filmId,
        name,
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
      const now = new Date().toISOString();
      const row: DetailRow = {
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
      rows.set(row.id, row);
      return row;
    },

    async updateRow(filmId, rowId, patch) {
      const current = rows.get(rowId);
      if (!current || current.filmId !== filmId) return undefined;
      const updated: DetailRow = {
        ...current,
        ...patch,
        values: patch.values ? fillValues({ ...current.values, ...patch.values }) : current.values,
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

    async addColumn(filmId, name) {
      const column: ColumnDoc = {
        id: randomUUID(),
        filmId,
        name,
        key: columnKeyFromName(name),
        createdAt: new Date().toISOString(),
      };
      columns.set(column.id, column);
      return column;
    },
  };
}
