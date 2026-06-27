import type { ParamOptions } from "./types";
import { Param } from "./Param";
import { ParamSync } from "./ParamSync";

export interface SchedulableParamOptions extends ParamOptions<number> {
  syncInterval?: number;
  audioParam: AudioParam;
  audioContext: AudioContext;
}

/**
 * Numeric Param that mirrors the Web Audio AudioParam scheduling API.
 */

export class SchedulableParam extends Param<number> {
  // Not readonly: rebind() re-points this for sources whose node is recreated
  // (an AudioBufferSourceNode is one-shot, so each start() makes a fresh playbackRate).
  private _audioParam: AudioParam;
  private readonly _audioContext: BaseAudioContext;

  override get value(): number {
    return super.value;
  }

  override set value(newValue: number) {
    super.value = newValue;
    this._audioParam.value = newValue;
  }

  constructor(options: SchedulableParamOptions) {
    super(options);
    this._audioContext = options.audioContext;
    this._audioParam = options.audioParam;

    ParamSync.for(this._audioContext).register(this, options.syncInterval);

    // actively sync default value to audioParam
    this.value = options.default;
  }

  /**
   * Re-point this param at a different AudioParam. For sources whose node is
   * recreated on each (re)start — the new node carries a fresh AudioParam with
   * no scheduling history. ParamSync is keyed on `this`, not the AudioParam, so
   * read()/syncFromAudio() follow the new target with no re-registration, and
   * any automation queued on the old (now-dead) param is gone with its node.
   *
   * `reassert` (default true) mirrors the current value onto the new param,
   * matching the constructor's `this.value = default`. Pass false to keep
   * whatever value the new param already holds.
   */
  rebind(audioParam: AudioParam, opts?: { reassert?: boolean }): void {
    this._audioParam = audioParam;
    if (opts?.reassert ?? true) {
      this._audioParam.value = this.value;
    }
  }

  /**
   * read realtime value from AudioParam directly
   */
  read(): number {
    return this._audioParam.value;
  }

  /**
   * sync current value to the audioParam value underhood
   */
  syncFromAudio(): void {
    super.value = this._audioParam.value;
  }

  setValueAtTime(value: number, time: number): this {
    this._audioParam.setValueAtTime(value, time);
    return this;
  }

  linearRampToValueAtTime(value: number, endTime: number): this {
    this._audioParam.linearRampToValueAtTime(value, endTime);
    return this;
  }

  exponentialRampToValueAtTime(value: number, endTime: number): this {
    this._audioParam.exponentialRampToValueAtTime(value, endTime);
    return this;
  }

  setTargetAtTime(target: number, startTime: number, timeConstant: number): this {
    this._audioParam.setTargetAtTime(target, startTime, timeConstant);
    return this;
  }

  cancelScheduledValues(cancelTime: number): this {
    this._audioParam.cancelScheduledValues(cancelTime);
    return this;
  }

  cancelAndHoldAtTime(cancelTime: number): this {
    this._audioParam.cancelAndHoldAtTime(cancelTime);
    return this;
  }

  override destroy(): void {
    super.destroy();
    ParamSync.for(this._audioContext).unregister(this);
  }
}
