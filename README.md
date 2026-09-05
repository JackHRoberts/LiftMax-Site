# LiftMax site

The public site for [LiftMax](https://liftmax.co.uk), served by GitHub Pages
from `main` at the repo root. No build step, no Actions — the files here are
the files that get served.

```
index.html          homepage
privacy/index.html  privacy policy  →  https://liftmax.co.uk/privacy/
404.html            served for any missing path
styles.css          shared by all three
CNAME               the custom domain; deleting it unsets it in Pages
favicon.png         196×196, from the app repo's assets/
icon.png            1024×1024, used as the og:image
```

## Why this repo exists

It replaces two: `jackhroberts.github.io` (homepage) and `LiftMax-Privacy`
(policy). Both were on `github.io`, and that is the whole problem — `github.io`
is on the [Public Suffix List](https://publicsuffix.org/), so Google Cloud
Console will not accept it as an OAuth **authorized domain**. Without one, the
consent screen for the Drive backup sign-in cannot be configured. `liftmax.co.uk`
is a top private domain and is accepted.

A custom domain can only be attached to one repository per account, which is
why the two sites had to merge rather than sit side by side.

## Things that will bite

- **The policy text is load-bearing.** It is the document Play Console's
  data-safety declaration is written against — see `docs/play-data-safety.md`
  in the app repo. Change one and the other has to change with it. When the
  policy moved in here its wording was preserved byte for byte; only the
  presentation changed.
- **The Search Console token did not carry over.** Verification is per
  property, so the token that verified `jackhroberts.github.io` is worthless
  for `liftmax.co.uk`. Verify the new domain in Search Console **as the same
  Google account that owns the Cloud project**, or Cloud Console will not offer
  it in the authorized-domains list. A DNS TXT *Domain* property is preferable
  to the meta tag — it covers apex, `www` and both schemes at once. If you use
  the meta-tag method instead, there is a commented-out slot in `index.html`.
- **Paths are relative on `index.html` and `privacy/index.html`, root-relative
  on `404.html`.** Deliberate, and each file says why: the 404 is served for a
  missing URL at any depth, so a relative href would resolve against whatever
  the visitor mistyped.
- **There is no preview URL while `CNAME` exists.** Pages 301s
  `jackhroberts.github.io/LiftMax-Site/` straight to `liftmax.co.uk`, so the
  project URL cannot be used to check the site before DNS is pointed. Delete
  `CNAME` on a branch to preview, or open the files locally
  (`python3 -m http.server --directory .`, noting that it will not serve
  `404.html` for misses the way Pages does).
- **`CNAME` is not decorative.** GitHub Pages reads it as the custom-domain
  setting. Removing the file unsets the domain.

## DNS

Apex `A` records — all four, GitHub load-balances across them:

```
185.199.108.153   185.199.109.153   185.199.110.153   185.199.111.153
```

`AAAA`:

```
2606:50c0:8000::153  2606:50c0:8001::153  2606:50c0:8002::153  2606:50c0:8003::153
```

`CNAME  www → jackhroberts.github.io.` (trailing dot). GitHub redirects `www`
to the apex once the apex is set as the custom domain.

Then in **Settings → Pages**: set the custom domain, wait for the DNS check,
then tick **Enforce HTTPS**. Certificate issuance can take up to an hour after
DNS propagates.

## After the domain is live

Repoint everything that still names the old URLs:

- Play Console → store listing → privacy policy URL
- `docs/play-data-safety.md` in the app repo
- Google Cloud Console → OAuth consent screen → homepage and authorized domain
- The old `jackhroberts.github.io` and `LiftMax-Privacy` repos — leave them up
  serving a redirect, or archive them, but don't delete while anything still
  links to them.
