import React, { useRef, useEffect, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { useThemeStore } from '@/stores/useThemeStore';
import type { WidgetComponentProps } from '@/types';
import type { WidgetToParentMessage, ParentToWidgetMessage } from './WidgetSDK';

interface ExternalWidgetLoaderProps extends WidgetComponentProps {
  entryUrl: string;
  widgetId: string;
}

/**
 *
 * @param root0
 * @param root0.entryUrl
 * @param root0.config
 * @param root0.widgetId
 * @param root0.onError
 */
export default function ExternalWidgetLoader({
  entryUrl,
  config,
  widgetId,
  onError,
}: ExternalWidgetLoaderProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const themeMode = useThemeStore((s) => s.themeMode);
  const widgetOrigin = React.useMemo(() => {
    try {
      return new URL(entryUrl, window.location.href).origin;
    } catch {
      return null;
    }
  }, [entryUrl]);

  const postMessage = useCallback(
    (message: ParentToWidgetMessage) => {
      if (!widgetOrigin) return;
      iframeRef.current?.contentWindow?.postMessage(message, widgetOrigin);
    },
    [widgetOrigin],
  );

  // Handle messages from widget
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      if (!widgetOrigin || event.origin !== widgetOrigin) return;

      const msg = event.data as WidgetToParentMessage;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'ready':
          // Send init message when widget is ready
          postMessage({
            type: 'init',
            config: config || {},
            theme: themeMode,
            widgetId,
          });
          break;
        case 'error':
          onError?.(new Error(msg.message));
          break;
        case 'config-change':
          // Widget wants to update its config — handled by parent
          break;
        case 'request-data':
          // Widget is requesting data — could be handled via API
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [config, themeMode, widgetId, postMessage, onError, widgetOrigin]);

  // Send config updates
  useEffect(() => {
    postMessage({ type: 'config-update', config: config || {} });
  }, [config, postMessage]);

  // Send theme updates
  useEffect(() => {
    postMessage({
      type: 'init',
      config: config || {},
      theme: themeMode,
      widgetId,
    });
  }, [themeMode, config, widgetId, postMessage]);

  if (!entryUrl) {
    return (
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Typography color="error">Widget entry URL not configured</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <iframe
        ref={iframeRef}
        src={entryUrl}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 'inherit',
        }}
        sandbox="allow-scripts allow-same-origin allow-popups"
        title={`Custom Widget ${widgetId}`}
      />
    </Box>
  );
}
