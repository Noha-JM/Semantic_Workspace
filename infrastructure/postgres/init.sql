CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE papers (
    id SERIAL PRIMARY KEY,
    doi TEXT UNIQUE,
    title TEXT NOT NULL,
    abstract TEXT,
    publication_year INTEGER,
    venue TEXT,
    pdf_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE authors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE paper_authors (
    paper_id INTEGER REFERENCES papers(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES authors(id) ON DELETE CASCADE,
    author_order INTEGER,
    PRIMARY KEY (paper_id, author_id)
);

CREATE TABLE sections (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER REFERENCES papers(id) ON DELETE CASCADE,
    section_name TEXT,
    content TEXT
);

CREATE TABLE chunks (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER REFERENCES papers(id) ON DELETE CASCADE,
    section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
    chunk_index INTEGER,
    content TEXT,
    embedding VECTOR(384)
);

CREATE INDEX idx_papers_title ON papers USING GIN (to_tsvector('english', title));
CREATE INDEX idx_chunks_content ON chunks USING GIN (to_tsvector('english', content));