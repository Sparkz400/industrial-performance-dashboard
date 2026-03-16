import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import type { TwinNodeBinding } from '../hooks/useDigitalTwinQueries';

interface LiveDataValue {
  value: number | string;
  timestamp: string;
}

interface SvgViewerProps {
  svgContent: string;
  bindings: TwinNodeBinding[];
  liveData: Record<string, LiveDataValue>;
  onElementClick?: (binding: TwinNodeBinding) => void;
}

interface OverlayPosition {
  x: number;
  y: number;
  binding: TwinNodeBinding;
}

const SvgViewer: React.FC<SvgViewerProps> = ({
  svgContent,
  bindings,
  liveData,
  onElementClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const [overlays, setOverlays] = useState<OverlayPosition[]>([]);

  const updateOverlayPositions = useCallback(() => {
    if (!svgRef.current) return;

    const svgElement = svgRef.current.querySelector('svg');
    if (!svgElement) return;

    const containerRect = svgRef.current.getBoundingClientRect();
    const newOverlays: OverlayPosition[] = [];

    for (const binding of bindings) {
      const el = svgElement.querySelector(`#${CSS.escape(binding.elementId)}`);
      if (!el) continue;

      const elRect = el.getBoundingClientRect();
      newOverlays.push({
        x: elRect.left - containerRect.left + elRect.width / 2,
        y: elRect.top - containerRect.top + elRect.height / 2,
        binding,
      });
    }

    setOverlays(newOverlays);
  }, [bindings]);

  useEffect(() => {
    updateOverlayPositions();

    const observer = new ResizeObserver(() => {
      updateOverlayPositions();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [updateOverlayPositions, svgContent]);

  // Attach click handlers to SVG elements
  useEffect(() => {
    if (!svgRef.current || !onElementClick) return;

    const svgElement = svgRef.current.querySelector('svg');
    if (!svgElement) return;

    const handlers = new Map<Element, EventListener>();

    for (const binding of bindings) {
      const el = svgElement.querySelector(`#${CSS.escape(binding.elementId)}`);
      if (!el) continue;

      const handler = () => onElementClick(binding);
      el.addEventListener('click', handler);
      (el as SVGElement).style.cursor = 'pointer';
      handlers.set(el, handler);
    }

    return () => {
      handlers.forEach((handler, el) => {
        el.removeEventListener('click', handler);
      });
    };
  }, [bindings, onElementClick, svgContent]);

  const formatValue = (binding: TwinNodeBinding, data: LiveDataValue | undefined): string => {
    if (!data) return '--';
    const val = typeof data.value === 'number' ? data.value.toFixed(1) : String(data.value);
    return binding.unit ? `${val} ${binding.unit}` : val;
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Render SVG */}
      <Box
        ref={svgRef}
        sx={{
          width: '100%',
          height: '100%',
          '& svg': {
            width: '100%',
            height: '100%',
          },
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />

      {/* Data overlays */}
      {overlays.map((overlay) => {
        const data = liveData[overlay.binding.nodeKey];
        return (
          <Paper
            key={overlay.binding.elementId}
            elevation={2}
            sx={{
              position: 'absolute',
              left: overlay.x,
              top: overlay.y,
              transform: 'translate(-50%, -120%)',
              px: 0.75,
              py: 0.25,
              pointerEvents: 'none',
              bgcolor: 'background.paper',
              borderRadius: 0.5,
              whiteSpace: 'nowrap',
              opacity: 0.9,
            }}
          >
            <Typography variant="caption" display="block" fontWeight={600} fontSize="0.65rem">
              {overlay.binding.label}
            </Typography>
            <Typography
              variant="caption"
              fontSize="0.7rem"
              color={data ? 'text.primary' : 'text.disabled'}
            >
              {formatValue(overlay.binding, data)}
            </Typography>
          </Paper>
        );
      })}
    </Box>
  );
};

export default SvgViewer;
