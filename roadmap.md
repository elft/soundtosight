## Inprogress

- [ ] Save visual → short‑form video export (30s) with destination presets | area: Video | owner: TBD | tags: video;export;social | release: TBD | notes: Phase 1 saves locally; later phases add social auto‑sharing.
  - [x] 30‑second duration cap
  - [x] Destination‑specific encoding/aspect presets
  - [x] Local save (Phase 1)
  - [ ] Social network auto‑share (Phase 2)
  - [ ] Get SoundClouds approval to also save audio (muted by default due to licensing)

## TBD

- [ ] User created visuals with phased sharing | area: Visuals | owner: TBD | tags: creation;sharing;community;agents | release: TBD | notes: Manual step uses a user‑chosen agent to upload required context files.
  - [ ] Local Only mode (store & render locally; no network) (Phase 1)
  - [ ] Reviewed → Shared to community (manual review & approval)
  - [ ] Auto‑create & auto‑share to community (Phase 2)

- [ ] Model integration for programmatic visuals + auto feedback | area: AI | owner: TBD | tags: genai;automation;feedback | release: TBD | notes: Support model of choice; generate visuals programmatically and ingest feedback automatically.
  - [ ] Model selection & credentials management
  - [ ] Prompt/constraints schema for generation
  - [ ] Automatic feedback capture (ratings/comments/metrics)
  - [ ] Regeneration loop based on feedback

- [ ] Authentication & accounts (MVP) | area: Security | owner: TBD | tags: auth;oidc;mfa;accounts | release: TBD | notes: Core sign-in flows and account lifecycle.
  - [ ] Email/password sign-up with secure hashing (Argon2/bcrypt)
  - [ ] OAuth/OIDC providers (Google, GitHub) with verified emails
  - [ ] Email verification and password reset (rate-limited)
  - [ ] Sessions via HttpOnly SameSite cookies + CSRF protection
  - [ ] Refresh-token rotation and revocation
  - [ ] Optional MFA (TOTP or WebAuthn)
  - [ ] Account deletion and data export

- [ ] User preferences & settings (sync) | area: UX | owner: TBD | tags: settings;sync;localstorage | release: TBD | notes: Remember choices across sessions and devices.
  - [ ] Preferences schema (JSON) with migrations
  - [ ] UI for theme, default model, visual defaults, privacy defaults
  - [ ] Persist on server with localStorage fallback
  - [ ] Sync across devices with conflict resolution
  - [ ] Import/export preferences (JSON)

- [ ] Docs & onboarding | area: Docs | owner: TBD | tags: docs;tutorials;templates | release: TBD | notes: Short path to first visual/video.
  - [ ] Quickstart and templates
  - [ ] “Create first visual” walkthrough
  - [ ] Troubleshooting guide
  - [ ] Changelogs and roadmap page

- [ ] Privacy, consent & compliance baseline | area: Compliance | owner: TBD | tags: gdpr;ccpa;privacy | release: TBD | notes: User rights and transparent processing.
  - [x] Privacy policy and Terms of Service
  - [ ] Cookie/telemetry consent and settings
  - [ ] Data subject requests (export/delete)
  - [ ] DPIA and records of processing

- [ ] Feature flags & staged rollout | area: Infra | owner: TBD | tags: flags;rollout;experiments | release: TBD | notes: Safer delivery of new features.
  - [ ] Flags service and kill switches
  - [ ] Canary/beta cohorts
  - [ ] A/B experiment hooks
  - [ ] Metrics-driven graduation