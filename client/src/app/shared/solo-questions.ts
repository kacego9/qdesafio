/**
 * Catálogo de preguntas para el modo Solo.
 * Se sirve directamente desde /assets, sin necesidad de servidor.
 */

export interface QuestionAsset {
  id: number;
  urlRepeat: string;
  urlUnique: string;
}

export const SOLO_QUESTIONS: QuestionAsset[] = Array.from({ length: 16 }, (_, i) => {
  const n = i + 1;
  return {
    id: n,
    urlRepeat: `assets/find-odd/img/${n}_0.webp`,
    urlUnique: `assets/find-odd/img/${n}_1.webp`
  };
});

/**
 * Devuelve `count` preguntas barajadas. Si el catálogo es más corto,
 * recicla evitando que dos preguntas consecutivas sean iguales.
 */
export function pickSoloQuestions(count: number): QuestionAsset[] {
  const shuffled = [...SOLO_QUESTIONS].sort(() => Math.random() - 0.5);
  const result: QuestionAsset[] = [];
  let i = 0;
  while (result.length < count) {
    const candidate = shuffled[i % shuffled.length];
    // evitar repetir consecutivamente
    if (result.length === 0 || result[result.length - 1].id !== candidate.id) {
      result.push(candidate);
    } else {
      // saltar uno extra para descalzar
      i++;
      result.push(shuffled[(i + 1) % shuffled.length]);
    }
    i++;
  }
  return result;
}
