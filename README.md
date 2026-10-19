# SinkManager

**English** | [Simplified Chinese](README_CN.md)

Manage your own [Sink](https://github.com/ccbikai/Sink) URL shortener on iPhone and iPad with [Scriptable](https://scriptable.app/). A single JavaScript file with no additional runtime dependencies.

Current version: **3.0.6**. The default script provides a fully English interface. A Simplified Chinese edition is available as [SinkManager_CN.js](SinkManager_CN.js).

## Features

- WebView management interface with dark mode support.
- Configure your own HTTPS site and token on first launch; no embedded site or credentials.
- Tokens stored in Scriptable Keychain, isolated by site and never injected into the WebView.
- Link listing, cursor pagination, keyword search, and status and tag filters.
- Create, edit, delete, and copy short links, with confirmation before deletion.
- Automatically add `https://` when the destination URL has no protocol.
- Expiration date and time picker using the device's local timezone, converted to Unix seconds automatically.
- Tags, internal notes, link previews, mobile redirects, passwords, and advanced routing options.
- Readable analytics: visits, unique visitors, referrers, traffic trends, and rankings by referrer, country or region, device, and browser.
- HTTP status codes and error details, with the current token redacted from error response bodies.
- String-only WebView bridge results to avoid unsupported return types and Error 606.

## Installation and setup

1. Install Scriptable on your iPhone or iPad.
2. Download [SinkManager.js](SinkManager.js) and import it into Scriptable using the share menu, or create a new script and paste the entire file.
3. Run **SinkManager** inside the Scriptable app.
4. Tap **Settings** and enter your Sink site's root URL, for example `https://your-sink.example`. Do not include paths such as `/dashboard` or `/api`.
5. Enter the `NUXT_SITE_TOKEN` configured for your Sink deployment, then tap **Save and verify**. A `Bearer ` prefix is accepted but optional.
6. After successful verification, the link list loads. Each site uses its own token; leave the token blank to keep an existing saved token for that site.

This project contains no personal site, real token, or user data. Configuration entered at runtime is stored only in the device's Keychain; it is not written into the script or uploaded to this repository. When upgrading from an older personal script, enter your site and token again. Legacy Keychain entries are not automatically read or deleted.

## Usage

### Managing links

Tap **Create link** and enter a destination URL. Leave the slug blank to let the service generate one. Custom slugs support lowercase letters, numbers, and internal hyphens. The slug identifies an existing link and cannot be renamed in the editor.

Search matches slugs, URLs, notes, or tags and returns up to 1,000 results. Narrow your keyword if needed. The normal list shows 50 links per page; tap **Load next page** to continue. After changing status, sort order, or tag filters, tap **Search** or **Refresh**.

### Expiration

Use the date and time picker to select an expiration time in the device's local timezone. A new expiration must be in the future. Leaving the field empty creates a link without expiration or preserves an existing link's expiration when editing. The current API does not define how to clear expiration, so an empty field does not remove a saved expiration.

### Optional fields

Leave the password blank to keep the existing password, or select **Clear existing password** to remove it. Empty Apple / Google redirect fields preserve their existing values. Advanced JSON supports `geo`, `cloaking`, `redirectWithQuery`, `proxy`, and `unsafe`; boolean options use `true` or `false`.

### Analytics

Select the last 7, 30, or 90 days, then tap **Site analytics** or **Analytics** on a link. Trends are grouped by day using the device's IANA timezone. The total site link count is independent of the selected date range. Analytics must be configured in your Sink deployment; **No data** indicates that no records are available.

## API integration

Requests use Sink Bearer Token authentication. Check `/_docs/openapi.json` on your own instance for the API exposed by your deployment.

| Feature | Method | Path |
| --- | --- | --- |
| Verify configuration | GET | `/api/verify` |
| List links | GET | `/api/link/list` |
| Search links | GET | `/api/link/search` |
| Read a link | GET | `/api/link/query` |
| Create a link | POST | `/api/link/create` |
| Edit a link | PUT | `/api/link/edit` |
| Delete a link | POST | `/api/link/delete` |
| Count links | GET | `/api/link/count` |
| Traffic overview | GET | `/api/stats/counters` |
| Traffic trends | GET | `/api/stats/views` |
| Rankings | GET | `/api/stats/metrics` |

Trend requests include `unit`, `clientTimezone`, `startAt`, and `endAt`; ranking requests include `type`. Available fields and features may vary across Sink versions.

## Troubleshooting

- **HTTP 401 / 403:** Check the site URL, token, and deployment access controls.
- **HTTP 400:** Check the reported field format, slug, URL, and expiration date. Confirm that your Sink version supports the endpoint.
- **Analytics unavailable:** Check your Sink deployment's Cloudflare Analytics Engine configuration and traffic records.
- **Network request failed:** Check connectivity and the HTTPS certificate.
- **Where to run:** Run the script inside the Scriptable app. This script does not provide a home screen widget.

## Development checks

With Node.js 18 or later installed, run this from the repository directory:

```sh
node tests/check.cjs
```

The checks cover script and embedded WebView syntax, JSON request headers, HTTP errors, bridge return types, date conversion, and analytics parameters. They use mocked requests and do not create or delete links on a real service. They do not replace testing on an iOS device.

## Project relationship

SinkManager is an independent Scriptable client for the Sink API. It is not an official Sink or Scriptable application.
