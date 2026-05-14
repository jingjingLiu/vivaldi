<template>
  <div>
    <a-card :title="t('candidateStatus.title')">
      <a-spin :spinning="loading">
        <div v-if="profile">
          <a-descriptions :column="1" size="large">
            <a-descriptions-item :label="t('candidate.name')">
              {{ profile.name || '-' }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('candidate.position')">
              {{ profile.positionName }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('candidateStatus.currentStatus')">
              <StatusTag :status="profile.status" />
            </a-descriptions-item>
            <a-descriptions-item v-if="profile.oaDeadline" :label="t('candidate.oaDeadline')">
              {{ profile.oaDeadline.slice(0, 10) }}
            </a-descriptions-item>
          </a-descriptions>
        </div>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as candidatePortalApi from '../../api/candidatePortal'
import type { CandidateProfile } from '../../api/candidatePortal'
import StatusTag from '../../components/StatusTag.vue'

const { t } = useI18n()
const profile = ref<CandidateProfile | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    profile.value = await candidatePortalApi.getProfile()
  } finally {
    loading.value = false
  }
})
</script>
