# Moving the wedding site to AWS

**Date:** 2026-08-26
**Status:** design, awaiting review
**Wedding:** 2026-11-11, The Forest Barn, Alfonso, Cavite

## What this is

The site currently lives on GitHub Pages with two Google Apps Script web apps
behind it: one for RSVP, one for the guest photo album. A Google Sheet holds the
guest list, the RSVP responses and the album's config; a Drive folder holds the
photos and serves their thumbnails.

This moves all of it onto AWS, on a fresh account, before the wedding — and
plans the path back off afterwards.

## Why

The Apps Script backends work, but they are slow (1–3s cold), the album depends
on Drive's thumbnail service being timely (it often is not — `js/shareWall.js:96`
retries after 2500ms specifically because of this), and there is no single place
that owns the whole system.

The deciding factor was failure mode. Free hosting tiers protect your wallet by
disabling the project; AWS keeps serving and bills instead. For a one-night event
that cannot be rescheduled, an outage is unacceptable and a few pesos is not.

## Constraints

| Constraint | Value |
|---|---|
| Budget ceiling | ₱200/month |
| Expected cost | ~₱2/month, ~₱24/year |
| Custom domain | none — CloudFront URL, fronted by the existing GitHub Pages address |
| Account | fresh, **Paid Plan** (Free Plan closes the account after 6 months) |
| Region | `ap-southeast-1` (Singapore) |
| Guests | ~200 |
| Expected photos | ~1,000 at ~1 MB each |
| Wedding-night load | ~150 phones, ~5 hours |

## Architecture

### The central idea: reads are static, writes are functions

The album's wall polls every 15 seconds. At 150 phones that is ~10 requests per
second for five hours — about 180,000 requests. If each one reached a Lambda that
queried DynamoDB, the read load would be roughly 30 RCU against a 25 RCU free
ceiling, and the one night that matters would be the night the free tier tipped.

So the poll never reaches a function. The wall reads a **cached JSON object from
S3 through CloudFront**. CloudFront absorbs all 180,000 requests for free, and
DynamoDB is read a few times a minute instead of ten times a second.

Lambda handles writes only.

### Topology

```
GitHub Pages stub                     stable URL, what the printed QR points at
      |
      |  redirect, preserving ?key= and #hash
      v
CloudFront distribution
  |
  +-- /*                  -> S3 public bucket   hashed assets, 1-year immutable
  +-- /data/photos.json   -> S3 public bucket   15s TTL   <- the wall polls this
  +-- /data/gate.json     -> S3 public bucket   15s TTL   <- the gate check
  +-- /photos/*.jpg       -> S3 public bucket   1-year immutable
  +-- /api/*              -> Lambda Function URL, no cache
```

### Storage

Two buckets. The public one is everything CloudFront serves; the private one
holds the pre-decommission exports, which contain guest names and notes and must
never be reachable from the CDN.

```
jg-wedding-public/            (CloudFront origin, via Origin Access Control)
  index.html share.html admin.html
  css/ js/ media/
  photos/<id>.jpg             full size, ~1 MB
  photos/<id>_t.jpg           thumbnail, ~600px, ~60 KB
  data/gate.json              { open, opensAt, closesAt }
  data/guests.json            the invite list for RSVP type-ahead
  data/photos.json            the wall list

jg-wedding-private/           (no public access; Lambda only)
  exports/                    backups written before decommission
```

The public bucket is **not** publicly readable. CloudFront reaches it through
Origin Access Control; direct S3 URLs are refused. This keeps every byte behind
the CDN, where it is cached and free.

### DynamoDB

One table, `jg-wedding`, **provisioned at 25 RCU / 25 WCU with auto-scaling
explicitly disabled**.

One table rather than several because the free tier's 25 units are an
account-wide total, not per-table. Splitting into three tables means splitting
the same 25 units three ways.

| PK | SK | Item |
|---|---|---|
| `CONFIG` | `CONFIG` | `open_at`, `close_at`, `force_open` |
| `GUEST` | `<name-slug>` | `name`, `seats` |
| `RSVP` | `<name-slug>` | `name`, `attending`, `guests`, `note`, `ts` |
| `PHOTO` | `<photo-id>` | `id`, `tag`, `ts`, `hidden` |

Access patterns, all of which this key design serves directly:

- read config — `GetItem(CONFIG, CONFIG)`
- read the whole guest list — `Query(PK=GUEST)`, ~200 items, ~2 RCU
- read one guest by name — `GetItem(GUEST, slug)`
- write an RSVP — `PutItem(RSVP, slug)`
- write photo metadata — `PutItem(PHOTO, id)`
- list photos for the rebuild — `Query(PK=PHOTO)`

`admin_key` is **not** in DynamoDB and **not** in any S3 object. It is a Lambda
environment variable. It sits in the Sheet today only because the Sheet is
private; `data/gate.json` is public and would leak it.

Note that DynamoDB removes work rather than adding it in one place: `rsvp.gs`
currently scans the Responses sheet row by row to find and update an existing
answer, so that nobody can accept twice but anyone can change their mind.
`PutItem` on `(RSVP, slug)` is that behaviour for free.

### Functions

Two Lambdas, for the reason already written at the top of
`google-apps-script/photos.gs`: *"a bug in photo upload code on the wedding day
must not be able to take down the RSVP."* That reasoning survives the move.

**`api-photos`**

| Route | Does |
|---|---|
| `POST /api/photos/sign` | check the gate, return a presigned S3 PUT and a photo id |
| `POST /api/photos/hide` | admin only — mark hidden, rebuild `photos.json` |
| `GET /api/admin-check` | one-shot: is this `?key=` the admin key? |

**`api-rsvp`**

| Route | Does |
|---|---|
| `POST /api/rsvp` | validate against the guest list's seat allotment, write |

**`rebuild-photos`** — triggered by S3 `ObjectCreated` on `photos/`. Queries
`PK=PHOTO`, writes `data/photos.json`. If two uploads race, the loser's photo is
still in S3 and DynamoDB and the next rebuild includes it. Self-healing, and the
15-second cache hides the gap.

### Upload flow

Today a ~1 MB photo is base64-encoded and posted through Apps Script. Base64
inflates it by a third, and Lambda has a 10-second ceiling on this plan.

```
1. Browser shrinks to 2400px + a 600px thumbnail   (js/shareUpload.js)
2. POST /api/photos/sign     -> Lambda checks the gate, returns presigned PUTs
3. Browser PUTs both JPEGs straight to S3          <- never touches Lambda
4. S3 event fires rebuild-photos                   -> data/photos.json
```

No large payload passes through a function.

### Thumbnails

`js/shareUpload.js` already redraws each photo to 2400px on a canvas and
re-encodes as JPEG. Emitting a second ~600px JPEG from the same bitmap is a small
extension.

Without it the wall serves ~1 MB per tile: 150 phones browsing 300 tiles is
roughly 45 GB. That still fits CloudFront's 1 TB free tier, so this is not a cost
decision — it is a speed one. Venue wifi is the constraint, and ~3 GB moves
roughly fifteen times faster than ~45 GB.

### The gate

`google-apps-script/photos.gs` keeps its gate logic in four pure functions —
`parseConfig`, `truthy`, `parseWhen`, `gateState` — specifically so
`test/photoGate.test.js` can exercise them under plain Node. They move to
`lambda/lib/gate.js` unchanged, and the test file's `require` is repointed.

The gate is the one thing that must not be wrong, and it arrives on AWS with its
existing test coverage intact.

`gateState` fails shut on anything unreadable. That behaviour is preserved: an
album that will not open is a phone call; an album that opens itself three months
early is not fixable.

### Clock skew

`js/shareApi.js` currently corrects for wrong device clocks by reading a `now`
field from every response, so a phone with a bad clock cannot open the album
early. A cached response cannot carry a live `now`.

Instead, skew is read from the HTTP `Date` response header, which CloudFront sets
on every response and which is CORS-safelisted. Same correction, works on cached
responses.

### Admin

The Google Sheet is currently the entire control panel — `photos.gs` calls it
that in its header comment. Flipping `force_open` means typing in a cell.
DynamoDB has no equivalent surface, and navigating the AWS console during a
reception is not acceptable.

So: a minimal `admin.html?key=…` page, served from the same bucket. The four
config switches, and the list of photos with a hide control. It talks to
`api-photos` and is gated by the same `admin_key`.

This is a scope addition, not a port. It exists because the move to AWS removes
an admin UI that Google was providing for free.

## Client changes

| File | Change |
|---|---|
| `js/shareApi.js` | `ENDPOINT` to CloudFront; `list()` and `status()` read cached JSON; `upload()` becomes sign-then-PUT; skew from the `Date` header |
| `js/shareWall.js:11` | `THUMB` from Drive to `/photos/<id>_t.jpg` |
| `js/shareUpload.js` | emit a thumbnail alongside the original |
| `js/rsvp.js:13` | `ENDPOINT` to `/api/rsvp`; guest list from `/data/guests.json` |
| `admin.html` | new |

`window.W.shareApi` keeps its five-method shape — `configured`, `hasKey`, `tag`,
`now`, `status`, `list`, `upload`, `hide`. Nothing downstream of that boundary
changes, which is also what keeps a later move off AWS cheap.

## Deployment

GitHub Actions on push to `main`:

```
aws s3 sync . s3://jg-wedding-public --delete
aws cloudfront create-invalidation --paths /index.html /share.html /admin.html /data/*
```

Only unhashed paths are invalidated. Hashed assets never need it, which keeps
this far below the 1,000 free invalidation paths per month.

## Guardrails

Before any resource is provisioned:

- **AWS Budgets alert at $3** (₱185, just under the ₱200 ceiling), with a Budget
  Action attached. An alert emails; an action enforces.
- **DynamoDB in provisioned mode, auto-scaling disabled.** On-demand mode is not
  covered by the free tier, and auto-scaling silently raises billable capacity.
  These are the only two ways this stack can cost real money.
- **CloudWatch log retention set to 1 day** on every function. The default is
  "never expire".
- **CloudWatch alarms** on `ThrottledRequests > 0` and
  `ConsumedReadCapacityUnits > 20`.

## The QR code

`media/qr/share-qr.svg` currently encodes
`https://juriel09.github.io/juriel-grace-wedding/share.html` — decoded and
confirmed. `media/qr/table-card.html` lays that out in inches for printing.

Since there is no custom domain, and a CloudFront distribution's hostname changes
if it is ever deleted and recreated, the GitHub Pages address stays the public
front door: two redirect stubs (`index.html`, `share.html`) that forward to
CloudFront.

The stubs must forward `location.search` and `location.hash`. A bare
`<meta refresh>` drops the query string, and the admin key travels as `?key=`
(read at `js/shareApi.js:15`). Losing it silently disables the hide controls.

The printed QR therefore never needs re-cutting, and survives any CloudFront
rebuild. `tools/make-qr.js:12` still holds `REPLACE-ME.example.com` as its
default and should be set to the GitHub Pages URL so nobody regenerates a broken
card.

## Cost

| | Sep / Oct | Nov | Dec onward |
|---|---:|---:|---:|
| S3 storage | ₱0.11 | ₱1.65 | ₱1.65 |
| S3 requests | ₱0.12 | ₱0.43 | ₱0.12 |
| CloudFront | ₱0 | ₱0 | ₱0 |
| Lambda | ₱0 | ₱0 | ₱0 |
| DynamoDB | ₱0 | ₱0 | ₱0 |
| CloudWatch | ₱0 | ₱0 | ₱0 |
| **Total** | **₱0.23** | **₱2.08** | **₱1.77** |

About ₱24 for the first year — roughly 1% of the ₱200 ceiling. Billed monthly in
arrears; nothing is paid upfront.

## After the wedding

Uploads stay open **2–4 weeks** past the day; guests get home, find photos on
their phones, and come back. At ₱2/month there is no reason to rush.
Decommission around mid-December.

An archive needs no backend at all — no uploads, no RSVP, no gate, and a
read-only wall. So the teardown is:

1. Freeze uploads while Lambda still runs — `force_open` false, `close_at` past.
2. **Export before deleting.** `PK=PHOTO` to `media/photos.json`; `PK=RSVP` to a
   CSV. That CSV is the record of who came to the wedding.
3. `aws s3 sync` the photos to a local drive and one other place.
4. Point `js/shareApi.js` at the static JSON; remove the upload UI, not just the
   endpoint.
5. **Verify the wall renders.**
6. Only then delete the Lambdas, the table, the log groups and the IAM roles.

Deleting the backend before verifying the static swap leaves a dead album with
nothing to roll back to.

| Service | Fate |
|---|---|
| Lambda functions and Function URLs | delete |
| DynamoDB table | delete after export |
| CloudWatch log groups | delete — they outlive their function |
| IAM roles and policies | delete |
| S3 buckets | keep |
| CloudFront | keep |
| GitHub Pages stub | keep |

Running cost afterwards: ~₱1.77/month, S3 storage only.

## Out of scope

The site carries ~18 MB of avoidable payload — 4.9 MB of unreferenced PNGs
(`media/art/tree.png`, `media/art/bird.png`, both confirmed to have zero
references), 10.1 MB of Three.js textures still in PNG in a codebase that is
otherwise 380 WebP files, and a 3 MB MP3 loaded with `preload="auto"` at
`index.html:80`. `js/lib/preloader.js:20` also fires all 190 card frames in one
unbounded loop, so the first frame — which gates the intro appearing — competes
with 189 siblings.

None of that is a hosting problem and none of it is addressed here. It is worth
more to guests than this migration is, and belongs in its own plan.

## Open questions

1. **`admin.html` scope.** Speccing it as the four config switches plus a hide
   list. Confirm that is enough, or say what else the control panel needs.
2. **Cutover date.** The Apps Script backends should keep running until AWS is
   verified end to end. Proposal: build on AWS, test with real uploads, switch
   the GitHub Pages stubs last — that redirect is the single cutover point, and
   the single rollback.
