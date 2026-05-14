<template>
  <div>
    <!-- Filter bar -->
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">
      <a-select
        v-model:value="filters.type"
        :placeholder="t('notificationLog.allTypes')"
        allow-clear
        style="width: 140px"
        @change="onFilter"
      >
        <a-select-option value="email">Email</a-select-option>
        <a-select-option value="sms">SMS</a-select-option>
      </a-select>

      <a-select
        v-model:value="filters.deliveryStatus"
        :placeholder="t('notificationLog.allStatuses')"
        allow-clear
        style="width: 140px"
        @change="onFilter"
      >
        <a-select-option value="pending">Pending</a-select-option>
        <a-select-option value="sent">Sent</a-select-option>
        <a-select-option value="failed">Failed</a-select-option>
      </a-select>

      <a-button @click="onReset">{{ t('common.reset') }}</a-button>
    </div>

    <a-table
      :data-source="items"
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
        <template v-if="column.key === 'type'">
          <a-tag>{{ record.type }}</a-tag>
        </template>
        <template v-else-if="column.key === 'deliveryStatus'">
          <a-tag :color="statusColor(record.deliveryStatus)">{{ record.deliveryStatus }}</a-tag>
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDate(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <div style="display: flex; gap: 8px;">
            <a-button size="small" @click="openDetail(record)">
              {{ t('notificationLog.detailBtn') }}
            </a-button>
            <a-button
              v-if="record.deliveryStatus === 'failed'"
              size="small"
              :loading="retryingId === record.id"
              @click="handleRetry(record.id)"
            >
              {{ t('notificationLog.retryBtn') }}
            </a-button>
          </div>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="detailVisible"
      :title="t('notificationLog.detailTitle')"
      :footer="null"
      width="720px"
    >
      <a-descriptions v-if="selectedLog" :column="1" size="small" bordered>
        <a-descriptions-item :label="t('notificationLog.type')">{{ selectedLog.type }}</a-descriptions-item>
        <a-descriptions-item :label="t('notificationLog.event')">{{ selectedLog.triggerEvent }}</a-descriptions-item>
        <a-descriptions-item :label="t('notificationLog.deliveryStatus')">{{ selectedLog.deliveryStatus }}</a-descriptions-item>
        <a-descriptions-item :label="t('notificationLog.recipient')">{{ selectedLog.recipient || '-' }}</a-descriptions-item>
        <a-descriptions-item :label="t('notificationLog.subject')">{{ selectedLog.subject || '-' }}</a-descriptions-item>
        <a-descriptions-item :label="t('notificationLog.sentAt')">
          {{ selectedLog.sentAt ? formatDate(selectedLog.sentAt) : '-' }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('notificationLog.errorMessage')">
          {{ selectedLog.errorMessage || '-' }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('notificationLog.content')">
          <pre style="white-space: pre-wrap; margin: 0;">{{ selectedLog.content || '-' }}</pre>
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import * as notifApi from '../../api/notificationLogs'
import type { NotificationLog } from '../../api/notificationLogs'
import { extractError } from '../../api/client'

const { t } = useI18n()

const items = ref<NotificationLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const retryingId = ref<number | null>(null)
const detailVisible = ref(false)
const selectedLog = ref<NotificationLog | null>(null)

const filters = ref<{
  type?: string
  deliveryStatus?: string
}>({})

const columns = [
  { title: t('notificationLog.type'), key: 'type', dataIndex: 'type' },
  { title: t('notificationLog.event'), dataIndex: 'triggerEvent', key: 'event' },
  { title: t('notificationLog.deliveryStatus'), key: 'deliveryStatus' },
  { title: t('notificationLog.recipient'), dataIndex: 'recipient', key: 'recipient' },
  { title: t('notificationLog.createdAt'), key: 'createdAt' },
  { title: t('candidate.actions'), key: 'actions' },
]

function statusColor(status: string): string {
  if (status === 'sent') return 'green'
  if (status === 'failed') return 'red'
  return 'default'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

async function fetchLogs() {
  loading.value = true
  try {
    const result = await notifApi.listNotificationLogs({
      ...filters.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    items.value = result.items
    total.value = result.total
  } finally {
    loading.value = false
  }
}

function onFilter() {
  page.value = 1
  fetchLogs()
}

function onReset() {
  filters.value = {}
  page.value = 1
  fetchLogs()
}

function onPageChange(p: number, ps: number) {
  page.value = p
  pageSize.value = ps
  fetchLogs()
}

async function handleRetry(id: number) {
  retryingId.value = id
  try {
    await notifApi.retryNotification(id)
    message.success('Retry successful')
    await fetchLogs()
  } catch (e) {
    const err = extractError(e)
    message.error(err.message)
  } finally {
    retryingId.value = null
  }
}

function openDetail(log: NotificationLog) {
  // Keep a snapshot of the selected row so the modal stays stable while the list refreshes.
  selectedLog.value = log
  detailVisible.value = true
}

onMounted(fetchLogs)
</script>
