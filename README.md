# RM6785 ROM posts

Every ROM, recovery and kernel announced in [@RM6785](https://t.me/RM6785) starts as an issue
here. You describe your build in one JSON file, a bot checks it and shows you exactly how the
post will look, an admin approves it, and it goes out to the channel.

The JSON stays in this repo afterwards, so there's a permanent record of every build instead of
it only existing as a channel message.

## Posting a build

1. [Open a post request.](../../issues/new?template=rom-post.yml)
2. Paste your JSON into the box. Copy one of the examples to start from —
   [ROM](../../blob/tooling/examples/rom.json),
   [recovery](../../blob/tooling/examples/recovery.json),
   [kernel](../../blob/tooling/examples/kernel.json).
3. The bot replies in about a minute. If something's wrong it tells you which field and why, so
   edit the issue and it checks again.
4. An admin adds the `approved` label and the bot posts it. Your JSON gets committed and the
   issue closes.

A passing check isn't a promise to post — nothing reaches the channel until an admin approves it.

## What goes in the JSON

A ROM, a recovery and a kernel need slightly different things. Leave out anything marked `–`.

| Key                  | ROM | Recovery | Kernel | What it is                                                             |
| -------------------- | :-: | :------: | :----: | ---------------------------------------------------------------------- |
| `postType`           |  ✓  |    ✓     |   ✓    | `rom`, `recovery` or `kernel`                                          |
| `name`               |  ✓  |    ✓     |   ✓    | Complete displayed name, including version — `Infinity-X 3.12`         |
| `tag`                |  ✓  |    ✓     |   ✓    | One-word hashtag and folder name, without `#` — `InfinityX`, `PBRP`    |
| `stability`          |  ✓  |    ✓     |   ✓    | `STABLE`, `BETA` or `ALPHA`                                            |
| `releaseType`        |  ✓  |    ✓     |   –    | `OFFICIAL` or `UNOFFICIAL`                                             |
| `device`             |  ✓  |    ✓     |   ✓    | `RM6785` for every device, or `nemo` / `salaa` for one family          |
| `androidVersion`     |  ✓  |    –     |   –    | `16`, or `16 QPR1` if you want to be specific                          |
| `kernelVersion`      |  –  |    –     |   ✓    | `4.14.336`                                                             |
| `ruiVersion`         |  ✓  |    ✓     |   ✓    | `1`, `2` or `3`                                                        |
| `author`             |  ✓  |    ✓     |   ✓    | Your name or handle. Inline links work: `[ELOHIM](https://...)`        |
| `buildDate`          |  ✓  |    ✓     |   ✓    | `2026-08-17`. Shown in the post as `17-08-2026`                        |
| `banner`             |  ✓  |    ✓     |   ✓    | Direct link to the image or GIF at the top of the post                 |
| `changelog`          |  ✓  |    ✓     |   ✓    | List of lines, one per bullet. Inline `[text](https://...)` links work |
| `bugs`               |  ✓  |    ✓     |   ✓    | Same. Write `None known` rather than leaving it empty                  |
| `notes`              |     |          |        | Same, optional                                                         |
| `download.buildType` |  ✓  |    –     |   –    | `Vanilla`, or `GAPPS \| VANILLA` when both are available               |
| `download.fileSize`  |  ✓  |    ✓     |   ✓    | `1.5 GB`, `69MB`, or paired as `2.0GB \| 1.6GB`                        |
| `download.url`       |  ✓  |    ✓     |   ✓    | Where the build downloads from                                         |
| `links.sources`      |  ✓  |    ✓     |   ✓    |                                                                        |
| `links.screenshots`  |  ✓  |    ✓     |   –    |                                                                        |
| `links.supportGroup` |  ✓  |    ✓     |   ✓    |                                                                        |
| `links.donate`       |     |          |        | Optional                                                               |

Every link must be `https`, and `banner` has to point at the file itself — a link to an album or
a Drive preview page won't work.

### Inline formatting

In `author`, ROM `download.buildType`, and each `changelog`, `bugs` or `notes` item, use
`[text](https://example.com)` for links, `**text**` for bold and `*text*` for italic. Styles can
be combined. `notes` and `links.donate` remain optional.

`device` picks which phones the post says it's for. `RM6785` covers all of them; `nemo` is the
Realme 6 family and `salaa` is the Realme 7 family. `RMX2001` and `RMX2151` are the old names for
those two and still work.

## Where builds end up

Sorted by name, then by Android version for ROMs or RealmeUI version for everything else:

```
├── LineageOS
│   ├── A15
│   └── A16
│       └── LineageOS-RM6785-2026-08-17-i142.json
└── PBRP
    └── RUI2
        └── PBRP-RM6785-2023-09-03-i37.json
```

The number on the end is the issue the build was approved in.

## For maintainers

The bot's code is on the [`tooling`](../../tree/tooling) branch, along with the schema, the
examples and its own README.
