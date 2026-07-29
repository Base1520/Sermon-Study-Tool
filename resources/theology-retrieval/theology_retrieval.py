#!/usr/bin/env python3
"""Local, citation-first theological text retrieval.

The index deliberately separates primary/source text from vault synthesis. It uses
SQLite FTS5 so retrieval works offline and does not require an embedding provider.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "library.sqlite3"


@dataclass
class Source:
    source_id: str
    title: str
    author: str
    publication_year: str
    edition: str
    source_type: str
    rights_tier: str
    rights_note: str
    canonical_url: str
    local_path: str
    sha256: str


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publication_year TEXT NOT NULL DEFAULT '',
  edition TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL,
  rights_tier TEXT NOT NULL,
  rights_note TEXT NOT NULL,
  canonical_url TEXT NOT NULL DEFAULT '',
  local_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chunks (
  chunk_id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  locator TEXT NOT NULL,
  heading TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  UNIQUE(source_id, ordinal)
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content, heading, source_id UNINDEXED, locator UNINDEXED,
  content='chunks', content_rowid='chunk_id', tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content, heading, source_id, locator)
  VALUES (new.chunk_id, new.content, new.heading, new.source_id, new.locator);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content, heading, source_id, locator)
  VALUES ('delete', old.chunk_id, old.content, old.heading, old.source_id, old.locator);
END;
"""


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    return db


def normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def strip_gutenberg_wrapper(text: str) -> str:
    start = re.search(r"\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*", text, re.I)
    end = re.search(r"\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*", text, re.I)
    if start:
        text = text[start.end():]
    if end:
        text = text[:end.start()]
    return text


def chunks(text: str, target: int = 1800, overlap_paragraphs: int = 1):
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    current: list[str] = []
    size = 0
    heading = ""
    ordinal = 0
    for para in paragraphs:
        if len(para) < 140 and (para.isupper() or re.match(r"^(chapter|book|section|homily|verse)\b", para, re.I)):
            heading = para[:240]
        if current and size + len(para) > target:
            body = "\n\n".join(current)
            yield ordinal, heading, body
            ordinal += 1
            current = current[-overlap_paragraphs:] if overlap_paragraphs else []
            size = sum(len(p) for p in current)
        current.append(para)
        size += len(para)
    if current:
        yield ordinal, heading, "\n\n".join(current)


def portable_source_path(local: Path, manifest_path: Path) -> str:
    """Path to record in the DB for provenance.

    PRIVACY: library.sqlite3 is a shipped artifact. An absolute path in it
    discloses the operator's account name and where the private source tree
    lives on disk, so record the manifest-relative path instead. Nothing reads
    this column at query time — it is provenance only.
    """
    try:
        return local.relative_to(manifest_path.parent.resolve()).as_posix()
    except ValueError:
        return local.name


def add_source(db: sqlite3.Connection, manifest_path: Path) -> None:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    local = (manifest_path.parent / data["local_path"]).resolve()
    raw = local.read_text(encoding=data.get("encoding", "utf-8"), errors="replace")
    text = normalize(strip_gutenberg_wrapper(raw) if data.get("strip_gutenberg") else raw)
    digest = hashlib.sha256(raw.encode("utf-8", errors="replace")).hexdigest()
    source = Source(
        source_id=data["source_id"], title=data["title"], author=data["author"],
        publication_year=str(data.get("publication_year", "")), edition=data.get("edition", ""),
        source_type=data["source_type"], rights_tier=data["rights_tier"],
        rights_note=data["rights_note"], canonical_url=data.get("canonical_url", ""),
        local_path=portable_source_path(local, manifest_path), sha256=digest,
    )
    if source.rights_tier not in {"public_domain", "licensed", "owned_private", "vault_synthesis"}:
        raise SystemExit(f"Unsupported rights_tier: {source.rights_tier}")
    with db:
        db.execute("DELETE FROM sources WHERE source_id = ?", (source.source_id,))
        db.execute(
            "INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
            tuple(asdict(source).values()),
        )
        for ordinal, heading, body in chunks(text, int(data.get("chunk_chars", 1800))):
            locator = f"text chunk {ordinal + 1}"
            db.execute(
                "INSERT INTO chunks(source_id, ordinal, locator, heading, content) VALUES (?,?,?,?,?)",
                (source.source_id, ordinal, locator, heading, body),
            )
    count = db.execute("SELECT count(*) FROM chunks WHERE source_id=?", (source.source_id,)).fetchone()[0]
    print(f"Indexed {source.source_id}: {count} chunks")


def fts_query(query: str) -> str:
    terms = re.findall(r"[\w]+", query, re.UNICODE)
    if not terms:
        raise SystemExit("Query contains no searchable terms")
    return " OR ".join(f'"{term}"' for term in terms)


def search(db: sqlite3.Connection, query: str, limit: int, source_type: str | None) -> list[dict]:
    where = "AND s.source_type = ?" if source_type else ""
    params: list[object] = [fts_query(query)]
    if source_type:
        params.append(source_type)
    params.append(limit)
    rows = db.execute(f"""
      SELECT c.chunk_id, c.ordinal, c.locator, c.heading, c.content,
             s.source_id, s.title, s.author, s.publication_year, s.edition,
             s.source_type, s.rights_tier, s.canonical_url,
             bm25(chunks_fts, 1.0, 0.5) AS score
      FROM chunks_fts
      JOIN chunks c ON c.chunk_id = chunks_fts.rowid
      JOIN sources s ON s.source_id = c.source_id
      WHERE chunks_fts MATCH ? {where}
      ORDER BY score LIMIT ?
    """, params).fetchall()
    return [dict(row) for row in rows]


def render(results: list[dict], as_json: bool) -> None:
    if as_json:
        print(json.dumps({"results": results}, ensure_ascii=False, indent=2))
        return
    for idx, row in enumerate(results, 1):
        citation = f'{row["author"]}, {row["title"]}'
        if row["publication_year"]:
            citation += f' ({row["publication_year"]})'
        citation += f', {row["locator"]}'
        print(f"\n[{idx}] {citation}")
        print(f"    source={row['source_id']} rights={row['rights_tier']} type={row['source_type']}")
        if row["canonical_url"]:
            print(f"    {row['canonical_url']}")
        print("    " + row["content"].replace("\n", " ")[:700])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    add = sub.add_parser("add")
    add.add_argument("manifest", type=Path)
    query = sub.add_parser("query")
    query.add_argument("text")
    query.add_argument("--limit", type=int, default=8)
    query.add_argument("--source-type")
    query.add_argument("--json", action="store_true")
    sub.add_parser("stats")
    args = parser.parse_args()
    db = connect(args.db)
    if args.command == "init":
        print(f"Initialized {args.db}")
    elif args.command == "add":
        add_source(db, args.manifest.resolve())
    elif args.command == "query":
        render(search(db, args.text, args.limit, args.source_type), args.json)
    elif args.command == "stats":
        row = db.execute("SELECT count(*) sources, (SELECT count(*) FROM chunks) chunks FROM sources").fetchone()
        print(json.dumps(dict(row), indent=2))


if __name__ == "__main__":
    try:
        main()
    except sqlite3.OperationalError as exc:
        print(f"Database error: {exc}", file=sys.stderr)
        raise SystemExit(2)
