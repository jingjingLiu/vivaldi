<template>
  <a-layout style="min-height: 100vh">
    <a-layout-sider :width="220" theme="dark">
      <div style="padding: 16px 20px; color: #fff; font-size: 18px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1)">
        Vivaldi
      </div>
      <a-menu theme="dark" :selected-keys="[selectedKey]" mode="inline" @click="onMenuClick">
        <a-menu-item-group v-if="canViewCandidates" :title="t('nav.candidate')">
          <a-menu-item key="/admin/candidates">
            <template #icon><UnorderedListOutlined /></template>
            {{ t('nav.candidateList') }}
          </a-menu-item>
        </a-menu-item-group>
        <a-menu-item-group v-if="canUseSchedule" :title="t('nav.interview')">
          <a-menu-item key="/admin/schedule">
            <template #icon><CalendarOutlined /></template>
            {{ t('nav.schedule') }}
          </a-menu-item>
        </a-menu-item-group>
        <a-menu-item-group v-if="canManageSystem" :title="t('nav.system')">
          <a-menu-item key="/admin/settings">
            <template #icon><SettingOutlined /></template>
            {{ t('nav.settings') }}
          </a-menu-item>
          <a-menu-item key="/admin/users">
            <template #icon><TeamOutlined /></template>
            {{ t('nav.userManagement') }}
          </a-menu-item>
          <a-menu-item key="/admin/positions">
            <template #icon><BankOutlined /></template>
            {{ t('nav.positionManagement') }}
          </a-menu-item>
          <a-menu-item key="/admin/notification-logs">
            <template #icon><BellOutlined /></template>
            {{ t('nav.notificationLog') }}
          </a-menu-item>
        </a-menu-item-group>
      </a-menu>
    </a-layout-sider>
    <a-layout>
      <a-layout-header style="background: #fff; padding: 0 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e8e8e8; height: 48px; line-height: 48px">
        <a-breadcrumb>
          <a-breadcrumb-item v-for="item in breadcrumbs" :key="item">{{ item }}</a-breadcrumb-item>
        </a-breadcrumb>
        <a-space :size="16">
          <a-tooltip :title="t('userNotification.title')">
            <a-badge :count="unreadCount" :overflow-count="99" size="small">
              <a-button type="text" shape="circle" @click="goMessages">
                <template #icon><BellOutlined /></template>
              </a-button>
            </a-badge>
          </a-tooltip>
          <a-dropdown>
            <a style="color: #666">{{ locale === 'zhCN' ? '中文' : 'English' }}</a>
            <template #overlay>
              <a-menu @click="switchLang">
                <a-menu-item key="zhCN">中文</a-menu-item>
                <a-menu-item key="en">English</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-avatar style="background-color: #1890ff" size="small">
            {{ userInitial }}
          </a-avatar>
          <span style="color: #666">{{ userName }}</span>
          <a style="color: #666" @click="handleLogout">{{ t('auth.logout') }}</a>
        </a-space>
      </a-layout-header>
      <a-layout-content style="padding: 24px; background: #f0f2f5">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  UnorderedListOutlined,
  CalendarOutlined,
  SettingOutlined,
  TeamOutlined,
  BankOutlined,
  BellOutlined,
} from '@ant-design/icons-vue'
import { useAuthStore } from '../stores/auth'
import * as userNotificationsApi from '../api/userNotifications'

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const auth = useAuthStore()
const unreadCount = ref(0)
let unreadTimer: ReturnType<typeof window.setInterval> | null = null

const userName = computed(() => String(auth.user?.userId ?? 'User'))
const userInitial = computed(() => String(auth.user?.userId ?? 'A').charAt(0).toUpperCase())

const canViewCandidates = computed(() =>
  auth.hasRole('coordinator') || auth.hasRole('screener') || auth.hasRole('interviewer'),
)
// The schedule page currently manages an interviewer's own available slots.
const canUseSchedule = computed(() => auth.hasRole('interviewer'))
const canManageSystem = computed(() => auth.hasRole('coordinator'))

const selectedKey = computed(() => {
  const path = route.path
  if (path.startsWith('/admin/candidates')) return '/admin/candidates'
  if (path.startsWith('/admin/schedule')) return '/admin/schedule'
  if (path.startsWith('/admin/settings')) return '/admin/settings'
  if (path.startsWith('/admin/users')) return '/admin/users'
  if (path.startsWith('/admin/positions')) return '/admin/positions'
  if (path.startsWith('/admin/notification-logs')) return '/admin/notification-logs'
  if (path.startsWith('/admin/messages')) return '/admin/messages'
  return path
})

const breadcrumbs = computed(() => {
  const map: Record<string, string[]> = {
    '/admin/candidates': [t('nav.candidate'), t('nav.candidateList')],
    '/admin/settings': [t('nav.system'), t('nav.settings')],
    '/admin/users': [t('nav.system'), t('nav.userManagement')],
    '/admin/positions': [t('nav.system'), t('nav.positionManagement')],
    '/admin/schedule': [t('nav.interview'), t('nav.schedule')],
    '/admin/notification-logs': [t('nav.system'), t('nav.notificationLog')],
    '/admin/messages': [t('userNotification.title')],
  }
  const key = selectedKey.value
  return map[key] || []
})

function onMenuClick({ key }: { key: string }) {
  router.push(key)
}

function switchLang({ key }: { key: string }) {
  locale.value = key
}

function goMessages() {
  router.push('/admin/messages')
}

async function refreshUnreadCount() {
  try {
    unreadCount.value = await userNotificationsApi.getUnreadCount()
  } catch {
    // Header polling is best-effort; page-level API errors are shown in the inbox view.
  }
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

onMounted(() => {
  refreshUnreadCount()
  // Keep the badge fresh without adding websocket infrastructure for this small workflow reminder.
  unreadTimer = window.setInterval(refreshUnreadCount, 30_000)
})

onUnmounted(() => {
  if (unreadTimer !== null) {
    window.clearInterval(unreadTimer)
  }
})
</script>
