import { legalConfig } from "@/features/legal/config";
import {
  LegalDocumentPage,
  type LegalDocumentSection,
  LegalList,
  LegalParagraph,
  LegalSubheading,
} from "@/features/legal/components/legal-document-page";

const securitySections: LegalDocumentSection[] = [
  {
    id: "overview",
    title: "1. Overview",
    content: (
      <>
        <LegalParagraph>
          Security is foundational to how {legalConfig.companyName} is built and
          operated. This page describes the technical and organizational
          measures we use to protect your data across encryption, authentication,
          access control, infrastructure, and compliance.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "encryption",
    title: "2. Encryption",
    content: (
      <>
        <LegalSubheading>In Transit</LegalSubheading>
        <LegalParagraph>
          All data transmitted between your browser and {legalConfig.companyName}{" "}
          is encrypted using TLS 1.3. This applies to all pages, API endpoints,
          and file uploads. Older TLS versions are not supported.
        </LegalParagraph>
        <LegalSubheading>At Rest</LegalSubheading>
        <LegalParagraph>
          Data stored in our database and file storage is encrypted at rest
          using AES-256 via {legalConfig.storageProvider}. Encryption keys are
          managed by the infrastructure provider and rotated automatically.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "authentication",
    title: "3. Authentication",
    content: (
      <>
        <LegalParagraph>
          {legalConfig.companyName} supports multiple authentication methods to
          balance security and convenience:
        </LegalParagraph>
        <LegalList
          items={[
            <>
              <span className="text-foreground">Email verification:</span>{" "}
              All accounts require a verified email address before access is
              granted.
            </>,
            <>
              <span className="text-foreground">OAuth:</span> Sign in with
              Google for passwordless access via trusted identity providers.
            </>,
            <>
              <span className="text-foreground">Magic links:</span>{" "}
              Passwordless email-based sign in for reduced credential risk.
            </>,
            <>
              <span className="text-foreground">MFA (roadmap):</span>{" "}
              Multi-factor authentication is on our roadmap for additional
              account protection.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "access-control",
    title: "4. Access Control",
    content: (
      <>
        <LegalParagraph>
          {legalConfig.companyName} enforces strict data isolation between
          businesses:
        </LegalParagraph>
        <LegalList
          items={[
            <>
              <span className="text-foreground">Role-based access:</span>{" "}
              Users are assigned roles (owner, member) that determine what
              actions they can perform within a business.
            </>,
            <>
              <span className="text-foreground">
                Business-scoped isolation:
              </span>{" "}
              All queries and mutations are scoped to the active business
              context. Users cannot access data belonging to other businesses.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "infrastructure",
    title: "5. Infrastructure",
    content: (
      <>
        <LegalList
          items={[
            <>
              <span className="text-foreground">Hosting:</span>{" "}
              {legalConfig.companyName} is deployed on{" "}
              {legalConfig.hostingProvider}, which provides automatic scaling,
              DDoS protection, and edge network distribution.
            </>,
            <>
              <span className="text-foreground">Database and storage:</span>{" "}
              {legalConfig.storageProvider} hosts the PostgreSQL database and
              file storage in the configured project region, with automated
              backups and point-in-time recovery.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "compliance",
    title: "6. Compliance Alignment",
    content: (
      <>
        <LegalParagraph>
          {legalConfig.companyName} aligns its data handling practices with the
          following frameworks:
        </LegalParagraph>
        <LegalList
          items={[
            <>
              <span className="text-foreground">
                Data Privacy Act of the Philippines (Republic Act No. 10173):
              </span>{" "}
              As a Philippines-based company, we comply with the national data
              privacy law governing the collection, processing, and storage of
              personal information.
            </>,
            <>
              <span className="text-foreground">GDPR-aligned practices:</span>{" "}
              We follow GDPR principles including data minimization, purpose
              limitation, lawful basis for processing, and data subject rights
              regardless of user location.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "security-headers",
    title: "7. Security Headers",
    content: (
      <>
        <LegalParagraph>
          {legalConfig.companyName} applies the following HTTP security headers
          to all responses:
        </LegalParagraph>
        <LegalList
          items={[
            <>
              <span className="text-foreground">
                Strict-Transport-Security (HSTS):
              </span>{" "}
              Forces browsers to connect only over HTTPS, preventing downgrade
              attacks.
            </>,
            <>
              <span className="text-foreground">
                Content-Security-Policy (CSP):
              </span>{" "}
              Restricts script, style, and resource origins to prevent
              cross-site scripting and injection attacks.
            </>,
            <>
              <span className="text-foreground">X-Frame-Options:</span>{" "}
              Prevents the application from being embedded in iframes,
              protecting against clickjacking.
            </>,
            <>
              <span className="text-foreground">X-Content-Type-Options:</span>{" "}
              Prevents browsers from MIME-sniffing responses, reducing drive-by
              download risk.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "responsible-disclosure",
    title: "8. Responsible Disclosure",
    content: (
      <>
        <LegalParagraph>
          We welcome responsible security research. If you discover a
          vulnerability in {legalConfig.companyName}, please report it to us
          so we can address it promptly.
        </LegalParagraph>
        <LegalSubheading>Contact</LegalSubheading>
        <LegalParagraph>
          Report vulnerabilities to{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href="mailto:security@requo.app"
          >
            security@requo.app
          </a>
          .
        </LegalParagraph>
        <LegalSubheading>Scope</LegalSubheading>
        <LegalParagraph>
          Eligible targets include the {legalConfig.domain} domain, its
          subdomains, and APIs. Out of scope: third-party services, social
          engineering, denial-of-service, and physical attacks.
        </LegalParagraph>
        <LegalSubheading>Safe Harbor</LegalSubheading>
        <LegalParagraph>
          We will not pursue legal action against researchers who report
          vulnerabilities in good faith, follow responsible disclosure
          practices, and avoid accessing or modifying other users&apos; data.
        </LegalParagraph>
        <LegalSubheading>Response</LegalSubheading>
        <LegalParagraph>
          We aim to acknowledge reports within 5 business days and will work
          with you to understand and resolve the issue. We ask that you give us
          reasonable time to address the vulnerability before any public
          disclosure.
        </LegalParagraph>
        <LegalParagraph>
          For machine-readable security contact details, see our{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href="/.well-known/security.txt"
          >
            security.txt
          </a>
          .
        </LegalParagraph>
      </>
    ),
  },
];

export function SecurityPage() {
  return (
    <LegalDocumentPage
      content={securitySections}
      effectiveDate={legalConfig.effectiveDate}
      title="Security"
    />
  );
}
