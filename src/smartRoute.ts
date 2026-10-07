import { normalizeTrackKey, type SmartListeningConfig } from "./listeningPreferences.js";
import {
  type Eligibility,
  evaluateSnapshot,
  type PolicySnapshot,
  rankCandidates,
  type SmartTrigger,
} from "./smartPolicy.js";
import type { ContentKind, Station, TrackInfo } from "./types.js";

export interface SmartRouteInput {
  now: number;
  enabled: boolean;
  playing: boolean;
  station: Station | null;
  config: SmartListeningConfig;
  snapshots: PolicySnapshot[];
  pool: Station[];
  favorites?: Set<string>;
  similar?: Set<string>;
}
export interface SmartRouteCommand {
  destination: Station;
  trigger: SmartTrigger | null;
  automatic: boolean;
  returning: boolean;
}
export interface SmartRouteStatus {
  phase: "warning" | "detour" | "unavailable";
  originStation: Station;
  triggerStation: Station;
  trigger: SmartTrigger;
  candidate: Station | null;
  candidateReason: Eligibility["reason"];
  secondsLeft: number;
}
export class SmartRouteController {
  private value: SmartRouteStatus | null = null;
  private expectedId: string | null = null;
  private last: SmartRouteInput | null = null;
  private warningAt: number | null = null;
  private detourAt: number | null = null;
  private returnAfter = 0;
  private originTrigger: SmartTrigger | null = null;
  private safeAt: number | null = null;
  private switches: number[] = [];
  private suppressed: { stationId: string; trigger: SmartTrigger; safeAt: number | null } | null = null;

  get status(): SmartRouteStatus | null {
    return this.value;
  }

  step(input: SmartRouteInput): SmartRouteCommand | null {
    return this.advance(input, false);
  }

  switchNow(input: SmartRouteInput): SmartRouteCommand | null {
    return this.advance(input, true);
  }

  private advance(input: SmartRouteInput, manual: boolean): SmartRouteCommand | null {
    if (!input.enabled || !input.station) {
      this.reset();
      return null;
    }
    if (this.expectedId !== null && this.expectedId !== input.station.id) this.reset();
    this.expectedId = input.station.id;
    this.last = input;
    if (!input.playing) {
      this.safeAt = null;
      this.warningAt = null;
      if (this.detourAt === null) this.clearRoute();
      else this.showDetour();
      return null;
    }
    const current = input.snapshots.find((s) => s.station.id === input.station?.id);
    const evaluation = evaluateSnapshot(current, input.config, input.now);
    const suppressed = this.isSuppressed(input, current, evaluation);
    if (this.detourAt !== null) {
      const origin = input.snapshots.find((s) => s.station.id === this.value?.originStation.id);
      const originEvaluation = evaluateSnapshot(origin, input.config, input.now);
      if (originEvaluation.eligibility !== "fallback")
        this.returnAfter = Math.max(this.returnAfter, advertisementDeadline(origin?.track, origin?.kind));
      if (originEvaluation.eligibility !== "eligible" || origin?.updatedAt === null || !origin) {
        this.safeAt = null;
      } else {
        this.safeAt ??= origin.updatedAt;
        if (
          !manual &&
          origin.updatedAt - this.safeAt >= 5_000 &&
          input.now - this.detourAt >= 10_000 &&
          input.now >= this.returnAfter &&
          this.canSwitch(input.now)
        ) {
          return this.returnToOrigin(true);
        }
      }
    }
    if (!evaluation.trigger || suppressed) {
      // A lost observation keeps the warning visible, but cannot authorize a switch.
      const retained =
        this.value &&
        this.warningAt !== null &&
        evaluation.eligibility === "fallback" &&
        this.ruleStillRejects(input, this.value.trigger);
      if (retained) this.updateCandidate(input);
      else {
        this.warningAt = null;
        if (this.detourAt === null) this.clearRoute();
        else this.showDetour();
      }
      return null;
    }
    const trigger = evaluation.trigger;
    if (
      this.warningAt === null ||
      this.value?.triggerStation.id !== input.station.id ||
      !sameContent(this.value.trigger, trigger, input.now)
    ) {
      this.warningAt = input.now + 5_000;
    }
    if (!this.value || this.value.originStation.id === input.station.id) {
      this.originTrigger = trigger;
      this.returnAfter = Math.max(
        this.returnAfter,
        advertisementDeadline(trigger.track, trigger.reason === "advertisement" ? "advertisement" : "unknown"),
      );
    }
    this.value = {
      phase: "warning",
      originStation: this.value?.originStation ?? input.station,
      triggerStation: input.station,
      trigger,
      candidate: null,
      candidateReason: "unknown",
      secondsLeft: 5,
    };
    this.updateCandidate(input);
    if (this.value.candidate && (manual || (input.now >= this.warningAt && this.canSwitch(input.now))))
      return this.leave(input, !manual);
    return null;
  }

  manualReturn(): SmartRouteCommand | null {
    return this.detourAt === null ? null : this.returnToOrigin(false);
  }

  dismiss(): void {
    if (this.value)
      this.suppressed = { stationId: this.value.triggerStation.id, trigger: this.value.trigger, safeAt: null };
    this.warningAt = null;
    if (this.detourAt === null) this.clearRoute();
    else this.showDetour();
  }

  reset(): void {
    this.clearRoute();
    this.expectedId = null;
    this.last = null;
    this.suppressed = null;
  }

  cancelReturn(): void {
    this.clearRoute();
  }

  private clearRoute(): void {
    this.value = null;
    this.warningAt = null;
    this.detourAt = null;
    this.originTrigger = null;
    this.safeAt = null;
    this.returnAfter = 0;
  }

  private showDetour(candidate = this.last?.station): void {
    if (this.value)
      this.value = {
        ...this.value,
        phase: "detour",
        candidate: candidate ?? null,
        candidateReason: "safe",
        secondsLeft: 0,
      };
  }

  private canSwitch(now: number): boolean {
    this.switches = this.switches.filter((time) => now - time < 30_000);
    return this.switches.length < 3;
  }

  private updateCandidate(input: SmartRouteInput): void {
    if (!this.value) return;
    const snapshots = input.pool
      .filter((s) => this.detourAt === null || s.id !== this.value?.originStation.id)
      .map(
        (station) =>
          input.snapshots.find((s) => s.station.id === station.id) ?? {
            station,
            track: null,
            kind: "unknown" as const,
            evidence: null,
            updatedAt: null,
            stale: false,
            error: false,
          },
      );
    const best = rankCandidates(
      snapshots,
      input.config,
      input.now,
      input.station?.id ?? "",
      input.favorites,
      input.similar,
      input.pool.map((s) => s.id),
    )[0];
    this.value = {
      ...this.value,
      phase: best ? "warning" : "unavailable",
      candidate: best?.snapshot.station ?? null,
      candidateReason: best?.reason ?? "unknown",
      secondsLeft: Math.max(0, Math.ceil(((this.warningAt ?? input.now) - input.now) / 1_000)),
    };
  }

  private leave(input: SmartRouteInput, automatic: boolean): SmartRouteCommand | null {
    if (!this.value?.candidate) return null;
    const command = { destination: this.value.candidate, trigger: this.value.trigger, automatic, returning: false };
    if (automatic) this.switches.push(input.now);
    this.expectedId = command.destination.id;
    this.detourAt = input.now;
    this.warningAt = null;
    this.safeAt = null;
    this.showDetour(command.destination);
    return command;
  }

  private returnToOrigin(automatic: boolean): SmartRouteCommand | null {
    if (!this.value || !this.last) return null;
    const command = { destination: this.value.originStation, trigger: null, automatic, returning: true };
    if (automatic) this.switches.push(this.last.now);
    else {
      const snapshot = this.last.snapshots.find((s) => s.station.id === command.destination.id);
      const trigger = evaluateSnapshot(snapshot, this.last.config, this.last.now).trigger ?? this.originTrigger;
      if (trigger) this.suppressed = { stationId: command.destination.id, trigger, safeAt: null };
    }
    this.expectedId = command.destination.id;
    this.clearRoute();
    return command;
  }

  private ruleStillRejects(input: SmartRouteInput, trigger: SmartTrigger): boolean {
    if (!input.station) return false;
    return (
      evaluateSnapshot(
        {
          station: input.station,
          track: trigger.track,
          kind: trigger.reason === "negativeArtist" || trigger.reason === "negativeTrack" ? "track" : trigger.reason,
          evidence: trigger.track.contentEvidence ?? null,
          updatedAt: input.now,
          stale: false,
          error: false,
        },
        input.config,
        input.now,
      ).eligibility === "rejected"
    );
  }

  private isSuppressed(input: SmartRouteInput, snapshot: PolicySnapshot | undefined, evaluation: Eligibility): boolean {
    const suppressed = this.suppressed;
    if (!suppressed || suppressed.stationId !== input.station?.id) return false;
    if (evaluation.eligibility === "fallback") {
      suppressed.safeAt = null;
      return true;
    }
    if (evaluation.trigger && sameContent(suppressed.trigger, evaluation.trigger, input.now)) {
      suppressed.safeAt = null;
      return true;
    }
    if (evaluation.trigger) {
      this.suppressed = null;
      return false;
    }
    const music = snapshot?.kind === "track" && snapshot.track;
    const windowEnd =
      advertisementDeadline(
        suppressed.trigger.track,
        suppressed.trigger.reason === "advertisement" ? "advertisement" : "unknown",
      ) || (suppressed.trigger.upcoming ? (suppressed.trigger.track.timestamp ?? 0) * 1_000 : 0);
    if (
      music &&
      (suppressed.trigger.reason.startsWith("negative") || !evaluation.trigger) &&
      normalizeTrackKey(music.artist, music.title) !==
        normalizeTrackKey(suppressed.trigger.track.artist, suppressed.trigger.track.title) &&
      windowEnd <= input.now
    ) {
      this.suppressed = null;
      return false;
    }
    if (evaluation.eligibility === "eligible") {
      suppressed.safeAt ??= snapshot?.updatedAt ?? input.now;
      if ((snapshot?.updatedAt ?? input.now) - suppressed.safeAt >= 5_000 && windowEnd <= input.now)
        this.suppressed = null;
    } else suppressed.safeAt = null;
    return this.suppressed !== null;
  }
}

function sameContent(a: SmartTrigger, b: SmartTrigger, now: number): boolean {
  if (a.reason.startsWith("negative") && b.reason.startsWith("negative"))
    return normalizeTrackKey(a.track.artist, a.track.title) === normalizeTrackKey(b.track.artist, b.track.title);
  if (a.reason !== b.reason) return false;
  if (now < advertisementDeadline(a.track, a.reason === "advertisement" ? "advertisement" : "unknown")) return true;
  if (a.upcoming && !b.upcoming && b.track.timestamp === undefined) return true;
  return a.track.timestamp === b.track.timestamp;
}

function advertisementDeadline(track: TrackInfo | null | undefined, kind: ContentKind | undefined): number {
  if (!track || kind !== "advertisement" || track.isPredicted) return 0;
  return track.adEndsAt ?? (track.endTimestamp ?? 0) * 1_000;
}
