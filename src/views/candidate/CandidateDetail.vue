<template>
  <div v-if="!loading && candidate">
    <div style="margin-bottom: 16px;">
      <a-button @click="goBackToCandidateList">
        {{ t('candidate.backToList') }}
      </a-button>
    </div>

    <!-- Top info card -->
    <a-card style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <!-- Left side -->
        <div style="display: flex; flex-direction: row; align-items: flex-start; gap: 16px;">
          <a-avatar :size="56" :style="{ backgroundColor: '#1890ff', fontSize: '24px', flexShrink: 0 }">
            {{ displayCandidateName.charAt(0) }}
          </a-avatar>
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 18px; font-weight: bold;">{{ displayCandidateName }}</span>
              <StatusTag :status="candidate.status" />
            </div>
            <a-descriptions :column="3" size="small" :bordered="false">
              <a-descriptions-item :label="t('candidate.position')">
                {{ positionName }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('candidate.gender')">
                {{ candidate.gender ? (candidate.gender === 'male' ? t('candidate.male') : t('candidate.female')) : '-' }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('candidate.oneTimeCode')">
                <code style="font-family: monospace;">{{ candidate.oneTimeCode }}</code>
              </a-descriptions-item>
              <a-descriptions-item :label="t('candidate.email')">
                {{ candidate.email || '-' }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('candidate.phone')">
                {{ candidate.phone || '-' }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('candidate.oaDeadline')">
                {{ candidate.oaDeadline || '-' }}
              </a-descriptions-item>
            </a-descriptions>
          </div>
        </div>
        <!-- Right side -->
        <div style="flex-shrink: 0; display: flex; gap: 8px;">
          <a-button v-if="canEditCandidate" @click="openEditModal">{{ t('candidate.editInfo') }}</a-button>
          <a-button
            v-if="canScreenCandidate"
            type="primary"
            :loading="screeningAction === 'send_oa'"
            @click="handleScreeningDecision('waiting_for_oa')"
          >
            {{ sendOaButtonLabel }}
          </a-button>
          <a-popconfirm
            v-if="canScreenCandidate"
            :title="t('candidate.rejectScreeningConfirm')"
            @confirm="handleScreeningDecision('rejected')"
          >
            <a-button danger :loading="screeningAction === 'reject'">
              {{ t('candidate.rejectScreening') }}
            </a-button>
          </a-popconfirm>
          <a-button v-if="canChangeAnyStatus && !canScreenCandidate" type="primary" @click="openStatusModal">
            {{ t('candidate.changeStatus') }}
          </a-button>
        </div>
      </div>
    </a-card>

    <!-- Tabs -->
    <a-card>
      <a-tabs>
        <!-- Tab 1: Resume -->
        <a-tab-pane key="resume" :tab="t('candidate.tabResume')">
          <div v-if="candidate.resumeMarkdown">
            <div
              v-html="renderMarkdown(candidate.resumeMarkdown)"
              style="background: #fafafa; border: 1px solid #f0f0f0; border-radius: 4px; padding: 20px;"
            />
          </div>
          <a-empty v-else :description="t('candidate.noResumeUploaded')" />
          <div style="margin-top: 16px;">
            <a-button type="link" @click="downloadResume">{{ t('candidate.downloadOriginal') }}</a-button>
          </div>
        </a-tab-pane>

        <!-- Tab 2: OA Answers -->
        <a-tab-pane key="oa" :tab="t('candidate.tabOaAnswers')">
          <a-spin :spinning="loadingOa">
            <div v-if="oaAnswers && oaAnswers.submission">
              <!-- Summary bar -->
              <a-descriptions :bordered="false" size="small" style="margin-bottom: 16px;" :inline="true">
                <a-descriptions-item :label="t('candidate.oaStartTime')">
                  {{ formatDate(oaAnswers.submission.startedAt) }}
                </a-descriptions-item>
                <a-descriptions-item :label="t('candidate.oaSubmitTime')">
                  {{ oaAnswers.submission.submittedAt ? formatDate(oaAnswers.submission.submittedAt) : '-' }}
                </a-descriptions-item>
                <a-descriptions-item :label="t('candidate.oaDuration')">
                  {{ calcDuration(oaAnswers.submission.startedAt, oaAnswers.submission.submittedAt, oaAnswers.timeLimitMinutes) }}
                </a-descriptions-item>
                <a-descriptions-item :label="t('candidate.oaQuestions')">
                  {{ oaAnswers.answers.length }}
                </a-descriptions-item>
              </a-descriptions>

              <!-- Answers -->
              <div v-for="(answer, idx) in oaAnswers.answers" :key="answer.questionId" style="margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                  <a-badge
                    :count="idx + 1"
                    :number-style="{ backgroundColor: '#1890ff' }"
                  />
                  <span style="font-weight: bold;">{{ answer.questionText }}</span>
                  <a-tag>{{ answer.answerType === 'text' ? t('candidate.textType') : t('candidate.codeType') }}</a-tag>
                </div>
                <div
                  v-if="answer.answerType === 'text'"
                  style="background: #fafafa; padding: 14px; border-radius: 4px; white-space: pre-wrap;"
                >{{ answer.answerContent }}</div>
                <pre
                  v-else
                  style="background: #1e1e1e; color: #d4d4d4; padding: 14px; border-radius: 4px; font-family: monospace; overflow-x: auto; margin: 0;"
                >{{ answer.answerContent }}</pre>
              </div>

              <!-- OA review controls are separate from interview evaluation. -->
              <div v-if="canReviewOa" style="border-top: 2px solid #f0f0f0; padding-top: 16px;">
                <div style="font-weight: 600; font-size: 15px; margin-bottom: 12px;">{{ t('candidate.oaReviewTitle') }}</div>
                <a-textarea v-model:value="oaReviewComment" :placeholder="t('candidate.oaReviewComment')" :rows="3" style="margin-bottom: 12px;" />
                <div style="display: flex; gap: 8px;">
                  <a-button type="primary" :loading="reviewingOa === 'pass'" @click="handleOaReview('pass')">{{ t('candidate.oaReviewPass') }}</a-button>
                  <a-button danger :loading="reviewingOa === 'fail'" @click="handleOaReview('fail')">{{ t('candidate.oaReviewFail') }}</a-button>
                </div>
              </div>

              <!-- OA review comments are saved as status-history notes, so surface them beside the submission. -->
              <div v-if="oaReviewEntries.length > 0" style="border-top: 2px solid #f0f0f0; padding-top: 16px; margin-top: 16px;">
                <div style="font-weight: 600; font-size: 15px; margin-bottom: 12px;">{{ t('candidate.oaReviewResult') }}</div>
                <a-timeline>
                  <a-timeline-item v-for="entry in oaReviewEntries" :key="statusHistoryKey(entry)">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                      <a-tag :color="entry.toStatus === 'wait_to_confirm_date' ? 'green' : 'red'">
                        {{ entry.toStatus === 'wait_to_confirm_date' ? t('candidate.oaReviewPassNote') : t('candidate.oaReviewFailNote') }}
                      </a-tag>
                      <span style="color: #888; font-size: 12px;">{{ formatDate(entry.createdAt) }}</span>
                    </div>
                    <div v-if="entry.operatorName" style="color: #666; font-size: 13px; margin-bottom: 2px;">
                      {{ t('candidate.operator') }}: {{ entry.operatorName }}
                    </div>
                    <div style="color: #666; font-size: 13px;">
                      {{ t('candidate.oaReviewCommentLabel') }}: {{ entry.note || '-' }}
                    </div>
                  </a-timeline-item>
                </a-timeline>
              </div>
            </div>
            <a-empty v-else-if="!loadingOa" description="No OA submission" />
          </a-spin>
        </a-tab-pane>

        <!-- Tab 3: Evaluation -->
        <a-tab-pane key="evaluation" :tab="t('candidate.tabEvaluation')">
          <!-- Evaluation form — visible only to interviewers assigned to this candidate's position. -->
          <div v-if="canSubmitInterviewEvaluation" style="margin-bottom: 20px;">
            <div style="font-weight: 600; font-size: 15px; margin-bottom: 12px;">{{ t('candidate.submitEvaluation') }}</div>
            <a-textarea v-model:value="evalComment" :placeholder="t('candidate.evaluationComment')" :rows="3" style="margin-bottom: 12px;" />
            <div style="display: flex; gap: 8px;">
              <a-button :style="{ background: '#52c41a', color: '#fff' }" :loading="submittingEval" @click="handleEval('passed')">{{ t('candidate.pass') }}</a-button>
              <a-button danger :loading="submittingEval" @click="handleEval('failed')">{{ t('candidate.fail') }}</a-button>
            </div>
          </div>
          <a-divider v-if="canSubmitInterviewEvaluation" />

          <a-spin :spinning="loadingEvals">
            <div v-if="evaluations.length > 0">
              <div v-for="ev in evaluations" :key="ev.id" style="margin-bottom: 16px;">
                <a-descriptions :column="2" size="small" :bordered="false">
                  <a-descriptions-item :label="t('candidate.operator')">{{ ev.interviewer?.name ?? '-' }}</a-descriptions-item>
                  <a-descriptions-item label="Result">
                    <a-tag :color="ev.result === 'passed' ? 'green' : 'red'">
                      {{ ev.result === 'passed' ? t('candidate.pass') : t('candidate.fail') }}
                    </a-tag>
                  </a-descriptions-item>
                  <a-descriptions-item label="Comment" :span="2">{{ ev.comment || '-' }}</a-descriptions-item>
                  <a-descriptions-item label="Time">{{ formatDate(ev.createdAt) }}</a-descriptions-item>
                </a-descriptions>
                <a-divider />
              </div>
            </div>
            <a-empty v-else-if="!loadingEvals" description="No evaluation yet" />
          </a-spin>
        </a-tab-pane>

        <!-- Tab 4: Status History -->
        <a-tab-pane key="history" :tab="t('candidate.tabHistory')">
          <a-spin :spinning="loadingHistory">
            <div v-if="statusHistory.length > 0">
              <a-timeline>
                <a-timeline-item v-for="entry in statusHistory" :key="statusHistoryKey(entry)">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <StatusTag :status="entry.toStatus" />
                    <span style="color: #888; font-size: 12px;">{{ formatDate(entry.createdAt) }}</span>
                  </div>
                  <div style="color: #666; font-size: 13px; margin-bottom: 2px;">
                    {{ formatStatusTransition(entry) }}
                  </div>
                  <div v-if="entry.operatorName" style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                    <span>{{ entry.operatorName }}</span>
                  </div>
                  <div v-if="entry.note" style="color: #888; font-size: 13px;">{{ entry.note }}</div>
                </a-timeline-item>
              </a-timeline>
            </div>
            <a-empty v-else-if="!loadingHistory" description="No history yet" />
          </a-spin>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <!-- Change Status Modal -->
    <a-modal
      v-model:open="statusModalVisible"
      :title="t('candidate.changeStatus')"
      @ok="handleChangeStatus"
      :confirm-loading="changingStatus"
      @cancel="statusModalVisible = false"
    >
      <a-form layout="vertical">
        <a-form-item label="New Status">
          <a-cascader
            v-model:value="statusPath"
            :options="statusCascaderOptions"
            :placeholder="t('candidate.statusCascaderPlaceholder')"
            :allow-clear="false"
            expand-trigger="hover"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="Note">
          <a-textarea v-model:value="statusNote" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Edit Candidate Modal -->
    <a-modal
      v-model:open="editModalVisible"
      :title="t('candidate.editInfo')"
      @ok="handleEditCandidate"
      :confirm-loading="savingEdit"
      @cancel="editModalVisible = false"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('candidate.name')">
          <a-input v-model:value="editForm.name" />
        </a-form-item>
        <a-form-item :label="t('candidate.gender')">
          <a-select v-model:value="editForm.gender" allow-clear>
            <a-select-option value="male">{{ t('candidate.male') }}</a-select-option>
            <a-select-option value="female">{{ t('candidate.female') }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="t('candidate.email')">
          <a-input v-model:value="editForm.email" />
        </a-form-item>
        <a-form-item :label="t('candidate.phone')">
          <a-input v-model:value="editForm.phone" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
  <div v-else-if="loading" style="text-align: center; padding: 60px;">
    <a-spin size="large" />
  </div>
  <a-empty v-else description="Candidate not found" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import * as candidatesApi from '../../api/candidates'
import type { Candidate, CandidateStatus, StatusHistoryEntry, Evaluation, OaAnswersResult } from '../../api/candidates'
import * as positionsApi from '../../api/positions'
import StatusTag from '../../components/StatusTag.vue'
import { extractError } from '../../api/client'
import { STATUS_GROUPS, getGroupForStatus, type StatusGroup } from '../../utils/candidateStatus'
import { useAuthStore } from '../../stores/auth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const candidateId = Number(route.params.id)

function goBackToCandidateList() {
  // Always return to the canonical internal candidate list, even when the detail page was opened directly.
  router.push('/admin/candidates')
}

const candidate = ref<Candidate | null>(null)
const loading = ref(true)
const positionNameStr = ref('')
const positionName = computed(() => positionNameStr.value)
const displayCandidateName = computed(() => candidate.value?.name || '-')
const canEditCandidate = computed(() => auth.hasRole('coordinator') || auth.hasRole('screener'))
const canChangeAnyStatus = computed(() => auth.hasRole('coordinator'))
const canScreenCandidate = computed(() =>
  candidate.value?.status === 'new' && (auth.hasRole('coordinator') || auth.hasRole('screener')),
)
const canReviewOa = computed(() =>
  candidate.value?.status === 'oa_completed' && auth.hasRole('coordinator'),
)
const canSubmitInterviewEvaluation = computed(() =>
  Boolean(candidate.value?.viewerCanEvaluate) &&
  (candidate.value?.status === 'date_confirmed' || candidate.value?.status === 'human_completed'),
)
// OA review is represented by the coordinator-owned transition out of oa_completed.
const oaReviewEntries = computed(() =>
  statusHistory.value.filter(entry =>
    entry.fromStatus === 'oa_completed' &&
    (entry.toStatus === 'wait_to_confirm_date' || entry.toStatus === 'oa_failed'),
  ),
)
const sendOaButtonLabel = computed(() =>
  auth.hasRole('screener') && !auth.hasRole('coordinator')
    ? t('candidate.screeningPassAndSendOa')
    : t('candidate.sendOa'),
)

const oaAnswers = ref<OaAnswersResult | null>(null)
const loadingOa = ref(false)
const evaluations = ref<Evaluation[]>([])
const loadingEvals = ref(false)
const statusHistory = ref<StatusHistoryEntry[]>([])
const loadingHistory = ref(false)

const evalComment = ref('')
const submittingEval = ref(false)
const oaReviewComment = ref('')
const reviewingOa = ref<'pass' | 'fail' | null>(null)

const statusModalVisible = ref(false)
// Two-level path [group, subStatus] driven by a-cascader. An empty array means
// "nothing selected yet"; a single-element array means the user has picked a
// group but not yet a sub-status — confirming in that state is rejected.
const statusPath = ref<[StatusGroup, CandidateStatus] | [StatusGroup] | []>([])
const statusNote = ref('')
const changingStatus = ref(false)
const screeningAction = ref<'send_oa' | 'reject' | null>(null)

const editModalVisible = ref(false)
const savingEdit = ref(false)
const editForm = ref<{
  name: string
  gender: 'male' | 'female' | undefined
  email: string
  phone: string
}>({
  name: '',
  gender: undefined,
  email: '',
  phone: '',
})

// Cascader options derived once from the shared STATUS_GROUPS mapping. Labels
// are resolved against i18n at render time so locale switches take effect
// without re-deriving this structure.
const statusCascaderOptions = computed(() =>
  STATUS_GROUPS.map(def => ({
    value: def.group,
    label: t(`status.group.${def.group}`),
    children: def.members.map(sub => ({
      value: sub,
      label: t(`status.${sub}`),
    })),
  })),
)

async function loadCandidate() {
  loading.value = true
  try {
    candidate.value = await candidatesApi.getCandidate(candidateId)
    if (candidate.value) {
      const pos = await positionsApi.getPosition(candidate.value.positionId).catch(() => null)
      positionNameStr.value = pos?.name ?? '-'
    }
  } finally {
    loading.value = false
  }
}

async function loadOaAnswers() {
  loadingOa.value = true
  try {
    oaAnswers.value = await candidatesApi.getOaAnswers(candidateId)
  } catch {
    oaAnswers.value = null
  } finally {
    loadingOa.value = false
  }
}

async function loadEvaluations() {
  loadingEvals.value = true
  try {
    evaluations.value = await candidatesApi.listEvaluations(candidateId)
  } finally {
    loadingEvals.value = false
  }
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    statusHistory.value = await candidatesApi.getStatusHistory(candidateId)
  } finally {
    loadingHistory.value = false
  }
}

async function handleEval(result: 'passed' | 'failed') {
  if (submittingEval.value) return
  submittingEval.value = true
  try {
    await candidatesApi.submitEvaluation(candidateId, { result, comment: evalComment.value })
    message.success(t('candidate.evaluationSuccess'))
    evalComment.value = ''
    await Promise.all([loadCandidate(), loadEvaluations(), loadHistory()])
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    submittingEval.value = false
  }
}

async function handleOaReview(result: 'pass' | 'fail') {
  if (reviewingOa.value !== null) return
  reviewingOa.value = result
  try {
    const toStatus: CandidateStatus = result === 'pass' ? 'wait_to_confirm_date' : 'oa_failed'
    const fallbackNote = result === 'pass'
      ? t('candidate.oaReviewPassNote')
      : t('candidate.oaReviewFailNote')
    candidate.value = await candidatesApi.changeStatus(
      candidateId,
      toStatus,
      oaReviewComment.value.trim() || fallbackNote,
    )
    message.success(result === 'pass' ? t('candidate.oaReviewPassSuccess') : t('candidate.oaReviewFailSuccess'))
    oaReviewComment.value = ''
    await loadHistory()
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    reviewingOa.value = null
  }
}

function openStatusModal() {
  if (candidate.value) {
    const sub = candidate.value.status
    statusPath.value = [getGroupForStatus(sub), sub]
  } else {
    statusPath.value = []
  }
  statusNote.value = ''
  statusModalVisible.value = true
}

async function handleChangeStatus() {
  // Require both cascader levels to have values — guards against submitting
  // when only the group tier is picked.
  if (statusPath.value.length !== 2) {
    message.warning(t('candidate.statusCascaderIncomplete'))
    return
  }
  const chosenSub = statusPath.value[1] as CandidateStatus
  changingStatus.value = true
  try {
    candidate.value = await candidatesApi.changeStatus(candidateId, chosenSub, statusNote.value || undefined)
    statusModalVisible.value = false
    await loadHistory()
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    changingStatus.value = false
  }
}

async function handleScreeningDecision(toStatus: 'waiting_for_oa' | 'rejected') {
  if (screeningAction.value !== null) return
  screeningAction.value = toStatus === 'waiting_for_oa' ? 'send_oa' : 'reject'
  try {
    // Screening pass is represented by the existing new -> waiting_for_oa transition,
    // which also sets the OA deadline and writes notification logs on the backend.
    candidate.value = await candidatesApi.changeStatus(candidateId, toStatus)
    message.success(
      toStatus === 'waiting_for_oa'
        ? t('candidate.sendOaSuccess')
        : t('candidate.rejectScreeningSuccess'),
    )
    await loadHistory()
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    screeningAction.value = null
  }
}

function openEditModal() {
  if (!candidate.value) return
  // Copy current values so cancelling the modal does not mutate the detail card.
  editForm.value = {
    name: candidate.value.name ?? '',
    gender: candidate.value.gender ?? undefined,
    email: candidate.value.email ?? '',
    phone: candidate.value.phone ?? '',
  }
  editModalVisible.value = true
}

async function handleEditCandidate() {
  if (!candidate.value) return
  savingEdit.value = true
  try {
    // The backend PATCH schema treats absent fields as "unchanged", so blank
    // optional inputs are omitted instead of submitted as invalid empty strings.
    candidate.value = await candidatesApi.updateCandidate(candidateId, {
      name: trimOptional(editForm.value.name),
      gender: editForm.value.gender,
      email: trimOptional(editForm.value.email),
      phone: trimOptional(editForm.value.phone),
    })
    editModalVisible.value = false
    message.success(t('candidate.editSuccess'))
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    savingEdit.value = false
  }
}

function trimOptional(value: string): string | undefined {
  // Keep optional fields out of the request when the user leaves them blank.
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

async function downloadResume() {
  try {
    const url = await candidatesApi.getResumeFileUrl(candidateId)
    const a = document.createElement('a')
    a.href = url
    a.download = 'resume'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    message.error(extractError(e).message)
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function statusHistoryKey(entry: StatusHistoryEntry): string {
  // The history endpoint has no row id, so combine immutable fields for Vue keys.
  return `${entry.createdAt}-${entry.fromStatus ?? 'initial'}-${entry.toStatus}-${entry.operatorId ?? 'system'}`
}

function formatStatusTransition(entry: StatusHistoryEntry): string {
  // The API returns a flattened transition row instead of the old nested operator shape.
  return `${entry.fromStatus ?? '-'} -> ${entry.toStatus}`
}

function calcDuration(startedAt: string, submittedAt: string | null, totalMinutes: number | null): string {
  // Show the configured limit even when the submission has not been completed yet.
  const total = totalMinutes === null ? '-' : totalMinutes
  if (!submittedAt) return `- / ${total} min`
  const diff = Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 60000)
  const spent = diff <= 0 ? '<1' : String(diff)
  return `${spent} / ${total} min`
}

function renderMarkdown(md: string): string {
  let html = md
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  html = html.replace(/^---$/gm, '<hr>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/((?:^- .+\n?)+)/gm, (match) => {
    const items = match.trim().split('\n').map(line => `<li>${line.replace(/^- /, '')}</li>`).join('')
    return `<ul>${items}</ul>`
  })
  html = html.replace(/\n\n/g, '</p><p>')
  html = `<p>${html}</p>`
  html = html.replace(/<p>\s*(<h[34]>|<hr>|<ul>)/g, '$1')
  html = html.replace(/(<\/h[34]>|<\/ul>|<hr>)\s*<\/p>/g, '$1')
  html = html.replace(/<p><\/p>/g, '')
  return html
}

onMounted(async () => {
  await Promise.all([loadCandidate(), loadOaAnswers(), loadEvaluations(), loadHistory()])
})
</script>
