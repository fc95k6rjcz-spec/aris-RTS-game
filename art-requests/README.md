Drop a `<name>.json` here and push; the "Generate art" GitHub Action makes the
picture and commits it as `art-src/generated/<name>.png`.

    { "prompt": "…", "size": "1536x1024", "quality": "high", "refs": ["art-src/walls/sheet-straight.png"] }

`size` is 1024x1024, 1536x1024 or 1024x1536. `refs` (optional) are images in the
repo to match style against. Needs the OPENAI_API_KEY repository secret.
