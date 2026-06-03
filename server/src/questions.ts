/**
 * Catálogo de preguntas (emojis) disponible en el servidor.
 * Hardcodeado con las 16 imágenes del proyecto original.
 * El cliente sirve las imágenes desde su propio /assets.
 */

export interface QuestionAsset {
  id: number;
  urlRepeat: string;
  urlUnique: string;
}

export const QUESTIONS: QuestionAsset[] = Array.from({ length: 16 }, (_, i) => {
  const n = i + 1;
  return {
    id: n,
    urlRepeat: `assets/find-odd/img/${n}_0.webp`,
    urlUnique: `assets/find-odd/img/${n}_1.webp`
  };
});

/**
 * Devuelve una lista barajada de preguntas, con longitud `count`.
 * Si count > catálogo, recicla preguntas.
 */
export function pickQuestions(count: number): QuestionAsset[] {
  const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
  const result: QuestionAsset[] = [];
  for (let i = 0; i < count; i++) {
    result.push(shuffled[i % shuffled.length]);
  }
  return result;
}
