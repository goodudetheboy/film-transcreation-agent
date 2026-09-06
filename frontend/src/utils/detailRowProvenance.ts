import type { DetailRow } from '../api/apiClient.types';

/** Shared by DetailsTable.tsx's Source column and DetailRowView.tsx's Source
 * field — kept out of either component file so exporting them doesn't trip
 * the react-refresh only-export-components lint rule. */
export function provenanceLabel(row: DetailRow): string {
  if (row.provenance.type === 'user-marked') return 'Marked by you';
  if (row.provenance.type === 'agent-discovered') {
    // agentNumber 0 is the sentinel for the automatic pass run during film prep
    // (see backend/src/services/filmPrepPipeline.ts) — not a real numbered agent.
    if (row.provenance.agentNumber === 0) return 'Discovered on import';
    return `Agent #${row.provenance.agentNumber} · Pass #${row.provenance.passNumber}`;
  }
  return `AI-assisted · Agent #${row.provenance.agentNumber}`;
}

export function provenanceModifier(row: DetailRow): string {
  return row.provenance.type === 'user-marked' ? 'user-marked' : row.provenance.type === 'agent-discovered' ? 'agent-discovered' : 'ai-assisted';
}
