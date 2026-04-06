import type { VRM } from '@pixiv/three-vrm';

export type Expression =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'thinking'
  | 'sleepy';

/** Maps expression names to VRM blend shape presets and weights */
const EXPRESSION_MAP: Record<Expression, Record<string, number>> = {
  neutral: {},
  happy: { happy: 0.8 },
  sad: { sad: 0.7 },
  angry: { angry: 0.6 },
  surprised: { surprised: 0.8 },
  thinking: { neutral: 0.3 },
  sleepy: { relaxed: 0.6 },
};

export class ExpressionController {
  private vrm: VRM | null = null;
  private current: Expression = 'neutral';
  private target: Expression = 'neutral';
  private blendProgress = 1.0;
  private blendSpeed = 3.0; // transitions per second

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
  }

  setExpression(expression: Expression): void {
    if (expression === this.current && this.blendProgress >= 1.0) return;
    this.target = expression;
    this.blendProgress = 0;
  }

  getExpression(): Expression {
    return this.current;
  }

  update(delta: number): void {
    if (!this.vrm?.expressionManager) return;

    if (this.blendProgress < 1.0) {
      this.blendProgress = Math.min(1.0, this.blendProgress + delta * this.blendSpeed);

      // Ease-in-out
      const t = this.blendProgress < 0.5
        ? 2 * this.blendProgress * this.blendProgress
        : 1 - Math.pow(-2 * this.blendProgress + 2, 2) / 2;

      // Blend from current to target
      const currentWeights = EXPRESSION_MAP[this.current];
      const targetWeights = EXPRESSION_MAP[this.target];

      // Reset all
      this.vrm.expressionManager.setValue('happy', 0);
      this.vrm.expressionManager.setValue('sad', 0);
      this.vrm.expressionManager.setValue('angry', 0);
      this.vrm.expressionManager.setValue('surprised', 0);
      this.vrm.expressionManager.setValue('relaxed', 0);
      this.vrm.expressionManager.setValue('neutral', 0);

      // Apply blended weights
      const allKeys = new Set([
        ...Object.keys(currentWeights),
        ...Object.keys(targetWeights),
      ]);

      for (const key of allKeys) {
        const from = currentWeights[key] ?? 0;
        const to = targetWeights[key] ?? 0;
        const value = from + (to - from) * t;
        this.vrm.expressionManager.setValue(key, value);
      }

      if (this.blendProgress >= 1.0) {
        this.current = this.target;
      }
    }
  }
}

/** Simple sentiment mapping from text keywords to expressions */
export function sentimentToExpression(text: string): Expression {
  const lower = text.toLowerCase();

  if (/\b(haha|lol|funny|great|awesome|nice|love|happy|yay|excited)\b/.test(lower)) return 'happy';
  if (/\b(sad|sorry|unfortunate|miss|cry|lost|fail)\b/.test(lower)) return 'sad';
  if (/\b(angry|mad|frustrat|annoy|hate|terrible)\b/.test(lower)) return 'angry';
  if (/\b(wow|whoa|really|amazing|incredible|what)\b/.test(lower)) return 'surprised';
  if (/\b(hmm|think|consider|maybe|perhaps|wonder|let me)\b/.test(lower)) return 'thinking';
  if (/\b(tired|sleepy|night|rest|yawn)\b/.test(lower)) return 'sleepy';

  return 'neutral';
}
