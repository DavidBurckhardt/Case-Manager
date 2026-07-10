'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'

interface DeleteCaseButtonProps {
  caseId: string
  caseNumber: string
}

export function DeleteCaseButton({ caseId, caseNumber }: DeleteCaseButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleDelete() {
    setError(null)
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/case-files/${caseId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Error al eliminar (${res.status}).`)
      }
      setOpen(false)
      startTransition(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el expediente.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Eliminar expediente ${caseNumber}`}
          />
        }
      >
        <Trash2 aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar expediente {caseNumber}?</DialogTitle>
          <DialogDescription>
            Esto elimina el expediente de todas las vistas. Sus documentos permanecen en almacenamiento
            y pueden ser recuperados por un administrador.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || isPending}
            className="gap-1.5"
          >
            {(isDeleting || isPending) && <Loader2 className="animate-spin" aria-hidden="true" />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
