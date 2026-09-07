import { InfoIcon } from './icons';

/** Small info-icon tooltip trigger — visible affordance that a header has
 * more context on hover, since a bare `title` attribute gives no visual cue.
 * Shared by DetailsTable.tsx and ProjectPanel.tsx's Items table so both
 * explain their columns the same way. */
export function ColInfoIcon({ text }: { text: string }) {
  return (
    <span className="details-table__col-info" title={text}>
      <InfoIcon width={12} height={12} />
    </span>
  );
}
