import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { api, lastProject } from '@/lib/api'
import { TooltipProvider } from '@/components/ui/tooltip'
import EntityList from '@/pages/EntityList'
import EntityPage from '@/pages/EntityPage'
import Overview from '@/pages/Overview'
import ProjectLayout from '@/pages/ProjectLayout'
import ProjectsPage from '@/pages/ProjectsPage'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

function Home() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects })
  if (projects.isLoading) return null
  const last = lastProject.get()
  const target = projects.data?.find((p) => p.id === last && p.exists !== false)
  return <Navigate to={target ? `/p/${target.id}` : '/projects'} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/p/:pid" element={<ProjectLayout />}>
            <Route index element={<Overview />} />
            <Route path="t/:type" element={<EntityList />} />
            <Route path="e/:eid" element={<EntityPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
