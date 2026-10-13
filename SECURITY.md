# Security Policy

## Supported versions

Requo is pre-1.0. Security fixes land on the latest `main`. If you run a fork, keep it rebased.

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities.

- Use GitHub **Security Advisories** (Report a vulnerability) on this repository, or
- Open a minimal issue titled `[security]` with no exploit details and ask for a private contact.

Include: affected version/commit, reproduction steps, impact, and any logs (redact secrets).

We aim to acknowledge within 72 hours and to ship or coordinate a fix promptly. Please avoid automated scanning that degrades shared demo infrastructure.

## Scope notes

- Auth: Better Auth only. Report session, password-reset, OAuth, or tenant-isolation (`businessId`) issues with highest priority.
- Secrets: never commit `.env.local`, service-role keys, or webhook secrets. Rotate immediately if exposed.
