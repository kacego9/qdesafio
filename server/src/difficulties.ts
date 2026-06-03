import { DifficultyDefinition } from './shared-types';

export const DIFFICULTIES: DifficultyDefinition[] = [
  {
    id: 'easy',
    columns: 5,
    rows: 4,
    boxes: 20,
    timeLimit: 15,
    pointsBase: 100
  },
  {
    id: 'medium',
    columns: 8,
    rows: 6,
    boxes: 48,
    timeLimit: 15,
    pointsBase: 200
  },
  {
    id: 'hard',
    columns: 10,
    rows: 8,
    boxes: 80,
    timeLimit: 12,
    pointsBase: 350
  },
  {
    id: 'insane',
    columns: 14,
    rows: 10,
    boxes: 140,
    timeLimit: 10,
    pointsBase: 500
  }
];

export function getDifficulty(id: string): DifficultyDefinition {
  return DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[1];
}

// Avatares y colores disponibles
export const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐯', '🐵', '🐨', '🐙', '🦄', '🦉', '🐢', '🦋'];

export const COLORS = [
  '#ff006e', '#3a86ff', '#ffbe0b', '#8338ec',
  '#06d6a0', '#fb5607', '#e63946', '#43aa8b',
  '#f72585', '#4cc9f0', '#ffd166', '#9d4edd'
];
