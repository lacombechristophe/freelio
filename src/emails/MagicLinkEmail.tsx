import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Link,
} from "@react-email/components";
import * as React from "react";

interface MagicLinkEmailProps {
  url: string;
  host: string;
}

export const MagicLinkEmail = ({ url, host }: MagicLinkEmailProps) => (
  <Html>
    <Head />
    <Preview>Connectez-vous à votre espace Diskoov</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Diskoov</Heading>
        <Text style={text}>
          Bonjour,
        </Text>
        <Text style={text}>
          Cliquez sur le bouton ci-dessous pour vous connecter en toute sécurité à votre tableau de bord sur <strong>{host}</strong>.
        </Text>
        <Section style={buttonContainer}>
          <Button style={button} href={url}>
            Se connecter à mon espace
          </Button>
        </Section>
        <Text style={text}>
          Ce lien est valable 10 minutes. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.
        </Text>
        <Hr style={hr} />
        <Link href="https://diskoov.fr" style={footerLink}>
          Diskoov — Votre espace ventes, chantiers et service client.
        </Link>
      </Container>
    </Body>
  </Html>
);

export default MagicLinkEmail;

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  width: "560px",
};

const h1 = {
  color: "#000000",
  fontSize: "24px",
  fontWeight: "bold",
  textAlign: "center" as const,
  margin: "30px 0",
};

const text = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "26px",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "30px 0",
};

const button = {
  backgroundColor: "#000000",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "16px",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "16px",
  fontWeight: "bold",
};

const hr = {
  borderColor: "#cccccc",
  margin: "20px 0",
};

const footerLink = {
  color: "#999",
  fontSize: "12px",
  textDecoration: "underline",
};
