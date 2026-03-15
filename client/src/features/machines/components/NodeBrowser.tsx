import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  Collapse,
  Checkbox,
  Chip,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMachineStore } from '@/stores/useMachineStore';
import type { BrowsedNode } from '@/types';

interface NodeBrowserProps {
  machineId: number;
  selectedNodes: BrowsedNode[];
  onToggleNode: (node: BrowsedNode) => void;
}

interface TreeNodeProps {
  node: BrowsedNode;
  machineId: number;
  depth: number;
  isSelected: boolean;
  onToggle: (node: BrowsedNode) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, machineId, depth, isSelected, onToggle }) => {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<BrowsedNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const browseNodes = useMachineStore((s) => s.browseNodes);

  const isObject = node.nodeClass === 'Object' || node.nodeClass === 'View';
  const isVariable = node.nodeClass === 'Variable';

  const handleExpand = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    if (children.length === 0) {
      setLoading(true);
      setError(null);
      try {
        const result = await browseNodes(machineId, node.nodeId);
        setChildren(result);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    setExpanded(true);
  }, [expanded, children.length, browseNodes, machineId, node.nodeId]);

  return (
    <>
      <ListItemButton sx={{ pl: 2 + depth * 2 }} onClick={isObject ? handleExpand : undefined}>
        {isVariable && (
          <Checkbox
            edge="start"
            checked={isSelected}
            onChange={() => onToggle(node)}
            onClick={(e) => e.stopPropagation()}
            size="small"
          />
        )}
        <ListItemIcon sx={{ minWidth: 36 }}>
          {isObject ? <FolderIcon color="primary" /> : <DescriptionIcon color="action" />}
        </ListItemIcon>
        <ListItemText
          primary={node.displayName}
          secondary={isVariable ? node.nodeId : undefined}
          primaryTypographyProps={{ fontSize: '0.875rem' }}
          secondaryTypographyProps={{ fontSize: '0.75rem', noWrap: true }}
        />
        <Chip
          label={node.nodeClass}
          size="small"
          variant="outlined"
          sx={{ mr: 1, fontSize: '0.7rem' }}
        />
        {isObject &&
          (loading ? (
            <CircularProgress size={16} />
          ) : expanded ? (
            <ExpandLessIcon />
          ) : (
            <ExpandMoreIcon />
          ))}
      </ListItemButton>

      {isObject && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          {error && (
            <Alert severity="error" sx={{ ml: 4 + depth * 2, mr: 2, my: 0.5 }}>
              {error}
            </Alert>
          )}
          <List disablePadding>
            {children.map((child, idx) => (
              <TreeNode
                key={`${child.nodeId}-${idx}`}
                node={child}
                machineId={machineId}
                depth={depth + 1}
                isSelected={false}
                onToggle={onToggle}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

const NodeBrowser: React.FC<NodeBrowserProps> = ({ machineId, selectedNodes, onToggleNode }) => {
  const [rootNodes, setRootNodes] = useState<BrowsedNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasBrowsed, setHasBrowsed] = useState(false);
  const browseNodes = useMachineStore((s) => s.browseNodes);

  const handleBrowseRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nodes = await browseNodes(machineId);
      setRootNodes(nodes);
      setHasBrowsed(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [browseNodes, machineId]);

  React.useEffect(() => {
    if (!hasBrowsed) {
      handleBrowseRoot();
    }
  }, [machineId, hasBrowsed, handleBrowseRoot]);

  const isNodeSelected = (node: BrowsedNode): boolean =>
    selectedNodes.some((n) => n.nodeId === node.nodeId);

  if (loading && !hasBrowsed) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !hasBrowsed) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Browse OPC-UA Nodes — select variables to map
      </Typography>
      {selectedNodes.length > 0 && (
        <Typography variant="body2" color="primary" sx={{ mb: 1 }}>
          {selectedNodes.length} node(s) selected
        </Typography>
      )}
      <Box
        sx={{
          maxHeight: 400,
          overflow: 'auto',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <List disablePadding dense>
          {rootNodes.map((node, idx) => (
            <TreeNode
              key={`${node.nodeId}-${idx}`}
              node={node}
              machineId={machineId}
              depth={0}
              isSelected={isNodeSelected(node)}
              onToggle={onToggleNode}
            />
          ))}
        </List>
      </Box>
    </Box>
  );
};

export default NodeBrowser;
