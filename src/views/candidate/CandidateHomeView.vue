<template>
  <div>
    <a-spin :spinning="loading">
      <a-card v-if="profile" :title="t('candidatePortal.homeTitle')" style="margin-bottom: 16px;">
        <a-descriptions :column="1" bordered>
          <a-descriptions-item :label="t('candidate.name')">{{ profile.name || '-' }}</a-descriptions-item>
          <a-descriptions-item :label="t('candidate.position')">{{ profile.positionName }}</a-descriptions-item>
          <a-descriptions-item :label="t('candidateStatus.currentStatus')">
            <StatusTag :status="profile.status" />
          </a-descriptions-item>
        </a-descriptions>
      </a-card>

      <a-card v-if="profile" :title="t('candidatePortal.progressTitle')" style="margin-bottom: 16px;">
        <a-steps :current="currentStep" size="small" direction="vertical">
          <a-step :title="t('candidatePortal.stepScreening')" />
          <a-step :title="t('candidatePortal.stepOa')" />
          <a-step :title="t('candidatePortal.stepReview')" />
          <a-step :title="t('candidatePortal.stepSchedule')" />
          <a-step :title="t('candidatePortal.stepResult')" />
        </a-steps>
      </a-card>

      <a-card v-if="profile" :title="t('candidatePortal.nextActionTitle')">
        <p style="margin-bottom: 16px;">{{ nextAction.description }}</p>
        <router-link v-if="nextAction.path" :to="nextAction.path">
          <a-button type="primary">{{ nextAction.button }}</a-button>
        </router-link>
      </a-card>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import * as candidatePortalApi from '../../api/candidatePortal'
import type { CandidateProfile } from '../../api/candidatePortal'
import StatusTag from '../../components/StatusTag.vue'

const { t } = useI18n()

const loading = ref(true)
const profile = ref<CandidateProfile | null>(null)

const currentStep = computed(() => {
  switch (profile.value?.status) {
    case 'new':
      return 0
    case 'waiting_for_oa':
      return 1
    case 'oa_completed':
      return 2
    case 'wait_to_confirm_date':
      return 3
    case 'date_confirmed':
    case 'human_completed':
    case 'passed':
    case 'rejected':
    case 'oa_failed':
    case 'oa_no_response':
    case 'give_up_for_human':
      return 4
    default:
      return 0
  }
})

const nextAction = computed(() => {
  switch (profile.value?.status) {
    case 'waiting_for_oa':
      return {
        description: t('candidatePortal.actionOa'),
        button: t('candidatePortal.goOa'),
        path: '/candidate/oa',
      }
    case 'oa_completed':
      return {
        description: t('candidatePortal.actionReview'),
        button: '',
        path: '',
      }
    case 'wait_to_confirm_date':
      return {
        description: t('candidatePortal.actionSlots'),
        button: t('candidatePortal.goSlots'),
        path: '/candidate/slots',
      }
    case 'date_confirmed':
      return {
        description: t('candidatePortal.actionDateConfirmed'),
        button: t('candidatePortal.viewSlots'),
        path: '/candidate/slots',
      }
    case 'passed':
      return {
        description: t('candidatePortal.actionPassed'),
        button: '',
        path: '',
      }
    case 'rejected':
    case 'oa_failed':
    case 'oa_no_response':
    case 'give_up_for_human':
      return {
        description: t('candidatePortal.actionClosed'),
        button: '',
        path: '',
      }
    default:
      return {
        description: t('candidatePortal.actionWait'),
        button: '',
        path: '',
      }
  }
})

onMounted(async () => {
  try {
    profile.value = await candidatePortalApi.getProfile()
  } finally {
    loading.value = false
  }
})
</script>
