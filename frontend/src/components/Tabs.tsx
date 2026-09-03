import type { ReactNode } from 'react';

interface TabGroupProps {
  className?: string;
  children: ReactNode;
}

/** Canonical tab strip container — main workspace tabs, status filters, wizard steps, chat sessions. */
export function TabGroup({ className, children }: TabGroupProps) {
  return <nav className={className ? `tabs ${className}` : 'tabs'}>{children}</nav>;
}

interface TabProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function Tab({ active, onClick, children }: TabProps) {
  return (
    <button type="button" className={`tabs__tab${active ? ' tabs__tab--active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
