import type { CandidateStatus } from '../api/candidates'

/**
 * Status groups per PRD §2.2 (docs/PRD/3.候选人管理模块/0.候选人管理模块-overview.md).
 *
 * The domain stores `Candidate.status` as a flat ENUM of 11 sub-status values.
 * The 5-group partitioning (`new` / `oa` / `human` / `passed` / `failed`) is a
 * purely frontend derivation — it must exactly match the PRD mapping and is
 * reused by both the detail-page change-status modal and the list-page filter.
 *
 * Do NOT add a sub-status to more than one group: `getGroupForStatus` relies on
 * a 1:1 mapping.
 */
export type StatusGroup = 'new' | 'oa' | 'human' | 'passed' | 'failed'

export interface StatusGroupDefinition {
  group: StatusGroup
  members: CandidateStatus[]
}

export const STATUS_GROUPS: StatusGroupDefinition[] = [
  { group: 'new', members: ['new'] },
  { group: 'oa', members: ['waiting_for_oa', 'oa_completed'] },
  { group: 'human', members: ['wait_to_confirm_date', 'date_confirmed', 'human_completed'] },
  { group: 'passed', members: ['passed'] },
  { group: 'failed', members: ['oa_failed', 'oa_no_response', 'give_up_for_human', 'rejected'] },
]

/**
 * Given a flat sub-status ENUM value, return the PRD §2.2 group it belongs to.
 * Throws if the sub-status is not found in any group — that would mean the
 * `CandidateStatus` type and `STATUS_GROUPS` have drifted out of sync.
 */
export function getGroupForStatus(sub: CandidateStatus): StatusGroup {
  for (const def of STATUS_GROUPS) {
    if (def.members.includes(sub)) return def.group
  }
  throw new Error(`Unknown candidate status: ${sub} — not in any STATUS_GROUPS entry`)
}

/**
 * Flatten `STATUS_GROUPS` into the list of every sub-status, preserving the
 * group order. Replaces the ad-hoc `allSubStatuses` arrays that used to live
 * in `CandidateDetail.vue` and `CandidateList.vue`.
 */
export function allSubStatuses(): CandidateStatus[] {
  return STATUS_GROUPS.flatMap(g => g.members)
}
