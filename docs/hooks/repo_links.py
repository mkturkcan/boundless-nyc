"""MkDocs hook. Some site pages include files from outside docs/ (BUILDING.md, ACKNOWLEDGEMENTS.md, boundlessjs/*.md),
whose relative links are written against the repository. On those pages, links to files that are also site pages are
pointed at the pages, and links to any other repository file are pointed at GitHub."""
import os
import posixpath
import re

REPO = "https://github.com/mkturkcan/boundless-nyc"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = {  # repository path -> site page (directory URL)
    "BUILDING.md": "building/",
    "ACKNOWLEDGEMENTS.md": "acknowledgements/",
    "boundlessjs/DATA_SOURCES.md": "data-sources/",
    "boundlessjs/README.md": "client/",
    "docs/api/getting_started.md": "api/getting_started/",
    "docs/api/python_api.md": "api/python_api/",
    "docs/api/protocol.md": "api/protocol/",
}
INCLUDED = {  # site page -> repository directory of the file it includes
    "building.md": "", "acknowledgements.md": "", "data-sources.md": "boundlessjs", "client.md": "boundlessjs",
}
HREF = re.compile(r'href="([^"#]*)(#[^"]*)?"')


def on_page_content(html, page, config, files):
    base = INCLUDED.get(page.file.src_uri)
    if base is None:
        return html
    up = "../" * page.url.count("/")

    def fix(m):
        href, frag = m.group(1), m.group(2) or ""
        if not href or re.match(r"^[a-z]+:", href) or href.startswith("/"):
            return m.group(0)
        rel = posixpath.normpath(posixpath.join(base, href))
        if rel.startswith(".."):
            return m.group(0)
        if rel in SITE:
            return f'href="{up}{SITE[rel]}{frag}"'
        full = os.path.join(ROOT, *rel.split("/"))
        if os.path.exists(full):
            return f'href="{REPO}/{"tree" if os.path.isdir(full) else "blob"}/main/{rel}{frag}"'
        return m.group(0)

    return HREF.sub(fix, html)
