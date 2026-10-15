# DesignOS browser extension privacy policy

Effective October 15, 2026.

The DesignOS extension sends what you choose to save to the DesignOS app on your own computer. It has no servers, accounts, analytics or advertising, and nothing it handles is sent to us or to anyone else.

## What the extension reads

When you act:

- **Toolbar and right-click actions.** The address and title of the current page, the image, link or video you chose, or a screenshot of the visible page or of an area you select.
- **Saving a post on X, Instagram, Cosmos, Pinterest or LinkedIn.** When you click that site's own Save or Bookmark button, the extension reads the post already shown on the page: its link, author, text, and image or video addresses, or a still of a playing video that has no cover image. For any post on X or Instagram, it then looks the post up in your own saved list on that site (see below) to find the video file's address, complete carousel media or, for an X Article, the article's title, text and picture addresses.
- **Import saves.** For X and Instagram, the extension reads your own saved list on that site, page by page, until it has the number you chose or reaches the end. If it can't, or for Pinterest, LinkedIn and Cosmos, it reads the posts on your saved-posts page and scrolls that page, opening it in a new tab if you're not on it. It runs only after you click a source in the popup and stops when you click Stop. Saved-list imports can continue while you use another tab; page-scrolling imports also stop when you leave the source tab or navigate away.

In the background, without you clicking anything:

- **New X bookmarks and Instagram saves.** From installation, the extension schedules checks of the first page of your own X bookmarks every 2 minutes and of your own Instagram saved posts every 5 minutes. X checks begin after you first visit Bookmarks in this browser. It uses the account you're signed in to in this browser, so saves you make on your phone arrive too. The first successful read establishes a baseline; later checks send newly seen posts to DesignOS. Saves already present at that first read need an import you start. If you're signed out, it stops checking that site until you open it again. To read your X bookmarks, it notes the request X's own bookmarks page sends when your browser loads it (its address and headers, including X's anti-forgery token, but not your cookies) and repeats it. It reads nothing else on X or Instagram this way, and nothing on any other site.

It does not read website cookies, website passwords, form fields or your browser's history database. Apart from these saved-list checks and lookups, and imports you start, it makes no requests to the sites you visit, and it does nothing on other sites until you click it.

This handling includes website content; names and usernames shown on selected posts; the URLs, titles and save times of selected references; the Save/Bookmark actions needed to capture them; and the local connection code you enter to pair the app. It does not record unrelated browsing, mouse movement, your own scrolling, or keystrokes. The connection code authenticates only your local DesignOS app, not any website account.

## Where the data goes

Captures are sent only to the DesignOS app over your computer's local loopback address (`127.0.0.1`). The app and extension authenticate each other with a connection code copied from the app; captures and acknowledgments are encrypted. They never leave your computer through the extension. To save an image or video, the DesignOS app downloads it from the public address the post or page already uses.

## What the extension stores

In the browser's local extension storage:

- captures waiting for the app to open, and failed captures until you retry or clear them
- the IDs of X and Instagram posts already sent, so a post is not sent twice
- for the background check: the IDs of up to 2,000 posts per site it has already seen, when it last checked, and for X the remembered bookmarks request with its headers (no cookies)
- the connection code, accessible only to trusted extension contexts
- the app's local address, and the last status message

Removing the extension deletes this storage. Everything you save lives in your DesignOS library on your computer, under your control.

## Permissions

At installation the extension asks for access to x.com and instagram.com (to read your own saved lists), pinterest.com, linkedin.com and cosmos.so (to read a saves page it opens for an import you start), and to observe requests (only to note X's bookmarks request). It already runs on those five sites to notice your Save clicks. To stop the background check, remove the extension.

## Sharing and sale

We do not sell, share or transfer your data, use it for advertising, or use it for any purpose other than saving your references into DesignOS. Our use of this information follows the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Changes and contact

If this policy changes, the new version will carry a new effective date. For support or privacy questions, [open an issue](https://github.com/dhruv465/DesignOS/issues). Store contact details will also be listed on the DesignOS store page when it is published. Do not include private references, connection codes or other credentials when requesting support.
