<template>
  <a-tag :color="color">{{ t(`role.${role}`) }}</a-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Role } from '../types'

const props = defineProps<{ role: Role }>()
const { t } = useI18n()

const colorMap: Record<Role, string> = {
  coordinator: 'blue',
  screener: 'green',
  interviewer: 'orange',
}

const color = computed(() => colorMap[props.role])
</script>
