import React from 'react';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { useAvailableTags } from '../useTrendingData';
import type { AvailableTag } from '../useTrendingData';

interface TagSelectorProps {
  machineId: number | null;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

const TagSelector: React.FC<TagSelectorProps> = ({ machineId, selectedTags, onTagsChange }) => {
  const { data: tags = [], isLoading } = useAvailableTags(machineId);

  return (
    <Autocomplete
      multiple
      size="small"
      options={tags}
      getOptionLabel={(option: AvailableTag) => option.displayName || option.nodeKey}
      value={tags.filter((t) => selectedTags.includes(t.nodeKey))}
      onChange={(_event, newValue) => {
        onTagsChange(newValue.map((v) => v.nodeKey));
      }}
      loading={isLoading}
      disabled={!machineId}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Select Tags"
          placeholder={machineId ? 'Search tags...' : 'Select a machine first'}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {isLoading ? <CircularProgress size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      sx={{ minWidth: 250 }}
    />
  );
};

export default TagSelector;
