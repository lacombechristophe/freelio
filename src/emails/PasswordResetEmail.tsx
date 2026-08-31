import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components"

export function PasswordResetEmail({ url, appName }: { url: string; appName: string }) {
  return (
    <Html>
      <Head />
      <Preview>Réinitialisez votre mot de passe {appName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>{appName}</Heading>
          <Text style={text}>Une demande de réinitialisation a été reçue pour votre compte.</Text>
          <Section style={buttonContainer}><Button style={button} href={url}>Choisir un nouveau mot de passe</Button></Section>
          <Text style={text}>Ce lien expire dans 30 minutes et ne peut être utilisé qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</Text>
          <Hr style={separator} />
          <Text style={footer}>Aucun membre de l’équipe ne vous demandera votre mot de passe ou votre code MFA.</Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: "#ffffff", fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }
const container = { margin: "0 auto", padding: "24px 0 48px", width: "560px" }
const heading = { color: "#111827", fontSize: "24px", fontWeight: "700", textAlign: "center" as const, margin: "28px 0" }
const text = { color: "#374151", fontSize: "16px", lineHeight: "26px" }
const buttonContainer = { textAlign: "center" as const, margin: "30px 0" }
const button = { backgroundColor: "#0866ff", borderRadius: "8px", color: "#ffffff", display: "block", fontSize: "16px", fontWeight: "700", padding: "16px", textDecoration: "none" }
const separator = { borderColor: "#e5e7eb", margin: "24px 0" }
const footer = { color: "#6b7280", fontSize: "12px", lineHeight: "20px" }
