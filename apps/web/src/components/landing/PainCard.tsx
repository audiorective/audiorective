import type { ReactNode } from "react";

export interface PainCardProps {
  id: string;
  title: string;
  oneLiner: ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  diagram: ReactNode;
  children: ReactNode;
}

export default function PainCard({ id, title, oneLiner, open, onToggle, diagram, children }: PainCardProps) {
  return (
    <article className={`pain-card pain-card--${id}`}>
      <button type="button" className="card-title card-toggle" aria-expanded={open} onClick={() => onToggle(id)}>
        {title}
      </button>
      <p className="card-oneliner">{oneLiner}</p>
      <div className="card-diagram">{diagram}</div>
      {open && <div className="card-reasoning">{children}</div>}
    </article>
  );
}
