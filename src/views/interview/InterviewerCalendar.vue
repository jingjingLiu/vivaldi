<template>
  <div>
    <!-- Toolbar row -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <a-space>
        <a-button @click="prevWeek">&lsaquo;</a-button>
        <span style="font-weight: 500;">{{ weekRangeLabel }}</span>
        <a-button @click="nextWeek">&rsaquo;</a-button>
        <a-button @click="goToday">{{ t('calendar.today') }}</a-button>
      </a-space>
      <a-button type="primary" @click="openAddModal">{{ t('calendar.addSlot') }}</a-button>
    </div>
    <div style="color: #999; font-size: 12px; margin-bottom: 12px;">
      {{ t('calendar.interactionHint') }}
    </div>

    <!-- Legend row -->
    <div style="display: flex; gap: 20px; font-size: 12px; margin-bottom: 12px; align-items: center;">
      <span>
        <span style="display: inline-block; width: 12px; height: 12px; background: #e6f7ff; border: 1px solid #91d5ff; margin-right: 4px; vertical-align: middle;"></span>
        {{ t('calendar.available') }}
      </span>
      <span>
        <span style="display: inline-block; width: 12px; height: 12px; background: #f6ffed; border: 1px solid #b7eb8f; margin-right: 4px; vertical-align: middle;"></span>
        {{ t('calendar.booked') }}
      </span>
    </div>

    <!-- Week grid -->
    <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
      <colgroup>
        <col style="width: 60px;" />
        <col v-for="_ in 7" :key="_" />
      </colgroup>
      <thead>
        <tr>
          <th style="border: 1px solid #f0f0f0; padding: 6px; background: #fafafa;"></th>
          <th
            v-for="day in weekDays"
            :key="day.toISOString()"
            style="border: 1px solid #f0f0f0; padding: 6px; text-align: center;"
            :style="isToday(day) ? { background: '#e6f7ff', color: '#1890ff' } : { background: '#fafafa' }"
          >
            <div style="font-weight: 600; font-size: 13px;">{{ dayLabel(day) }}</div>
            <div style="font-size: 12px;">{{ day.getDate() }}</div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="hour in hours" :key="hour">
          <td style="border: 1px solid #f0f0f0; padding: 4px 6px; text-align: right; color: #999; font-size: 12px; vertical-align: top;">
            {{ String(hour).padStart(2, '0') }}:00
          </td>
          <td
            v-for="day in weekDays"
            :key="day.toISOString()"
            style="border: 1px solid #f0f0f0; padding: 4px; vertical-align: top; height: 48px;"
            :style="getSlotForCell(day, hour) ? {} : { cursor: 'pointer' }"
            :title="getSlotForCell(day, hour) ? '' : t('calendar.clickBlankCellHint')"
            @click="handleCellClick(day, hour)"
          >
            <template v-if="getSlotForCell(day, hour)">
              <div
                v-if="getSlotForCell(day, hour)!.candidateId === null"
                style="background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 3px; padding: 3px 5px; cursor: pointer; font-size: 11px;"
                @click.stop="openSlotDetail(getSlotForCell(day, hour)!)"
              >
                <div>{{ getSlotForCell(day, hour)!.startTime }}–{{ getSlotForCell(day, hour)!.endTime }}</div>
                <div style="color: #999;">{{ t('calendar.available') }}</div>
              </div>
              <div
                v-else
                style="background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 3px; padding: 3px 5px; cursor: pointer; font-size: 11px;"
                @click.stop="openSlotDetail(getSlotForCell(day, hour)!)"
              >
                <div style="font-weight: 600;">{{ getSlotForCell(day, hour)!.startTime }}–{{ getSlotForCell(day, hour)!.endTime }}</div>
                <div>{{ getSlotForCell(day, hour)!.candidateName }}</div>
              </div>
            </template>
            <div v-else style="height: 100%; min-height: 36px; color: #d9d9d9; font-size: 11px;">
              +
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add Slot Modal -->
    <a-modal
      v-model:open="addModalVisible"
      :title="t('calendar.addSlot')"
      @ok="handleAddSlot"
      :confirm-loading="addingSlot"
      @cancel="addModalVisible = false"
    >
      <a-form layout="vertical" style="margin-top: 8px;">
        <a-form-item :label="t('calendar.date')">
          <a-date-picker
            v-model:value="newSlot.date"
            style="width: 100%;"
            :disabled-date="isDateOutsideCreateWindow"
          />
        </a-form-item>
        <a-form-item :label="t('calendar.startTime')">
          <a-time-picker
            v-model:value="newSlot.startTime"
            format="HH:mm"
            :minute-step="5"
            style="width: 100%;"
            @change="syncEndTimeFromDuration"
          />
        </a-form-item>
        <a-form-item :label="t('calendar.duration')">
          <a-select v-model:value="newSlot.duration" style="width: 100%;" @change="syncEndTimeFromDuration">
            <a-select-option v-for="option in durationOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="t('calendar.endTime')">
          <a-time-picker
            v-model:value="newSlot.endTime"
            format="HH:mm"
            :minute-step="5"
            style="width: 100%;"
            @change="syncDurationFromRange"
          />
        </a-form-item>
        <a-form-item :label="t('calendar.repeat')">
          <a-select v-model:value="newSlot.repeat" style="width: 100%;">
            <a-select-option value="none">{{ t('calendar.noRepeat') }}</a-select-option>
            <a-select-option value="weekly">{{ t('calendar.weeklyRepeat') }}</a-select-option>
          </a-select>
        </a-form-item>
        <div style="color: #999; font-size: 12px;">{{ t('calendar.dateRangeHint') }}</div>
        <div style="color: #999; font-size: 12px; margin-top: 4px;">{{ t('calendar.durationHint') }}</div>
      </a-form>
    </a-modal>

    <!-- Slot Detail Modal -->
    <a-modal
      v-model:open="detailModalVisible"
      :title="selectedSlot?.candidateId === null ? t('calendar.available') : t('calendar.booked')"
      :footer="null"
      @cancel="detailModalVisible = false"
    >
      <template v-if="selectedSlot">
        <div style="margin-bottom: 8px;">
          <strong>{{ t('calendar.date') }}:</strong> {{ selectedSlot.date }}
        </div>
        <div style="margin-bottom: 8px;">
          <strong>{{ t('calendar.startTime') }}:</strong> {{ selectedSlot.startTime }} – {{ selectedSlot.endTime }}
        </div>
        <div style="margin-bottom: 8px;">
          <strong>{{ t('calendar.statusLabel') }}:</strong>
          {{ selectedSlot.candidateId === null ? t('calendar.available') : t('calendar.booked') }}
        </div>

        <template v-if="selectedSlot.candidateId !== null">
          <div style="margin-bottom: 8px;">
            <strong>{{ t('calendar.candidateLabel') }}:</strong>
            <router-link :to="`/admin/candidates/${selectedSlot.candidateId}`" style="margin-left: 6px;">
              {{ selectedSlot.candidateName }}
            </router-link>
          </div>
          <div style="margin-bottom: 12px;">
            <strong>{{ t('calendar.positionLabel') }}:</strong>
            <span style="margin-left: 6px;">{{ selectedSlot.positionName ?? '-' }}</span>
          </div>
          <div style="color: #999; font-size: 12px;">{{ t('calendar.bookedNoEdit') }}</div>
        </template>

        <template v-else>
          <div style="display: flex; gap: 8px; margin-top: 12px;">
            <a-button danger :loading="deletingSlot" @click="handleDeleteSlot(selectedSlot)">{{ t('common.delete') }}</a-button>
          </div>
        </template>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import dayjs, { type Dayjs } from 'dayjs'
import * as timeSlotsApi from '../../api/timeSlots'
import type { TimeSlot } from '../../api/timeSlots'
import { extractError } from '../../api/client'

const { t } = useI18n()

const slots = ref<TimeSlot[]>([])

function formatLocalDate(date: Date): string {
  return dayjs(date).format('YYYY-MM-DD')
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

const currentWeekStart = ref(getMonday(new Date()))

const weekDays = computed(() => {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart.value)
    d.setDate(d.getDate() + i)
    days.push(d)
  }
  return days
})

const weekSlots = computed(() => {
  const start = formatLocalDate(weekDays.value[0])
  const end = formatLocalDate(weekDays.value[6])
  return slots.value.filter(s => {
    return s.date >= start && s.date <= end
  })
})

const hours = Array.from({ length: 9 }, (_, i) => i + 9)

function getSlotForCell(day: Date, hour: number): TimeSlot | undefined {
  const dateStr = formatLocalDate(day)
  return weekSlots.value.find(s => {
    return s.date === dateStr && parseInt(s.startTime.split(':')[0]) === hour
  })
}

const weekDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dayLabel(day: Date): string {
  return weekDayNames[weekDays.value.indexOf(day)]
}

const weekRangeLabel = computed(() => {
  const start = weekDays.value[0]
  const end = weekDays.value[6]
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  const endStr = `${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  return `${startStr} — ${endStr}`
})

function isToday(day: Date): boolean {
  return formatLocalDate(day) === formatLocalDate(new Date())
}

function prevWeek() {
  currentWeekStart.value = new Date(currentWeekStart.value.getTime() - 7 * 86400000)
  void fetchSlots()
}

function nextWeek() {
  currentWeekStart.value = new Date(currentWeekStart.value.getTime() + 7 * 86400000)
  void fetchSlots()
}

function goToday() {
  currentWeekStart.value = getMonday(new Date())
  void fetchSlots()
}

// --- Load slots ---
async function fetchSlots() {
  const start = weekDays.value[0]
  const end = weekDays.value[6]
  const from = formatLocalDate(start)
  const to = formatLocalDate(end)
  try {
    const data = await timeSlotsApi.listMySlots({ from, to })
    slots.value = data
  } catch (e) {
    message.error(extractError(e).message)
  }
}

// --- Add Slot Modal ---
const addModalVisible = ref(false)
const addingSlot = ref(false)
const MIN_DURATION_MIN = 15
const MAX_DURATION_MIN = 240

const durationOptions = [30, 45, 60, 90, 120, 180, 240].map(value => ({
  value,
  label: t('calendar.durationMinutes', { count: value }),
}))

const newSlot = ref({
  date: null as Dayjs | null,
  startTime: null as Dayjs | null,
  endTime: null as Dayjs | null,
  duration: 60,
  repeat: 'none' as 'none' | 'weekly',
})

function getDefaultSlotDate(): Dayjs {
  const now = dayjs()
  return now.hour() >= 17 ? now.add(1, 'day') : now
}

function getDefaultStartTime(): Dayjs {
  const now = dayjs()
  if (now.hour() < 9 || now.hour() >= 17) {
    return now.hour(9).minute(0).second(0)
  }
  return now.add(1, 'hour').minute(0).second(0)
}

function openAddModal(day?: Date, hour?: number) {
  const startTime = hour !== undefined ? dayjs().hour(hour).minute(0).second(0) : getDefaultStartTime()
  newSlot.value = {
    date: day ? dayjs(day) : getDefaultSlotDate(),
    startTime,
    endTime: startTime.add(60, 'minute'),
    duration: 60,
    repeat: 'none',
  }
  addModalVisible.value = true
}

function handleCellClick(day: Date, hour: number) {
  if (getSlotForCell(day, hour)) return
  openAddModal(day, hour)
}

function syncEndTimeFromDuration() {
  if (!newSlot.value.startTime) return
  newSlot.value.endTime = newSlot.value.startTime.add(newSlot.value.duration, 'minute')
}

function syncDurationFromRange() {
  const duration = getSelectedDuration()
  if (duration && duration >= MIN_DURATION_MIN && duration <= MAX_DURATION_MIN) {
    newSlot.value.duration = duration
  }
}

function getSelectedDuration(): number | null {
  if (!newSlot.value.startTime || !newSlot.value.endTime) return null
  return newSlot.value.endTime.diff(newSlot.value.startTime, 'minute')
}

function isDateOutsideCreateWindow(current: Dayjs): boolean {
  const today = dayjs().startOf('day')
  const limit = today.add(28, 'day')
  return current.isBefore(today, 'day') || current.isAfter(limit, 'day')
}

function validateSlotForm(): boolean {
  if (!newSlot.value.date || !newSlot.value.startTime || !newSlot.value.endTime) {
    message.error(t('calendar.requiredFields'))
    return false
  }

  if (isDateOutsideCreateWindow(newSlot.value.date)) {
    message.error(t('calendar.outOfWindow'))
    return false
  }

  const duration = getSelectedDuration()
  if (duration === null || duration <= 0) {
    message.error(t('calendar.endAfterStart'))
    return false
  }

  if (duration < MIN_DURATION_MIN) {
    message.error(t('calendar.slotDurationTooShort'))
    return false
  }

  if (duration > MAX_DURATION_MIN) {
    message.error(t('calendar.slotDurationTooLong'))
    return false
  }

  return true
}

async function handleAddSlot() {
  if (!validateSlotForm()) return

  const dateStr = newSlot.value.date!.format('YYYY-MM-DD')
  const startStr = newSlot.value.startTime!.format('HH:mm')
  const endStr = newSlot.value.endTime!.format('HH:mm')
  const weeksCount = newSlot.value.repeat === 'weekly' ? 4 : 1

  addingSlot.value = true
  try {
    for (let w = 0; w < weeksCount; w++) {
      const slotDate = dayjs(dateStr).add(w * 7, 'day').format('YYYY-MM-DD')
      await timeSlotsApi.createSlot({ date: slotDate, startTime: startStr, endTime: endStr })
    }
    await fetchSlots()
    addModalVisible.value = false
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    addingSlot.value = false
  }
}

// --- Slot Detail Modal ---
const detailModalVisible = ref(false)
const selectedSlot = ref<TimeSlot | null>(null)
const deletingSlot = ref(false)

function openSlotDetail(slot: TimeSlot) {
  selectedSlot.value = slot
  detailModalVisible.value = true
}

async function handleDeleteSlot(slot: TimeSlot) {
  deletingSlot.value = true
  try {
    await timeSlotsApi.deleteSlot(slot.id)
    slots.value = slots.value.filter(s => s.id !== slot.id)
    detailModalVisible.value = false
    selectedSlot.value = null
  } catch (e) {
    message.error(extractError(e).message)
  } finally {
    deletingSlot.value = false
  }
}

onMounted(fetchSlots)
</script>
