<template>
  <a-tag :color="color">{{ t(`status.${status}`) }}</a-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CandidateSubStatus } from '../types'

const props = defineProps<{ status: CandidateSubStatus }>()
const { t } = useI18n()

const colorMap: Record<CandidateSubStatus, string> = {
  new: 'default',
  waiting_for_oa: 'blue',
  oa_completed: 'orange',
  wait_to_confirm_date: 'cyan',
  date_confirmed: 'green',
  human_completed: 'green',
  oa_failed: 'red',
  oa_no_response: 'red',
  give_up_for_human: 'red',
  rejected: 'red',
  passed: 'green',
}

const color = computed(() => colorMap[props.status])
</script>
