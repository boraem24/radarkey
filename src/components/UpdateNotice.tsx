import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
export function UpdateNotice({ listening }: { listening: boolean }) {
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registered) {
      registration.current = registered ?? null
      if (navigator.onLine) void registered?.update().catch(() => {})
    },
  })
  useEffect(() => {
    const check = () => { if (!document.hidden && navigator.onLine) void registration.current?.update().catch(() => {}) }
    const timer = window.setInterval(check, 60000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [])
  useEffect(() => { if (needRefresh && !listening) void updateServiceWorker(true) }, [needRefresh, listening, updateServiceWorker])
  return needRefresh ? <div className="help">{listening ? 'Nova versão pronta. Pare a escuta para atualizar.' : 'Atualizando o aplicativo…'}</div> : null
}
