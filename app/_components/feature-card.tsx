import type { ReactNode } from "react";

type FeatureCardProps = {
  icon: ReactNode;
  title: string;
  children: ReactNode;
};

/** One tile of the "what's included" grid. Rendered as a list item: the grid is a <ul>. */
export function FeatureCard({ icon, title, children }: FeatureCardProps) {
  return (
    <li className="card">
      <span className="card-icon">{icon}</span>
      <h3 className="card-title">{title}</h3>
      <p className="card-text">{children}</p>
    </li>
  );
}
