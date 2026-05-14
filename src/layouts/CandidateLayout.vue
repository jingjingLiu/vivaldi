<template>
  <div style="min-height: 100vh; background: #f0f2f5;">
    <div style="background: #001529; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; height: 64px;">
      <span style="color: #fff; font-size: 18px; font-weight: 600;">{{ t('auth.candidatePortal') }}</span>
      <a-space>
        <router-link to="/candidate/home" style="color: #fff;">{{ t('candidatePortal.home') }}</router-link>
        <router-link to="/candidate/oa" style="color: #fff;">{{ t('candidatePortal.oa') }}</router-link>
        <router-link to="/candidate/slots" style="color: #fff;">{{ t('candidatePortal.slots') }}</router-link>
        <router-link to="/candidate/status" style="color: #fff;">{{ t('candidatePortal.status') }}</router-link>
        <a-button size="small" @click="handleLogout">{{ t('auth.logout') }}</a-button>
      </a-space>
    </div>
    <div style="max-width: 800px; margin: 32px auto; padding: 0 24px;">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

async function handleLogout() {
  await auth.logout()
  await router.replace('/candidate-login')
}
</script>
