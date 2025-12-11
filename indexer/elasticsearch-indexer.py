import os
import re
import click
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk, BulkIndexError

def extract_coded_tags(text):
    """Extracts coded tags from text (combinations of b,g,m,f with +,/ and keywords)."""
    # Pattern for letter combinations with symbols
    pattern = r'\b(?![mM]+\b)(?:[mMfFbBgG]{2,}|[mMfFbBgG]+[+/][mMfFbBgG]+(?:[+/][mMfFbBgG]+)*)\b'
    tags = []
    keywords_set = set()
    specific_keywords = ['nc', 'inc']
    # Process each line separately
    for line in text.split('\n'):
        # Check for "tags:" or "Tags:" in the line
        tags_match = re.search(r'\btags:\s*(.+)', line, re.IGNORECASE)
        if tags_match:
            # Extract comma-separated tags after "tags:"
            comma_tags = tags_match.group(1)
            # Split by comma and strip whitespace
            comma_separated = [tag.strip() for tag in comma_tags.split(',') if tag.strip()]
            tags.extend(comma_separated)
            continue  # Move to next line after processing tags line
        
        # Check if this line contains the pattern
        line_tags = re.findall(pattern, line)
        if line_tags:
            # Add the letter combination tags from this line
            tags.extend(line_tags)
            # Extract all hyphenated words from this line only
            words = re.findall(r'\b[\w-]+\b', line)
            keywords_set.update(words)
            # Check for specific keywords in this same line
            line_lower = line.lower()
            for keyword in specific_keywords:
                if keyword in line_lower:
                    # Find all case variations of the keyword in this line
                    keywords_set.update(re.findall(r'\b' + keyword + r'\b', line, re.IGNORECASE))
    
    # Add keywords to tags list (only if we found pattern matches)
    if keywords_set:
        tags.extend(list(keywords_set))
    
    return tags


def normalize_tag(tag):
    """Normalizes a tag by removing symbols for fuzzy matching."""
    return re.sub(r'[+/]', '', tag)

def create_index(es, index_name):
    """Creates an index in Elasticsearch with a mapping for phrase matching."""
    if not es.indices.exists(index=index_name):
        es.indices.create(
            index=index_name,
            body={
                "settings": {
                    "analysis": {
                        "analyzer": {
                            "mixed_analyzer": {
                                "type": "custom",
                                "tokenizer": "standard",
                                "filter": ["lowercase"]
                            },
                            "exact_analyzer": {
                                "type": "custom",
                                "tokenizer": "whitespace",
                                "filter": []
                            },
                            "tag_normalizer": {
                                "type": "custom",
                                "tokenizer": "keyword",
                                "filter": ["lowercase"]
                            }
                        }
                    }
                },
                "mappings": {
                    "properties": {
                        "filepath": {"type": "keyword"},
                        "filename": {"type": "keyword"},
                        "content": {
                            "type": "text",
                            "analyzer": "mixed_analyzer",
                            "fields": {
                                "exact": {
                                    "type": "text",
                                    "analyzer": "exact_analyzer"
                                }
                            }
                        },
                        "coded_tags": {
                            "type": "keyword"
                        },
                        "coded_tags_normalized": {
                            "type": "keyword"
                        }
                    }
                }
            }
        )

def split_text_into_chunks(text, max_chunk_size=10000):
    """Splits the text into smaller chunks on paragraph boundaries."""
    chunks = []
    paragraphs = text.splitlines()

    current_chunk = ""
    for para in paragraphs:
        if len(current_chunk) + len(para) + 1 <= max_chunk_size * 1.1:
            current_chunk += para + '\n'
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = para + '\n'

    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks

def index_file(es, index_name, filepath):
    """Reads a file, splits it into chunks, and indexes them in Elasticsearch."""
    filename = os.path.basename(filepath)
    try:
        with open(filepath, 'r', encoding='utf-8') as file:
            text = file.read()
    except UnicodeDecodeError:
        with open(filepath, 'r', encoding='latin-1') as file:
            text = file.read()

    chunks = split_text_into_chunks(text)

    actions = []
    for chunk in chunks:
        tags = extract_coded_tags(chunk)
        tags_normalized = [normalize_tag(tag) for tag in tags]
        
        actions.append({
            "_index": index_name,
            "_source": {
                "filepath": filepath,
                "filename": filename,
                "content": chunk,
                "coded_tags": tags,
                "coded_tags_normalized": tags_normalized
            }
        })

    # Send in batches of 100 instead of all at once
    batch_size = 100
    for i in range(0, len(actions), batch_size):
        batch = actions[i:i + batch_size]
        try:
            bulk(es, batch, request_timeout=60)
            click.echo(f"Indexed batch {i//batch_size + 1} ({len(batch)} chunks) for file: {filename}")
        except BulkIndexError as e:
            click.echo(f"Error indexing batch for file {filename}: {e}", err=True)
            
@click.command()
@click.option('--host', default='http://localhost:9200', help='Elasticsearch host URL')
@click.argument('index_name', type=str, required=True)
@click.argument('base_path', type=click.Path(exists=True, file_okay=False, dir_okay=True), required=True)
def main(host, index_name, base_path):
    """Index text files from BASE_PATH into Elasticsearch under INDEX_NAME."""
    es = Elasticsearch(
        [host],
        request_timeout=60,  # Increase request timeout to 60 seconds
        max_retries=3,
        retry_on_timeout=True
    )
    
    if not es.ping():
        click.echo("Elasticsearch server is not reachable. Please ensure it is running.", err=True)
        return

    create_index(es, index_name)

    for root, _, files in os.walk(base_path):
        for file in files:
            if file.endswith(".txt"):
                filepath = os.path.join(root, file)
                index_file(es, index_name, filepath)

if __name__ == "__main__":
    main()
