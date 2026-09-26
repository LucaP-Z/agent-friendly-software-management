import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, lastProject } from '@/lib/api'

export function useOpenProject() {
  const nav = useNavigate()
  const qc = useQueryClient()
  return (id: string) => {
    lastProject.set(id)
    api.openProject(id).finally(() => qc.invalidateQueries({ queryKey: ['projects'] }))
    nav(`/p/${id}`)
  }
}
