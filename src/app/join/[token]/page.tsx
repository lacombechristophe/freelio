import { acceptTeamInvitation, getInvitationPreview } from "@/actions/team"
import { auth } from "@/auth"
import { DiskoovBrand } from "@/components/shared/diskoov-brand"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

export default async function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = await getInvitationPreview(token)

  if (!invitation) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-5">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Invitation indisponible</CardTitle>
            <CardDescription>Ce lien a expiré, a déjà été utilisé ou n'est pas valide.</CardDescription>
          </CardHeader>
          <CardFooter><Button render={<Link href="/auth/login" />}>Se connecter</Button></CardFooter>
        </Card>
      </main>
    )
  }

  const session = await auth()
  if (!session?.user?.id) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent(`/join/${token}`)}`)
  }

  const emailMatches = session.user.email?.toLowerCase() === invitation.email.toLowerCase()
  async function acceptAction() {
    "use server"
    await acceptTeamInvitation(token)
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto w-full max-w-xl">
        <DiskoovBrand href="/" />
        <Card className="mt-10">
          <CardHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-5" /></div>
            <CardTitle>Rejoindre {invitation.companyName}</CardTitle>
            <CardDescription>Votre accès sera configuré avec le rôle « {invitation.role} ».</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              Invitation destinée à <strong className="text-foreground">{invitation.email}</strong>.
            </p>
            {!emailMatches ? (
              <p className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
                Vous êtes connecté avec une autre adresse. Déconnectez-vous puis utilisez l'adresse invitée.
              </p>
            ) : null}
          </CardContent>
          <CardFooter>
            <form action={acceptAction} className="w-full">
              <Button type="submit" className="w-full" disabled={!emailMatches}>Accepter l'invitation</Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
