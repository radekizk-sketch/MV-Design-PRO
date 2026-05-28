import type React from 'react';

export interface RendererSldProps {
  readonly title?: string;
}

export const RendererSld: React.FC<RendererSldProps> = ({ title = 'Schemat jednokreskowy' }) => (
  <svg data-sld-role="legacy-sld-renderer" width="320" height="120" viewBox="0 0 320 120">
    <rect x={0} y={0} width={320} height={120} fill="#07111f" />
    <text x={16} y={28} fill="#e5e7eb" fontSize={14}>
      {title}
    </text>
  </svg>
);
