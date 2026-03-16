import React, { useState, useRef, useCallback } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Paper,
  Drawer,
  Fab,
  Tooltip,
  CircularProgress,
  Chip,
  alpha,
  Divider,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import BarChartIcon from '@mui/icons-material/BarChart';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsivePie } from '@nivo/pie';
import { api } from '@/utils/api';
import type { NLQueryResponse, NLChartConfig } from '@/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  chartConfig?: NLChartConfig | null;
  timestamp: Date;
}

const EXAMPLE_QUERIES = [
  'Show me machine temperatures from last hour',
  "What's the average uptime rate this week?",
  'List all active alarms',
  'Compare air consumption across machines',
];

/**
 *
 * @param root0
 * @param root0.config
 */
function NLChart({ config }: { config: NLChartConfig }) {
  if (!config.data || config.data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        No data to display
      </Typography>
    );
  }

  if (config.type === 'line') {
    const lineData = [
      {
        id: config.yAxis,
        data: config.data.map((d: Record<string, unknown>) => ({
          x: d[config.xAxis],
          y: d[config.yAxis],
        })),
      },
    ];
    return (
      <Box sx={{ height: 250 }}>
        <ResponsiveLine
          data={lineData}
          margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
          axisBottom={{ tickRotation: -45, truncateTickAt: 10 }}
          pointSize={6}
          pointColor={{ theme: 'background' }}
          pointBorderWidth={2}
          pointBorderColor={{ from: 'serieColor' }}
          enableArea
          areaOpacity={0.1}
          useMesh
          theme={{ text: { fill: '#ccc' }, grid: { line: { stroke: '#444' } } }}
        />
      </Box>
    );
  }

  if (config.type === 'bar') {
    return (
      <Box sx={{ height: 250 }}>
        <ResponsiveBar
          data={config.data as Record<string, unknown>[]}
          keys={[config.yAxis]}
          indexBy={config.xAxis}
          margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
          padding={0.3}
          colors={{ scheme: 'nivo' }}
          axisBottom={{ tickRotation: -45, truncateTickAt: 10 }}
          theme={{ text: { fill: '#ccc' }, grid: { line: { stroke: '#444' } } }}
        />
      </Box>
    );
  }

  if (config.type === 'pie') {
    const pieData = config.data.map((d: Record<string, unknown>, i: number) => ({
      id: d[config.xAxis] || `item-${i}`,
      label: d[config.xAxis] || `Item ${i}`,
      value: d[config.yAxis],
    }));
    return (
      <Box sx={{ height: 250 }}>
        <ResponsivePie
          data={pieData}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          innerRadius={0.5}
          padAngle={0.7}
          cornerRadius={3}
          colors={{ scheme: 'nivo' }}
          theme={{ text: { fill: '#ccc' } }}
        />
      </Box>
    );
  }

  return null;
}

/**
 *
 */
export default function NLQueryPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  const handleSend = useCallback(async () => {
    const query = input.trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
      const response = (await api.endpoints.nlQuery(query)) as NLQueryResponse;
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
        chartConfig: response.chartConfig,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Failed to process query',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [input, loading, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleExampleClick = useCallback((query: string) => {
    setInput(query);
  }, []);

  return (
    <>
      <Tooltip title="Ask AI about your data" placement="left">
        <Fab
          color="primary"
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1200,
            background: 'linear-gradient(135deg, #6C63FF, #FF6B9D)',
            '&:hover': { background: 'linear-gradient(135deg, #5A52E0, #E05A8A)' },
          }}
        >
          <SmartToyIcon />
        </Fab>
      </Tooltip>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 440 },
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #6C63FF22, #FF6B9D22)',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SmartToyIcon color="primary" />
            <Typography variant="h6" fontWeight={600}>
              AI Data Assistant
            </Typography>
          </Box>
          <IconButton onClick={() => setOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Messages */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {messages.length === 0 && (
            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <SmartToyIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
              <Typography variant="body1" color="text.secondary" gutterBottom>
                Ask questions about your machine data in natural language
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.disabled" sx={{ mb: 1, display: 'block' }}>
                Try these examples:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
                {EXAMPLE_QUERIES.map((q) => (
                  <Chip
                    key={q}
                    label={q}
                    size="small"
                    variant="outlined"
                    onClick={() => handleExampleClick(q)}
                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  />
                ))}
              </Box>
            </Box>
          )}

          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      maxWidth: '85%',
                      borderRadius: 2,
                      bgcolor:
                        msg.role === 'user'
                          ? (theme) => alpha(theme.palette.primary.main, 0.15)
                          : (theme) => alpha(theme.palette.background.paper, 0.8),
                      border: 1,
                      borderColor: msg.role === 'user' ? 'primary.main' : 'divider',
                    }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </Typography>
                    {msg.chartConfig && (
                      <Box sx={{ mt: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                          <BarChartIcon fontSize="small" color="primary" />
                          <Typography variant="caption" color="primary">
                            {msg.chartConfig.title}
                          </Typography>
                        </Box>
                        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                          <NLChart config={msg.chartConfig} />
                        </Paper>
                      </Box>
                    )}
                  </Paper>
                </Box>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Thinking...
              </Typography>
            </Box>
          )}
          <div ref={messagesEndRef} />
        </Box>

        {/* Input */}
        <Box
          sx={{
            p: 2,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
            bgcolor: 'background.paper',
          }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="Ask about your data..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            multiline
            maxRows={3}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <IconButton
            color="primary"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            sx={{
              bgcolor: 'primary.main',
              color: 'white',
              '&:hover': { bgcolor: 'primary.dark' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
              borderRadius: 2,
              width: 40,
              height: 40,
              alignSelf: 'flex-end',
            }}
          >
            <SendIcon fontSize="small" />
          </IconButton>
        </Box>
      </Drawer>
    </>
  );
}
