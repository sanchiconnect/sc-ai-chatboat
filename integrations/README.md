# Installing the chat on a website

Every platform below does the same thing: it makes the SanchiJawab loader snippet (from the dashboard's **Install** tab)
appear on every page. After installing, open the Install tab and press **Check installation**.

| Platform | What to do | Needs |
|---|---|---|
| Any website | Paste the snippet just before `</body>` on every page. | Access to the page templates |
| WordPress | Upload `integrations/dist/sanchijawab-chat.zip` (Plugins > Add New > Upload), activate, then Settings > SanchiJawab Chat and paste the Bot ID and two addresses. | Admin on the site |
| Shopify (simple) | Online Store > Themes > Edit code > `layout/theme.liquid`, paste the snippet before `</body>`, Save. | Theme editing |
| Shopify (app embed) | `integrations/shopify/` is a theme app extension. Deploy it with the Shopify CLI to a Partner app, install the app, then Customize theme > App embeds > SanchiJawab Chat. **Not tested** (needs a Shopify Partner account). | Shopify Partner account |
| Webflow | Project settings > Custom code > **Footer code**, paste the snippet, Save, **Publish**. | A paid Site plan |
| Google Tag Manager | Tags > New > **Custom HTML**, paste the snippet, trigger **All Pages**, Save, **Submit/Publish** the container. | GTM already on the site |
| Wix | Settings > Custom code > Add code, paste, place in **Body - end**, apply to **All pages**. | Premium plan |
| Squarespace | Settings > Advanced > Code injection > **Footer**, paste, Save. | Business plan or higher |
| React / Next.js / other single-page apps | Put the snippet in `index.html` (or the root layout). The chat stays on across page changes. | A code change |

## Controlling it from your own page

```js
SanchiJawab.open();                                   // open the chat
SanchiJawab.close();
SanchiJawab.identify({ name: "Asha", email: "asha@example.com" });   // pre-fill the contact form
```

These are safe to call before the chat has finished loading; they run as soon as it is ready.

## Notes

- The Bot ID, API address and Widget address are all shown on the Install tab of the dashboard.
- Only domains listed in your assistant's "Allowed domains" (Bot settings) can load the chat. Leave it empty while testing.
- The WordPress plugin is checked by `php integrations/wordpress/tests/run.php` (13 checks, no WordPress needed).
- Rebuild the WordPress zip with `python integrations/build_wordpress_zip.py`.
