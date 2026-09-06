/** Named receive points a Channel can send into. Instance-scoped; one per rack. */
export class SendBus {
  private readonly receives = new Map<string, GainNode>();
  constructor(private readonly ctx: BaseAudioContext) {}

  define(name: string): GainNode {
    let node = this.receives.get(name);
    if (!node) {
      node = new GainNode(this.ctx);
      this.receives.set(name, node);
    }
    return node;
  }

  receive(name: string): GainNode {
    const node = this.receives.get(name);
    if (!node) throw new Error(`SendBus: no receive named "${name}" — call define("${name}") first`);
    return node;
  }

  has(name: string): boolean {
    return this.receives.has(name);
  }

  destroy(): void {
    for (const node of this.receives.values()) node.disconnect();
    this.receives.clear();
  }
}
