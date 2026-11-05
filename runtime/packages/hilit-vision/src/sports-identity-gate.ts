/*! SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1 — HILiT ReID — © 2026 조찬우 (Chanwoo Cho). Noncommercial use only; commercial use requires prior written approval: ccw00325@gmail.com. Credit "HILiT ReID", the author, and https://github.com/ccw00325-spec/HILiT_ReID when you use, publish, or host this. See LICENSE and NOTICE. HILiT-PUB-2026·CW·e93b02d7f1468ac5·ac525db5 @license @preserve */
/* 스포츠 개인 추적 신원 문.

외형·Tracklet·번호·팀·코트 힌트를 한곳에서 본다.
한 신호로 확정하지 않는다. 자동 재획득을 열지 않는다.
같은 유니폼에서 옆 사람으로 점프하는 것을 우선 막는다.
*/

import type { ReidDecision } from './appearance-memory';
import type { TrackletSwitchDecision } from './tracklet-graph';
import type { JerseyDecision } from './jersey-lock';
import type { TeamDecision } from './team-cue';

export type SportsGateAction = 'accept' | 'hold' | 'reject-switch';

export interface SportsGateResult {
  action: SportsGateAction;
  reason: string;
  identityConfirmed: false;
  eligibleForAutoReacquire: false;
}

export function gateSportsIdentity(input: {
  appearance?: ReidDecision | null;
  tracklet?: TrackletSwitchDecision | null;
  jersey?: JerseyDecision | null;
  team?: TeamDecision | null;
  courtFar?: boolean | null;
  gapSeconds?: number;
}): SportsGateResult {
  const deny = (reason: string): SportsGateResult => ({
    action: 'reject-switch',
    reason,
    identityConfirmed: false,
    eligibleForAutoReacquire: false,
  });
  const hold = (reason: string): SportsGateResult => ({
    action: 'hold',
    reason,
    identityConfirmed: false,
    eligibleForAutoReacquire: false,
  });

  if (input.jersey?.action === 'conflict') return deny('jersey-conflict');
  if (input.tracklet?.action === 'block-switch') return deny(input.tracklet.reason);
  if (input.appearance === 'reject') return deny('appearance-reject');
  if (input.jersey?.action === 'hold' && input.jersey.locked) return hold('jersey-unreadable');
  if (input.tracklet?.action === 'hold') return hold(input.tracklet.reason);
  if (input.appearance === 'hold') return hold('appearance-hold');
  if (input.team?.sameTeam === true && (input.gapSeconds ?? 0) > 0.8) {
    return hold('same-team-after-gap');
  }
  if (input.courtFar === true && (input.gapSeconds ?? 0) < 0.5) {
    return hold('court-teleport');
  }
  if (input.appearance === 'accept') {
    return {
      action: 'accept',
      reason: 'multi-signal-ok',
      identityConfirmed: false,
      eligibleForAutoReacquire: false,
    };
  }
  return hold('insufficient-sports-evidence');
}
