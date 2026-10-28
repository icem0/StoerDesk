import { useTranslation } from 'react-i18next'

export function App() {
  const { t } = useTranslation('common')

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold">{t('app.title')}</h1>
      <p className="mt-2 text-slate-400">{t('app.setupNotice')}</p>
    </main>
  )
}
