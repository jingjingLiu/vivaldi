<template>
  <div>
    <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
      <a-space>
        <a-switch v-model:checked="unreadOnly" @change="onFilter" />
        <span>{{ t('userNotification.unreadOnly') }}</span>
      </a-space>
      <a-space>
        <a-button @click="fetchNotifications">{{ t('userNotification.refresh') }}</a-button>
        <a-button type="primary" :loading="markingAll" @click="handleMarkAllRead">
          {{ t('userNotification.markAllRead') }}
        </a-button>
      </a-space>
    </div>

    <a-table
      :data-source="notifications"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{
        current: page,
        pageSize,
        total,
        showTotal: (tot: number) => t('common.total', { count: tot }),
        onChange: onPageChange,
      }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <a-space>
            <a-badge v-if="!record.readAt" status="processing" />
            <strong>{{ record.title }}</strong>
          </a-space>
        </template>

        <template v-else-if="column.key === 'event'">
          {{ t(`userNotification.event.${record.event}`) }}
        </template>

        <template v-else-if="column.key === 'candidate'">
          <router-link v-if="record.candidate" :to="`/admin/candidates/${record.candidate.id}`">
            {{ record.candidate.name || `#${record.candidate.id}` }}
          </router-link>
          <span v-else>{{ t('userNotification.candidateDeleted') }}</span>
        </template>

        <template v-else-if="column.key === 'status'">
          <StatusTag v-if="record.candidate" :status="record.candidate.status" />
          <span v-else>-</span>
        </template>

        <template v-else-if="column.key === 'createdAt'">
          {{ formatDateTime(record.createdAt) }}
        </template>

        <template v-else-if="column.key === 'readAt'">
          {{ record.readAt ? formatDateTime(record.readAt) : t('userNotification.unread') }}
        </template>

        <template v-else-if="column.key === 'actions'">
          <a-space>
            <a-button v-if="!record.readAt" size="small" :loading="markingId === record.id" @click="handleMarkRead(record.id)">
              {{ t('userNotification.markRead') }}
            </a-button>
            <router-link v-if="record.candidate" :to="`/admin/candidates/${record.candidate.id}`">
              {{ t('common.detail') }}
            </router-link>
          </a-space>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import * as userNotificationsApi from '../../api/userNotifications'
import type { UserNotification } from '../../api/userNotifications'
import StatusTag from '../../components/StatusTag.vue'
import { extractError } from '../../api/client'

const { t } = useI18n()

const notifications = ref<UserNotification[]>([])
const loading = ref(false)
const markingAll = ref(false)
const markingId = ref<number | null>(null)
const unreadOnly = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

// Columns are kept local because station messages have page-specific actions and status rendering.
const columns = [
  { title: t('userNotification.messageTitle'), key: 'title', dataIndex: 'title' },
  { title: t('userNotification.eventTitle'), key: 'event' },
  { title: t('candidate.name'), key: 'candidate' },
  { title: t('candidate.status'), key: 'status' },
  { title: t('userNotification.createdAt'), key: 'createdAt' },
  { title: t('userNotification.readAt'), key: 'readAt' },
  { title: t('candidate.actions'), key: 'actions' },
]

async function fetchNotifications() {
  loading.value = true
  try {
    const result = await userNotificationsApi.listUserNotifications({
      unreadOnly: unreadOnly.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    notifications.value = result.items
    total.value = result.total
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    loading.value = false
  }
}

function onFilter() {
  // Changing read-state filters should restart pagination to avoid landing on an empty later page.
  page.value = 1
  fetchNotifications()
}

function onPageChange(p: number, ps: number) {
  page.value = p
  pageSize.value = ps
  fetchNotifications()
}

async function handleMarkRead(id: number) {
  markingId.value = id
  try {
    await userNotificationsApi.markNotificationRead(id)
    await fetchNotifications()
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    markingId.value = null
  }
}

async function handleMarkAllRead() {
  markingAll.value = true
  try {
    const count = await userNotificationsApi.markAllNotificationsRead()
    message.success(t('userNotification.markAllReadSuccess', { count }))
    await fetchNotifications()
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    markingAll.value = false
  }
}

function formatDateTime(dateStr: string): string {
  return dateStr.replace('T', ' ').slice(0, 16)
}

onMounted(fetchNotifications)
</script>
