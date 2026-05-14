import { createRouter, createWebHistory } from 'vue-router'
import { setCurrentRouteKind } from '../api/client'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Public routes
    { path: '/login', name: 'Login', component: () => import('../views/LoginView.vue'), meta: { kind: 'public' } },
    { path: '/candidate-login', name: 'CandidateLogin', component: () => import('../views/CandidateLoginView.vue'), meta: { kind: 'public' } },

    // Admin / internal routes
    {
      path: '/admin',
      component: () => import('../layouts/AdminLayout.vue'),
      redirect: '/admin/candidates',
      meta: { kind: 'internal' },
      children: [
        { path: 'candidates', name: 'CandidateList', component: () => import('../views/candidate/CandidateList.vue') },
        { path: 'candidates/:id', name: 'CandidateDetail', component: () => import('../views/candidate/CandidateDetail.vue') },
        { path: 'settings', name: 'SystemSettings', component: () => import('../views/admin/SystemSettings.vue') },
        { path: 'users', name: 'UserManagement', component: () => import('../views/admin/UserManagement.vue') },
        { path: 'positions', name: 'PositionManagement', component: () => import('../views/admin/PositionManagement.vue') },
        { path: 'schedule', name: 'InterviewerCalendar', component: () => import('../views/interview/InterviewerCalendar.vue') },
        { path: 'notification-logs', name: 'NotificationLogs', component: () => import('../views/admin/NotificationLogs.vue') },
        { path: 'messages', name: 'UserNotifications', component: () => import('../views/admin/UserNotifications.vue') },
      ],
    },

    // Candidate routes
    {
      path: '/candidate',
      component: () => import('../layouts/CandidateLayout.vue'),
      meta: { kind: 'candidate' },
      children: [
        { path: '', redirect: '/candidate/home' },
        { path: 'home', name: 'CandidateHome', component: () => import('../views/candidate/CandidateHomeView.vue') },
        { path: 'oa', name: 'CandidateOa', component: () => import('../views/candidate/CandidateOaView.vue') },
        { path: 'slots', name: 'CandidateSlots', component: () => import('../views/candidate/CandidateSlotsView.vue') },
        { path: 'status', name: 'CandidateStatus', component: () => import('../views/candidate/CandidateStatusView.vue') },
      ],
    },

    // Legacy redirect
    { path: '/', redirect: '/admin/candidates' },
    { path: '/candidates', redirect: '/admin/candidates' },
    { path: '/candidates/:id', redirect: to => `/admin/candidates/${to.params.id}` },
    { path: '/settings', redirect: '/admin/settings' },
    { path: '/users', redirect: '/admin/users' },
    { path: '/positions', redirect: '/admin/positions' },
    { path: '/schedule', redirect: '/admin/schedule' },
    { path: '/messages', redirect: '/admin/messages' },
  ],
})

// Auth guard
let authChecked = false

router.beforeEach(async (to) => {
  const kind = (to.meta?.kind as string | undefined) ?? (to.matched[0]?.meta?.kind as string | undefined) ?? 'internal'
  setCurrentRouteKind(kind as 'internal' | 'candidate' | 'public')

  // Lazy import to avoid circular deps
  const { useAuthStore } = await import('../stores/auth')
  const auth = useAuthStore()

  // For public routes, redirect authenticated users away from login pages
  if (kind === 'public') {
    if (!auth.isAuthenticated) {
      await auth.fetchMe()
    }
    if (auth.isAuthenticated) {
      if (auth.kind === 'candidate') {
        return { path: '/candidate/home' }
      }
      return { path: '/admin/candidates' }
    }
    return true
  }

  if (!auth.isAuthenticated && !authChecked) {
    authChecked = false
    await auth.fetchMe()
  }

  if (!auth.isAuthenticated) {
    authChecked = false
    if (kind === 'candidate') {
      return { name: 'CandidateLogin' }
    }
    return { name: 'Login' }
  }

  // Enforce kind: internal users can't access candidate routes and vice versa
  if (kind === 'candidate' && auth.kind !== 'candidate') {
    return { name: 'CandidateLogin' }
  }
  if (kind === 'internal' && auth.kind !== 'internal') {
    return { name: 'Login' }
  }

  return true
})

export default router
