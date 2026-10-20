# YouTube API setup

DigitBox shows popular YouTube videos, Shorts and search results through the
**YouTube Data API v3**. It needs one API key, set as `YOUTUBE_API_KEY` on the
hosting platform. Until the key is set, the site shows only the DigitBox
channel's own videos, so nothing breaks in the meantime.

## 1. Create the key (Google Cloud, free)

1. Open <https://console.cloud.google.com/> and sign in.
2. Create a project: project picker at the top → **New project** → name it
   (e.g. `digitbox`) → **Create**, then select it.
3. Enable the API: **APIs & Services → Library** → search **YouTube Data API v3**
   → **Enable**.
4. Create the key: **APIs & Services → Credentials → Create credentials →
   API key**. Copy it.
5. Restrict the key (click its name):
   - **API restrictions → Restrict key →** tick only **YouTube Data API v3** → **Save**.
   - **Application restrictions → None.** The key is only used by the DigitBox
     server, never in the browser. A "Websites" restriction would block the
     server's requests, and Cloudflare/Vercel don't have fixed IP addresses.

Keep the key private: don't commit it to GitHub or paste it into the site's code.

## 2. Add it to the hosting platform

The key is read when the site is **running**, so set it where the site is
deployed, not as a GitHub repository secret.

**Cloudflare Pages (digitbox.dev):** Cloudflare dashboard → **Workers & Pages**
→ **digitbox** → **Settings → Variables and Secrets → Add**. Name
`YOUTUBE_API_KEY`, paste the key as the value, click **Encrypt** (so it's stored
as a secret), then **Save**. Do this for **Production**, and for **Preview** too
if you want PR previews to show YouTube videos.

**Vercel (if you deploy there too):** Project → **Settings → Environment
Variables**. Name `YOUTUBE_API_KEY`, paste the value, set **Type** to
**Secret**, tick **Production** (and **Preview**), then **Save**.

Then **redeploy**. Variables only reach deployments made after you add them.
The simplest way is to push any commit to `main`. Alternatively: on Cloudflare,
open **Deployments** and start a new production deployment; on Vercel, open
**Deployments → ⋯ → Redeploy**.

Optional: `YOUTUBE_REGION` (two-letter country code, e.g. `US`) shows every
visitor that country's popular videos. If it's unset, each visitor gets their
own country's. Setting it uses less quota because there are fewer separate lists to cache.

## 3. Check it works

Open `https://digitbox.dev/api/youtube?feed=status`:

| Response | Meaning |
| --- | --- |
| `{"configured":true,"ok":true,…}` | Working. The home page now shows recommended YouTube videos. |
| `{"configured":false,…}` | The site can't see the key. Check the variable name, then redeploy. |
| `"reason":"accessNotConfigured"` or `"SERVICE_DISABLED"` | YouTube Data API v3 isn't enabled in that Google Cloud project (step 1.3). |
| `"reason":"API_KEY_SERVICE_BLOCKED"` | The key's API restriction doesn't include YouTube Data API v3. |
| `"reason":"API_KEY_HTTP_REFERRER_BLOCKED"` or `"API_KEY_IP_ADDRESS_BLOCKED"` | Set Application restrictions to **None** (step 1.5). |
| `"reason":"keyInvalid"`, `"badRequest"` or `"API_KEY_INVALID"` | The key was copied wrong or deleted. Paste it again and redeploy. |
| `"reason":"quotaExceeded"` | Today's quota is used up. It resets at midnight Pacific time. |

## Quota (free)

Google gives each project two daily allowances, both reset at midnight
Pacific time:

- **10,000 units** for everything except search. Popular charts, Shorts,
  channel uploads and video details cost 1 unit per call.
- **100 searches**, used only when someone searches in the top bar.

DigitBox caches everything (popular lists for an hour, Shorts for six hours,
searches for twelve), so most visits cost nothing. Each search is cached too,
so a repeat of the same search is free. If the site gets busy enough to hit
these limits, the pages keep showing the last good results.
Usage is under **APIs & Services → YouTube Data API v3 → Quotas**. Google
offers more quota through its free
[audit and quota extension form](https://support.google.com/youtube/contact/yt_api_form).

## Ads

Videos play in YouTube's own embedded player, so YouTube decides whether to
show ads. The YouTube API Services policies don't allow blocking, hiding, or
skipping those ads, and doing so can get the key and project banned.
`youtube-nocookie.com` (which DigitBox uses) only makes the ads
non-personalized. Viewers with YouTube Premium who are signed in to YouTube in
the same browser may see fewer ads, depending on YouTube.
