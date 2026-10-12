# Revserp Handbook

The public `/handbook` routes use static, reviewed editorial content. They do not require a login, a database, a crawler request, or a model call. The frontend builds without the backend checkout.

- `handbook-types.ts`: guide content contract.
- `handbook-taxonomy.ts`: pillar and bucket descriptions.
- `seo-guides.ts`, `aeo-guides.ts`, `pagespeed-guides.ts`: the guides.
- `handbook-catalog.ts`: navigation, canonical paths, lookup, and search.
- `detector-manifest.json`: generated pillar, bucket, and issue IDs from the backend detectors.

## Update a guide

Check the detector code, not only general search guidance. Keep thresholds, units, scope, and conditional checks exact. Explain when a finding is intentional. A preview or successful edit does not clear an issue; verification needs a new crawl, and Google PSI findings also need fresh PSI data.

Prose supports inline Markdown. Put literal HTML tags inside backticks. Code examples are rendered as escaped text, not live HTML. External references explain the wider subject; they do not define Revserp's detector rules.

## Check detector changes

With the backend checkout next to the frontend:

```sh
bun run handbook:check
```

A different backend directory can be supplied as the first argument. This check runs the backend's export command; it does not connect to a database or a deployed service.

After a detector adds or removes an issue or bucket, regenerate the manifest from the backend directory:

```sh
go run ./cmd/handbook-catalog > ../revserp-frontend/app/content/handbook/detector-manifest.json
```

Update the guides and taxonomy to match. Then run:

```sh
bun test app/content/handbook/handbook-catalog.test.ts app/routes/handbook.test.tsx
bun run typecheck
bun run build
```
