import axios from 'axios'

export const apiClient = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:3002',
  withCredentials: true,
})

// Track current route kind for redirect on 401
let currentRouteKind: 'internal' | 'candidate' | 'public' = 'public'
export function setCurrentRouteKind(kind: 'internal' | 'candidate' | 'public') {
  currentRouteKind = kind
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname
      // Do not redirect if already on a login page — let the component handle the error
      if (currentPath === '/login' || currentPath === '/candidate-login') {
        return Promise.reject(error)
      }
      // Do not redirect for /auth/me — the router guard handles session checks
      const requestUrl = error.config?.url as string | undefined
      if (requestUrl === '/auth/me') {
        return Promise.reject(error)
      }
      const loginPath = currentRouteKind === 'candidate' ? '/candidate-login' : '/login'
      if (currentPath !== loginPath) {
        window.location.href = loginPath
      }
    }
    return Promise.reject(error)
  },
)

export function extractError(error: unknown): { code: string; message: string } {
  if (axios.isAxiosError(error) && error.response?.data) {
    const data = error.response.data as { code?: string; message?: string }
    return {
      code: data.code ?? 'UNKNOWN_ERROR',
      message: data.message ?? 'An unexpected error occurred',
    }
  }
  return { code: 'NETWORK_ERROR', message: 'Network error, please try again' }
}
