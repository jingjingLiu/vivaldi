<template>
  <div>
    <!-- Filter bar -->
    <div style="display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap;">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <a-input-search
          v-model:value="searchText"
          :placeholder="t('candidate.searchPlaceholder')"
          style="width: 220px"
          @search="onFilter"
        />
        <a-cascader
          v-model:value="statusFilterPath"
          :options="statusCascaderOptions"
          :placeholder="t('candidate.allStatus')"
          allow-clear
          change-on-select
          expand-trigger="hover"
          style="width: 220px"
          @change="onFilter"
        />
        <a-select
          v-model:value="positionFilter"
          :placeholder="t('candidate.allPositions')"
          allow-clear
          style="width: 150px"
          @change="onFilter"
        >
          <a-select-option v-for="pos in positionOptions" :key="pos.id" :value="pos.id">
            {{ pos.name }}
          </a-select-option>
        </a-select>
        <a-button type="primary" @click="onFilter">{{ t('common.search') }}</a-button>
        <a-button @click="onReset">{{ t('common.reset') }}</a-button>
      </div>
      <a-button v-if="canUploadResume" type="primary" @click="openUploadModal">
        {{ t('candidate.uploadResume') }}
      </a-button>
    </div>

    <!-- Status quick filter tabs -->
    <div style="margin-bottom: 16px;">
      <a-radio-group v-model:value="activeTab" button-style="solid" size="small" @change="onFilter">
        <a-radio-button value="all">{{ t('statusGroup.all') }}</a-radio-button>
        <a-radio-button value="new">{{ t('statusGroup.new') }}</a-radio-button>
        <a-radio-button value="oa">{{ t('statusGroup.oa') }}</a-radio-button>
        <a-radio-button value="human">{{ t('statusGroup.human') }}</a-radio-button>
        <a-radio-button value="passed">{{ t('statusGroup.passed') }}</a-radio-button>
        <a-radio-button value="failed">{{ t('statusGroup.failed') }}</a-radio-button>
      </a-radio-group>
    </div>

    <!-- Table -->
    <a-table
      :data-source="candidates"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :custom-row="customRow"
      :pagination="{
        current: page,
        pageSize: pageSize,
        total: total,
        showTotal: (tot: number) => t('common.total', { count: tot }),
        onChange: onPageChange,
      }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <strong>{{ record.name }}</strong>
        </template>

        <template v-else-if="column.key === 'position'">
          {{ positionName(record.positionId) }}
        </template>

        <template v-else-if="column.key === 'status'">
          <StatusTag :status="record.status" />
        </template>

        <template v-else-if="column.key === 'phone'">
          {{ record.phoneMasked || maskPhone(record.phone) }}
        </template>

        <template v-else-if="column.key === 'updatedAt'">
          {{ formatDate(record.updatedAt) }}
        </template>

        <template v-else-if="column.key === 'actions'">
          <a-space @click.stop>
            <router-link :to="`/admin/candidates/${record.id}`">
              {{ t('common.detail') }}
            </router-link>
            <a-popconfirm
              v-if="canDeleteCandidate"
              :title="t('candidate.deleteConfirm')"
              @confirm="handleDeleteCandidate(record.id)"
            >
              <a-button type="link" danger size="small" :loading="deletingCandidateId === record.id">
                {{ t('common.delete') }}
              </a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- Resume Upload Modal -->
    <a-modal
      v-model:open="uploadModalVisible"
      :title="t('candidate.uploadResume')"
      :confirm-loading="uploadingResume"
      @ok="handleUploadResume"
      @cancel="closeUploadModal"
    >
      <a-alert
        type="info"
        :message="t('candidate.uploadResumeHint')"
        show-icon
        style="margin-bottom: 16px;"
      />
      <a-form layout="vertical">
        <a-form-item :label="t('candidate.position')" required>
          <a-select v-model:value="uploadForm.positionId" :placeholder="t('candidate.allPositions')">
            <a-select-option v-for="pos in positionOptions" :key="pos.id" :value="pos.id">
              {{ pos.name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="t('candidate.resumeFile')" required>
          <a-upload
            :accept="resumeAccept"
            :before-upload="beforeResumeUpload"
            :file-list="uploadFileList"
            :max-count="1"
            @remove="handleRemoveResumeFile"
          >
            <a-button>{{ t('candidate.chooseResumeFile') }}</a-button>
          </a-upload>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import * as candidatesApi from '../../api/candidates'
import type { Candidate, CandidateStatus } from '../../api/candidates'
import * as positionsApi from '../../api/positions'
import type { PositionListItem } from '../../api/positions'
import StatusTag from '../../components/StatusTag.vue'
import { STATUS_GROUPS, type StatusGroup } from '../../utils/candidateStatus'
import { useAuthStore } from '../../stores/auth'
import { extractError } from '../../api/client'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

// Local Record view of STATUS_GROUPS, kept for the Tab click-through that
// filters candidates client-side (see `fetchCandidates`). This stays in sync
// with `STATUS_GROUPS` because it's derived from it at module load.
const statusGroupMap: Record<string, CandidateStatus[]> = Object.fromEntries(
  STATUS_GROUPS.map(def => [def.group, def.members]),
)

const candidates = ref<Candidate[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

const positionOptions = ref<PositionListItem[]>([])
const uploadModalVisible = ref(false)
const uploadingResume = ref(false)
const uploadForm = ref<{ positionId?: number; file?: File }>({})
const uploadFileList = ref<UploadProps['fileList']>([])
const canUploadResume = computed(() => auth.hasRole('coordinator') || auth.hasRole('screener'))
// Deleting a candidate changes persisted workflow data, so it follows the edit/upload roles.
const canDeleteCandidate = computed(() => auth.hasRole('coordinator') || auth.hasRole('screener'))
const deletingCandidateId = ref<number | null>(null)

// Keep client-side file filtering aligned with the backend upload MIME whitelist.
const resumeAccept = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
const allowedResumeMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])
const allowedResumeExtensions = ['.pdf', '.docx', '.txt']
const uploadErrorI18nKeys: Record<string, string> = {
  INVALID_FILE_TYPE: 'candidate.resumeUnsupportedFileType',
  UNSUPPORTED_RESUME_FORMAT: 'candidate.resumeUnsupportedFileType',
  RESUME_TEXT_EMPTY: 'candidate.resumeTextEmpty',
  RESUME_PARSE_FAILED: 'candidate.resumeParseFailed',
}

const searchText = ref('')
// Two-level path from the cascader. Empty = no status filter. Single-element
// (group only) = filter by every sub-status in that group. Two-element =
// exact sub-status filter (legacy behaviour, equivalent to the old flat
// dropdown).
const statusFilterPath = ref<[StatusGroup, CandidateStatus] | [StatusGroup] | []>([])
const positionFilter = ref<number | undefined>(undefined)
const activeTab = ref('all')

// Derived: exact sub-status to send to the backend, only when the cascader
// has a leaf selected. When only the group is selected we keep
// `effectiveStatusFilter === undefined` and lean on the client-side group
// filter (see `fetchCandidates`) — identical mechanism the tabs use.
const effectiveStatusFilter = computed<CandidateStatus | undefined>(() =>
  statusFilterPath.value.length === 2
    ? (statusFilterPath.value[1] as CandidateStatus)
    : undefined,
)
const effectiveStatusGroup = computed<StatusGroup | undefined>(() =>
  statusFilterPath.value.length >= 1
    ? (statusFilterPath.value[0] as StatusGroup)
    : undefined,
)

// Cascader options derived from STATUS_GROUPS; i18n resolved at render time
// through vue-i18n's reactive `t`.
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

const columns = [
  { title: t('candidate.name'), key: 'name' },
  { title: t('candidate.position'), key: 'position' },
  { title: t('candidate.status'), key: 'status' },
  { title: t('candidate.email'), dataIndex: 'email', key: 'email' },
  { title: t('candidate.phone'), key: 'phone' },
  { title: t('candidate.updatedAt'), key: 'updatedAt' },
  { title: t('candidate.actions'), key: 'actions' },
]

async function fetchCandidates() {
  loading.value = true
  try {
    // Priority rules per PRD §3.1.2 "状态下拉优先":
    //   1. If the cascader has a leaf (exact sub-status), send it as the
    //      backend `status` parameter — this matches the legacy flat-dropdown
    //      behaviour and takes precedence over the Tab row.
    //   2. If the cascader has only the group tier selected, treat it
    //      equivalently to picking that group in the Tab row: filter
    //      client-side by the group's member sub-statuses.
    //   3. Otherwise fall back to the Tab row.
    const statusParam: CandidateStatus | undefined = effectiveStatusFilter.value

    const result = await candidatesApi.listCandidates({
      q: searchText.value || undefined,
      status: statusParam,
      positionId: positionFilter.value,
      page: page.value,
      pageSize: pageSize.value,
    })

    let items = result.items
    // Client-side group filter. The cascader group selection overrides the
    // Tab — same "dropdown wins" rule, just applied to the group tier when
    // the user has not drilled down to a sub-status yet.
    if (!statusParam) {
      const groupForClientFilter =
        effectiveStatusGroup.value ?? (activeTab.value !== 'all' ? (activeTab.value as StatusGroup) : undefined)
      if (groupForClientFilter) {
        const allowed = statusGroupMap[groupForClientFilter]
        if (allowed) items = items.filter(c => allowed.includes(c.status))
      }
    }

    candidates.value = items
    total.value = result.total
  } finally {
    loading.value = false
  }
}

async function fetchPositions() {
  const result = await positionsApi.listPositions({ pageSize: 100 })
  positionOptions.value = result.items
}

function positionName(id: number): string {
  return positionOptions.value.find(p => p.id === id)?.name ?? String(id)
}

function onFilter() {
  page.value = 1
  fetchCandidates()
}

function onReset() {
  searchText.value = ''
  statusFilterPath.value = []
  positionFilter.value = undefined
  activeTab.value = 'all'
  page.value = 1
  fetchCandidates()
}

function onPageChange(p: number, ps: number) {
  page.value = p
  pageSize.value = ps
  fetchCandidates()
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '-'
  if (phone.length <= 4) return phone
  return '****' + phone.slice(-4)
}

function openUploadModal() {
  uploadForm.value = { positionId: positionFilter.value }
  uploadFileList.value = []
  uploadModalVisible.value = true
}

function closeUploadModal() {
  uploadModalVisible.value = false
  uploadForm.value = {}
  uploadFileList.value = []
}

function beforeResumeUpload(file: File) {
  if (!isAllowedResumeFile(file)) {
    message.error(t('candidate.resumeUnsupportedFileType'))
    uploadForm.value.file = undefined
    uploadFileList.value = []
    return false
  }
  // Keep upload manual so the selected position and file are submitted together.
  uploadForm.value.file = file
  uploadFileList.value = [file as unknown as NonNullable<UploadProps['fileList']>[number]]
  return false
}

function handleRemoveResumeFile() {
  uploadForm.value.file = undefined
  uploadFileList.value = []
  return true
}

async function handleUploadResume() {
  if (!uploadForm.value.positionId) {
    message.error(t('candidate.positionRequired'))
    return
  }
  if (!uploadForm.value.file) {
    message.error(t('candidate.resumeFileRequired'))
    return
  }

  uploadingResume.value = true
  try {
    const candidate = await candidatesApi.uploadResume(uploadForm.value.file, uploadForm.value.positionId)
    message.success(t('candidate.uploadResumeSuccess', { code: candidate.oneTimeCode ?? '-' }))
    closeUploadModal()
    await fetchCandidates()
  } catch (e) {
    message.error(formatUploadError(e))
  } finally {
    uploadingResume.value = false
  }
}

async function handleDeleteCandidate(id: number) {
  deletingCandidateId.value = id
  try {
    await candidatesApi.deleteCandidate(id)
    message.success(t('candidate.deleteSuccess'))
    // If the current page becomes empty after deletion, move back to the previous page.
    if (candidates.value.length === 1 && page.value > 1) {
      page.value -= 1
    }
    await fetchCandidates()
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    deletingCandidateId.value = null
  }
}

function isAllowedResumeFile(file: File): boolean {
  const hasAllowedMime = file.type ? allowedResumeMimeTypes.has(file.type) : false
  const lowerName = file.name.toLowerCase()
  const hasAllowedExtension = allowedResumeExtensions.some(ext => lowerName.endsWith(ext))
  return hasAllowedMime || hasAllowedExtension
}

function formatUploadError(error: unknown): string {
  const extracted = extractError(error)
  const i18nKey = uploadErrorI18nKeys[extracted.code]
  return i18nKey ? t(i18nKey) : extracted.message
}

function formatDate(dateStr: string): string {
  return dateStr.slice(0, 10)
}

function customRow(record: { id: number }) {
  return {
    onClick() {
      router.push(`/admin/candidates/${record.id}`)
    },
    style: { cursor: 'pointer' },
  }
}

onMounted(async () => {
  await Promise.all([fetchCandidates(), fetchPositions()])
})
</script>
