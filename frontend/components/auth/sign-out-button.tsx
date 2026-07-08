'use client'

import { useTransition } from 'react'
import { signOut } from '@/actions/auth'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  )
}
