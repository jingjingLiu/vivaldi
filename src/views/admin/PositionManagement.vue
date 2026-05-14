<template>
  <div>
    <!-- Top bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <a-input-search
        v-model:value="searchText"
        :placeholder="t('position.searchPlaceholder')"
        style="width: 200px"
        @search="onSearch"
      />
      <a-button type="primary" @click="openAddModal">{{ t('position.addPosition') }}</a-button>
    </div>

    <!-- Table -->
    <a-table
      :data-source="positions"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{
        current: page,
        pageSize: pageSize,
        total: total,
        showTotal: (tot: number) => t('common.total', { count: tot }),
        onChange: onPageChange,
      }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'interviewers'">
          <span v-if="record.interviewerCount > 0" style="color: #1677ff;">
            {{ t('position.interviewerCountSummary', { count: record.interviewerCount }) }}
          </span>
          <span v-else style="color: #faad14;">{{ t('common.unassigned') }}</span>
        </template>

        <template v-else-if="column.key === 'oaForm'">
          <span v-if="record.hasOaForm" style="color: #52c41a;">{{ t('common.configured') }}</span>
          <span v-else style="color: #faad14;">{{ t('common.notConfigured') }}</span>
        </template>

        <template v-else-if="column.key === 'actions'">
          <a-button
            type="link"
            :loading="editLoadingId === record.id"
            :disabled="editLoadingId !== null && editLoadingId !== record.id"
            @click="openEditModal(record)"
          >
            {{ t('common.edit') }}
          </a-button>
          <a-button
            type="link"
            :loading="oaFormLoadingId === record.id"
            :disabled="oaFormLoadingId !== null && oaFormLoadingId !== record.id"
            @click="openOaFormModal(record)"
          >
            {{ record.hasOaForm ? t('oaFormConfig.edit') : t('oaFormConfig.configure') }}
          </a-button>
          <a-popconfirm :title="t('common.confirm') + '?'" @confirm="handleDelete(record)">
            <a-button type="link" danger>{{ t('common.delete') }}</a-button>
          </a-popconfirm>
        </template>
      </template>
    </a-table>

    <!-- Add/Edit Modal -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEditing ? t('position.editPosition') : t('position.addPosition')"
      @cancel="closeModal"
      :footer="null"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :label-col="{ span: 6 }"
        :wrapper-col="{ span: 18 }"
      >
        <a-form-item
          :label="t('position.positionName')"
          name="name"
          :rules="[{ required: true, message: t('common.required') }]"
        >
          <a-input v-model:value="formData.name" />
        </a-form-item>

        <a-form-item :label="t('position.interviewers')" name="interviewerIds">
          <a-select
            v-model:value="formData.interviewerIds"
            mode="multiple"
            :options="interviewerOptions"
            style="width: 100%"
          />
          <div style="color: #8c8c8c; font-size: 12px; margin-top: 4px;">
            {{ t('position.interviewerHint') }}
          </div>
        </a-form-item>

        <a-form-item :wrapper-col="{ offset: 6, span: 18 }">
          <a-space>
            <a-button @click="closeModal">{{ t('common.cancel') }}</a-button>
            <a-button type="primary" :loading="saving" @click="handleConfirm">{{ t('common.confirm') }}</a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- OA Form Modal -->
    <a-modal
      v-model:open="oaFormModalVisible"
      :title="oaFormModalTitle"
      :confirm-loading="savingOaForm"
      width="820px"
      @ok="handleSaveOaForm"
      @cancel="closeOaFormModal"
    >
      <a-form ref="oaFormRef" :model="oaFormData" layout="vertical">
        <a-form-item
          :label="t('oaFormConfig.timeLimitMinutes')"
          name="timeLimitMinutes"
          :rules="[
            { required: true, message: t('common.required') },
            { type: 'number', min: 1, max: 360, message: t('oaFormConfig.timeLimitRange') },
          ]"
        >
          <a-input-number
            v-model:value="oaFormData.timeLimitMinutes"
            :min="1"
            :max="360"
            style="width: 180px"
          />
        </a-form-item>

        <a-form-item :label="t('oaFormConfig.instructionZh')" name="instructionZh">
          <a-textarea v-model:value="oaFormData.instructionZh" :rows="3" />
        </a-form-item>

        <a-form-item :label="t('oaFormConfig.instructionEn')" name="instructionEn">
          <a-textarea v-model:value="oaFormData.instructionEn" :rows="3" />
        </a-form-item>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <strong>{{ t('oaFormConfig.questions') }}</strong>
          <a-button type="dashed" @click="addOaQuestion">{{ t('oaFormConfig.addQuestion') }}</a-button>
        </div>

        <a-card
          v-for="(question, index) in oaFormData.questions"
          :key="question.localId"
          size="small"
          style="margin-bottom: 12px;"
        >
          <template #title>
            {{ t('oaFormConfig.questionTitle', { index: index + 1 }) }}
          </template>
          <template #extra>
            <a-button
              type="link"
              danger
              :disabled="oaFormData.questions.length <= 1"
              @click="removeOaQuestion(index)"
            >
              {{ t('common.delete') }}
            </a-button>
          </template>

          <a-form-item
            :label="t('oaFormConfig.questionText')"
            :name="['questions', index, 'questionText']"
            :rules="[{ required: true, message: t('common.required') }]"
          >
            <a-textarea v-model:value="question.questionText" :rows="3" />
          </a-form-item>

          <a-form-item
            :label="t('oaFormConfig.answerType')"
            :name="['questions', index, 'answerType']"
            :rules="[{ required: true, message: t('common.required') }]"
          >
            <a-select v-model:value="question.answerType" style="width: 180px;">
              <a-select-option value="text">{{ t('candidate.textType') }}</a-select-option>
              <a-select-option value="code">{{ t('candidate.codeType') }}</a-select-option>
            </a-select>
          </a-form-item>
        </a-card>

        <a-alert
          v-if="oaFormData.questions.length >= 50"
          type="warning"
          :message="t('oaFormConfig.maxQuestionsHint')"
          show-icon
        />
      </a-form>

      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <a-popconfirm
            v-if="configuringPosition?.hasOaForm"
            :title="t('oaFormConfig.deleteConfirm')"
            @confirm="handleDeleteOaForm"
          >
            <a-button danger :loading="deletingOaForm">{{ t('oaFormConfig.delete') }}</a-button>
          </a-popconfirm>
          <span v-else />
          <a-space>
            <a-button @click="closeOaFormModal">{{ t('common.cancel') }}</a-button>
            <a-button type="primary" :loading="savingOaForm" @click="handleSaveOaForm">
              {{ t('common.save') }}
            </a-button>
          </a-space>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import type { FormInstance } from 'ant-design-vue'
import * as positionsApi from '../../api/positions'
import type { PositionListItem } from '../../api/positions'
import * as oaFormApi from '../../api/oaForm'
import * as usersApi from '../../api/users'
import type { User } from '../../api/users'
import { extractError } from '../../api/client'

const { t } = useI18n()

const positions = ref<PositionListItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const saving = ref(false)
const editLoadingId = ref<number | null>(null)
const oaFormLoadingId = ref<number | null>(null)

const searchText = ref('')

// Interviewers for the multiselect
const interviewerUsers = ref<User[]>([])
const interviewerOptions = ref<{ label: string; value: number }[]>([])

const columns = [
  { title: t('position.positionName'), dataIndex: 'name', key: 'positionName' },
  { title: t('position.interviewers'), key: 'interviewers' },
  { title: t('position.oaForm'), key: 'oaForm' },
  { title: t('position.candidateCount'), dataIndex: 'candidateCount', key: 'candidateCount', align: 'center' as const },
  { title: t('position.actions'), key: 'actions' },
]

async function fetchPositions() {
  loading.value = true
  try {
    const result = await positionsApi.listPositions({
      q: searchText.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    positions.value = result.items
    total.value = result.total
  } finally {
    loading.value = false
  }
}

async function fetchInterviewers() {
  const result = await usersApi.listUsers({ role: 'interviewer', pageSize: 100 })
  interviewerUsers.value = result.items
  interviewerOptions.value = result.items.map(u => ({ label: u.name, value: u.id }))
}

function onSearch() {
  page.value = 1
  fetchPositions()
}

function onPageChange(p: number, ps: number) {
  page.value = p
  pageSize.value = ps
  fetchPositions()
}

async function handleDelete(record: PositionListItem) {
  try {
    await positionsApi.deletePosition(record.id)
    await fetchPositions()
  } catch (e) {
    message.error(extractError(e).message)
  }
}

// Modal state
const modalVisible = ref(false)
const isEditing = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInstance>()

interface FormData {
  name: string
  interviewerIds: number[]
}

const defaultForm = (): FormData => ({ name: '', interviewerIds: [] })
const formData = ref<FormData>(defaultForm())

function openAddModal() {
  isEditing.value = false
  editingId.value = null
  formData.value = defaultForm()
  modalVisible.value = true
}

async function openEditModal(record: PositionListItem) {
  editLoadingId.value = record.id
  try {
    const detail = await positionsApi.getPosition(record.id)
    isEditing.value = true
    editingId.value = detail.id
    formData.value = {
      name: detail.name,
      interviewerIds: detail.interviewers.map(i => i.id),
    }
    modalVisible.value = true
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    editLoadingId.value = null
  }
}

function closeModal() {
  modalVisible.value = false
  formRef.value?.resetFields()
}

async function handleConfirm() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    if (isEditing.value && editingId.value !== null) {
      await positionsApi.updatePosition(editingId.value, {
        name: formData.value.name,
        interviewerIds: formData.value.interviewerIds,
      })
    } else {
      await positionsApi.createPosition({
        name: formData.value.name,
        interviewerIds: formData.value.interviewerIds,
      })
    }
    await fetchPositions()
    closeModal()
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    saving.value = false
  }
}

// OA form modal state is kept separate from the position add/edit modal.
type OaAnswerType = 'text' | 'code'

interface OaQuestionForm {
  localId: string
  questionText: string
  answerType: OaAnswerType
}

interface OaFormData {
  timeLimitMinutes: number
  instructionZh: string
  instructionEn: string
  questions: OaQuestionForm[]
}

const oaFormModalVisible = ref(false)
const oaFormRef = ref<FormInstance>()
const configuringPosition = ref<PositionListItem | null>(null)
const savingOaForm = ref(false)
const deletingOaForm = ref(false)
const oaFormData = ref<OaFormData>(defaultOaForm())

const oaFormModalTitle = computed(() => {
  const name = configuringPosition.value?.name ?? ''
  return t('oaFormConfig.modalTitle', { name })
})

function defaultOaQuestion(): OaQuestionForm {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    questionText: '',
    answerType: 'text',
  }
}

function defaultOaForm(): OaFormData {
  return {
    timeLimitMinutes: 60,
    instructionZh: '',
    instructionEn: '',
    questions: [defaultOaQuestion()],
  }
}

async function openOaFormModal(record: PositionListItem) {
  oaFormLoadingId.value = record.id
  try {
    const form = await oaFormApi.getOaFormByPosition(record.id)
    configuringPosition.value = record
    oaFormData.value = form
      ? {
          timeLimitMinutes: form.timeLimitMinutes,
          instructionZh: form.instructionZh ?? '',
          instructionEn: form.instructionEn ?? '',
          questions: form.questions
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(question => ({
              localId: String(question.id),
              questionText: question.questionText,
              answerType: question.answerType,
            })),
        }
      : defaultOaForm()
    oaFormModalVisible.value = true
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    oaFormLoadingId.value = null
  }
}

function closeOaFormModal() {
  oaFormModalVisible.value = false
  configuringPosition.value = null
  oaFormData.value = defaultOaForm()
  oaFormRef.value?.resetFields()
}

function addOaQuestion() {
  if (oaFormData.value.questions.length >= 50) {
    message.warning(t('oaFormConfig.maxQuestionsHint'))
    return
  }
  oaFormData.value.questions.push(defaultOaQuestion())
}

function removeOaQuestion(index: number) {
  if (oaFormData.value.questions.length <= 1) {
    return
  }
  oaFormData.value.questions.splice(index, 1)
}

async function handleSaveOaForm() {
  if (!configuringPosition.value) {
    return
  }
  try {
    await oaFormRef.value?.validate()
  } catch {
    return
  }

  savingOaForm.value = true
  try {
    await oaFormApi.upsertOaForm(configuringPosition.value.id, {
      timeLimitMinutes: oaFormData.value.timeLimitMinutes,
      instructionZh: optionalText(oaFormData.value.instructionZh),
      instructionEn: optionalText(oaFormData.value.instructionEn),
      questions: oaFormData.value.questions.map((question, index) => ({
        questionText: question.questionText.trim(),
        answerType: question.answerType,
        sortOrder: index,
      })),
    })
    message.success(t('oaFormConfig.saveSuccess'))
    await fetchPositions()
    closeOaFormModal()
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    savingOaForm.value = false
  }
}

async function handleDeleteOaForm() {
  if (!configuringPosition.value) {
    return
  }
  deletingOaForm.value = true
  try {
    await oaFormApi.deleteOaForm(configuringPosition.value.id)
    message.success(t('oaFormConfig.deleteSuccess'))
    await fetchPositions()
    closeOaFormModal()
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    deletingOaForm.value = false
  }
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

onMounted(async () => {
  await Promise.all([fetchPositions(), fetchInterviewers()])
})
</script>
