import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const useSchema = () => useQuery({ queryKey: ['schema'], queryFn: api.schema, staleTime: Infinity })
export const useEntities = (pid: string) => useQuery({ queryKey: ['entities', pid], queryFn: () => api.entities(pid) })
export const useStatus = (pid: string) => useQuery({ queryKey: ['status', pid], queryFn: () => api.status(pid), retry: false })
export const useGit = (pid: string) =>
  useQuery({ queryKey: ['git', pid], queryFn: () => api.git(pid), refetchInterval: 4000, retry: false })
