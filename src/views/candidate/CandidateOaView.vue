<template>
  <div>
    <!-- Not available (e.g., position has no OA form configured) -->
    <a-result
      v-if="phase === 'unavailable'"
      status="warning"
      :title="t('oa.notAvailable')"
    />

    <!-- Already submitted (backend collapses expired into submitted) -->
    <a-result
      v-else-if="phase === 'submitted'"
      status="success"
      :title="t('oa.submitted')"
    />

    <!-- Not started yet: show instructions + start button -->
    <a-card v-else-if="phase === 'not_started' && apiState" :title="t('oa.title')">
      <div v-if="instructions" v-html="instructions" style="margin-bottom: 24px;" />
      <div style="margin-bottom: 16px; color: #888;">
        {{ t('oa.timeRemaining') }}: {{ apiState.timeLimitMinutes }} min
      </div>
      <a-button type="primary" size="large" :loading="starting" @click="handleStart">
        {{ t('oa.startBtn') }}
      </a-button>
    </a-card>

    <!-- In Progress: exam -->
    <div v-else-if="phase === 'in_progress' && questions.length > 0">
      <!-- Timer bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <span style="font-size: 16px; font-weight: 600;">
          {{ t('oa.question') }} {{ currentIndex + 1 }} / {{ questions.length }}
        </span>
        <a-tag :color="timerColor" style="font-size: 15px; padding: 4px 12px;">
          {{ t('oa.timeRemaining') }}: {{ formatTime(remainingSeconds) }}
        </a-tag>
      </div>

      <a-card>
        <div style="font-weight: 600; font-size: 15px; margin-bottom: 12px;">
          {{ currentQuestion.questionText }}
          <a-tag style="margin-left: 8px;">{{ currentQuestion.answerType === 'text' ? t('candidate.textType') : t('candidate.codeType') }}</a-tag>
        </div>

        <a-textarea
          v-if="currentQuestion.answerType === 'text'"
          v-model:value="answers[currentQuestion.id]"
          :rows="10"
          style="font-family: inherit;"
          @change="debouncedSave(currentQuestion.id)"
        />
        <a-textarea
          v-else
          v-model:value="answers[currentQuestion.id]"
          :rows="14"
          style="font-family: monospace; background: #1e1e1e; color: #d4d4d4;"
          @change="debouncedSave(currentQuestion.id)"
        />

        <div style="margin-top: 8px; font-size: 12px; color: #888;">
          {{ saveStatus }}
        </div>
      </a-card>

      <!-- Navigation -->
      <div style="display: flex; justify-content: space-between; margin-top: 16px;">
        <a-button :disabled="currentIndex === 0" @click="currentIndex--">{{ t('oa.prev') }}</a-button>
        <a-space>
          <a-button
            v-if="currentIndex < questions.length - 1"
            type="primary"
            @click="currentIndex++"
          >{{ t('oa.next') }}</a-button>
          <a-popconfirm
            v-else
            :title="t('oa.confirmSubmit')"
            @confirm="handleSubmit"
          >
            <a-button type="primary" danger :loading="submitting">{{ t('oa.submitBtn') }}</a-button>
          </a-popconfirm>
        </a-space>
      </div>
    </div>

    <!-- Loading spinner -->
    <div v-else style="text-align: center; padding: 60px;">
      <a-spin size="large" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as oaApi from '../../api/oa'
import type { OaStateResponse, OaQuestion } from '../../api/oa'
import { extractError } from '../../api/client'

const { t, locale } = useI18n()

type UiPhase = 'loading' | 'unavailable' | 'not_started' | 'in_progress' | 'submitted'

const apiState = ref<OaStateResponse | null>(null)
const unavailable = ref(false)
const questions = ref<OaQuestion[]>([])
const answers = ref<Record<number, string>>({})
const currentIndex = ref(0)
const starting = ref(false)
const submitting = ref(false)
const saveStatus = ref('')
const remainingSeconds = ref(0)

const phase = computed<UiPhase>(() => {
  if (unavailable.value) return 'unavailable'
  if (!apiState.value) return 'loading'
  return apiState.value.state
})

const instructions = computed<string | null>(() => {
  if (!apiState.value) return null
  return locale.value.startsWith('zh')
    ? apiState.value.instructions.zhCN
    : apiState.value.instructions.en
})

let timerInterval: ReturnType<typeof setInterval> | null = null
const saveTimers: Record<number, ReturnType<typeof setTimeout>> = {}

const currentQuestion = computed<OaQuestion>(() => questions.value[currentIndex.value] ?? { id: 0, questionText: '', answerType: 'text', sortOrder: 0, answerContent: null })

const timerColor = computed(() => {
  if (remainingSeconds.value < 300) return 'red'
  if (remainingSeconds.value < 600) return 'orange'
  return 'green'
})

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

async function loadState() {
  try {
    apiState.value = await oaApi.getState()
    unavailable.value = false
  } catch (e) {
    if (extractError(e).code === 'NO_OA_FORM') {
      unavailable.value = true
      apiState.value = null
      return
    }
    throw e
  }
  if (apiState.value.state === 'in_progress') {
    await loadQuestions()
    remainingSeconds.value = apiState.value.remainingSeconds ?? 0
    startTimer()
  }
}

async function loadQuestions() {
  const qs = await oaApi.questions()
  questions.value = qs
  for (const q of qs) {
    answers.value[q.id] = q.answerContent ?? ''
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval)
  timerInterval = setInterval(async () => {
    if (remainingSeconds.value > 0) {
      remainingSeconds.value--
    } else {
      if (timerInterval) clearInterval(timerInterval)
      try {
        await oaApi.submit()
      } catch {
        // ignore — backend may have already auto-submitted
      }
      await loadState()
    }
  }, 1000)
}

function debouncedSave(questionId: number) {
  if (saveTimers[questionId]) clearTimeout(saveTimers[questionId])
  saveStatus.value = t('oa.saving')
  saveTimers[questionId] = setTimeout(async () => {
    await oaApi.saveAnswer(questionId, answers.value[questionId] ?? '')
    saveStatus.value = t('oa.autoSaved')
  }, 800)
}

async function handleStart() {
  starting.value = true
  try {
    await oaApi.start()
    await loadState()
  } finally {
    starting.value = false
  }
}

async function handleSubmit() {
  submitting.value = true
  try {
    await oaApi.submit()
    if (timerInterval) clearInterval(timerInterval)
    await loadState()
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await loadState()
})

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
  Object.values(saveTimers).forEach(tm => clearTimeout(tm))
})
</script>
