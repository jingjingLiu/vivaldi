<template>
  <div>
    <a-card :title="t('slots.title')">
      <a-spin :spinning="loading">
        <!-- Already booked -->
        <div v-if="mySlot">
          <a-result status="success" :title="t('slots.bookedTitle')">
            <template #extra>
              <a-descriptions :column="1" bordered>
                <a-descriptions-item :label="t('slots.date')">{{ mySlot.date }}</a-descriptions-item>
                <a-descriptions-item :label="t('slots.time')">{{ mySlot.startTime }} – {{ mySlot.endTime }}</a-descriptions-item>
                <a-descriptions-item :label="t('slots.interviewer')">{{ mySlot.interviewerName }}</a-descriptions-item>
              </a-descriptions>
            </template>
          </a-result>
        </div>

        <!-- Available slots list -->
        <div v-else>
          <a-empty v-if="!loading && slots.length === 0" :description="t('slots.noSlots')" />
          <a-list
            v-else
            :data-source="slots"
            item-layout="horizontal"
          >
            <template #renderItem="{ item }">
              <a-list-item>
                <a-list-item-meta>
                  <template #title>
                    {{ item.date }} &nbsp; {{ item.startTime }} – {{ item.endTime }}
                  </template>
                  <template #description>
                    {{ t('slots.interviewer') }}: {{ item.interviewerName }}
                  </template>
                </a-list-item-meta>
                <template #actions>
                  <a-button
                    type="primary"
                    :loading="bookingId === item.id"
                    @click="handleBook(item.id)"
                  >
                    {{ t('slots.bookBtn') }}
                  </a-button>
                </template>
              </a-list-item>
            </template>
          </a-list>
        </div>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import * as candidateSlotsApi from '../../api/candidateSlots'
import type { AvailableSlot, BookedSlot } from '../../api/candidateSlots'
import { extractError } from '../../api/client'

const { t } = useI18n()

const slots = ref<AvailableSlot[]>([])
const mySlot = ref<BookedSlot | null>(null)
const loading = ref(true)
const bookingId = ref<number | null>(null)

async function loadData() {
  loading.value = true
  try {
    const [available, booked] = await Promise.all([
      candidateSlotsApi.listAvailable(),
      candidateSlotsApi.mine(),
    ])
    slots.value = available
    mySlot.value = booked
  } finally {
    loading.value = false
  }
}

async function handleBook(slotId: number) {
  bookingId.value = slotId
  try {
    mySlot.value = await candidateSlotsApi.book(slotId)
    message.success(t('slots.bookSuccess'))
  } catch (e) {
    const err = extractError(e)
    message.error(err.message)
  } finally {
    bookingId.value = null
  }
}

onMounted(loadData)
</script>
