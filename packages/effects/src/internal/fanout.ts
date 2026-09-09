/** One automation signal driving several AudioParams; each target's intrinsic value is set to 0 so the summed input is the value. */
export function fanout(ctx: BaseAudioContext, initial: number, targets: AudioParam[]): ConstantSourceNode {
  const source = new ConstantSourceNode(ctx, { offset: initial });
  for (const t of targets) {
    t.value = 0;
    source.connect(t);
  }
  source.start();
  return source;
}
