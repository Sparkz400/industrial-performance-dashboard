import React, { useEffect } from 'react';
import { FormControl, Select, MenuItem, Typography, Box } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@/config/config';
import { protectedFetch } from '@/utils/protectedFetch';
import { usePlantStore } from '@/stores/usePlantStore';

interface Plant {
  id: number;
  name: string;
  location: string | null;
  timezone: string;
  isActive: boolean;
}

const fetchPlants = async (): Promise<Plant[]> => {
  const res = await protectedFetch(API_ENDPOINTS.plants.base);
  if (!res.ok) throw new Error('Failed to fetch plants');
  return res.json();
};

const PlantSelector: React.FC = () => {
  const currentPlant = usePlantStore((s) => s.currentPlant);
  const setPlants = usePlantStore((s) => s.setPlants);
  const setCurrentPlant = usePlantStore((s) => s.setCurrentPlant);

  const { data: plants = [] } = useQuery({
    queryKey: ['plantSelector'],
    queryFn: fetchPlants,
    staleTime: 60000,
  });

  useEffect(() => {
    if (plants.length > 0) {
      setPlants(plants);
    }
  }, [plants, setPlants]);

  const handleChange = (event: SelectChangeEvent<number | ''>) => {
    const value = event.target.value;
    if (value === '') {
      setCurrentPlant(null);
    } else {
      const selected = plants.find((p) => p.id === value);
      if (selected) {
        setCurrentPlant(selected);
      }
    }
  };

  if (plants.length === 0) return null;

  return (
    <Box sx={{ px: 1, py: 0.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
        Plant
      </Typography>
      <FormControl fullWidth size="small" sx={{ mt: 0.5 }}>
        <Select
          value={currentPlant?.id ?? ''}
          onChange={handleChange}
          displayEmpty
          sx={{
            fontSize: '0.8125rem',
            '& .MuiSelect-select': { py: 0.75 },
          }}
        >
          <MenuItem value="">
            <em>All Plants</em>
          </MenuItem>
          {plants
            .filter((p) => p.isActive)
            .map((plant) => (
              <MenuItem key={plant.id} value={plant.id}>
                {plant.name}
              </MenuItem>
            ))}
        </Select>
      </FormControl>
    </Box>
  );
};

export default PlantSelector;
