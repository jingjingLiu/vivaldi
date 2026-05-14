import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '../api/auth'
import type { AuthPrincipal } from '../api/auth'

export type { AuthPrincipal }

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthPrincipal | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)
  const roles = computed(() => user.value?.roles ?? [])
  const kind = computed(() => user.value?.kind)

  function hasRole(role: string): boolean {
    return roles.value.includes(role)
  }

  async function fetchMe(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      user.value = await authApi.me()
    } catch {
      user.value = null
    } finally {
      loading.value = false
    }
  }

  async function login(username: string, password: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      user.value = await authApi.login(username, password)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } }
      error.value = err.response?.data?.message ?? 'Login failed'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function candidateLogin(otc: string, phoneLast4: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      user.value = await authApi.candidateLogin(otc, phoneLast4)
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } }
      error.value = err.response?.data?.message ?? 'Login failed'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    await authApi.logout()
    user.value = null
  }

  return {
    user,
    loading,
    error,
    isAuthenticated,
    roles,
    kind,
    hasRole,
    fetchMe,
    login,
    candidateLogin,
    logout,
  }
})
