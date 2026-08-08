import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/calendario')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_app/calendario"!</div>
}
