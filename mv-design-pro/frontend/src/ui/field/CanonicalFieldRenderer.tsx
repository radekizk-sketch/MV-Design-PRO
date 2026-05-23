import type React from 'react';

export interface CanonicalFieldRendererProps {
  readonly label: string;
  readonly theme?: 'canonical-dark' | 'export-light';
}

export const CanonicalFieldRenderer: React.FC<CanonicalFieldRendererProps> = ({
  label,
  theme = 'canonical-dark',
}) => {
  const exportLight = theme === 'export-light';
  return (
    <g data-sld-role="canonical-field-renderer" data-theme={theme}>
      <rect
        x={0}
        y={0}
        width={96}
        height={128}
        rx={4}
        fill={exportLight ? '#ffffff' : '#0f172a'}
        stroke={exportLight ? '#111827' : '#64748b'}
      />
      <text x={48} y={18} textAnchor="middle" fill={exportLight ? '#111827' : '#e5e7eb'} fontSize={10}>
        {label}
      </text>
    </g>
  );
};

