import os
import click
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk, BulkIndexError

def create_index(es, index_name):
    """Creates an index in Elasticsearch with a mapping for phrase matching."""
    if not es.indices.exists(index=index_name):
        es.indices.create(
            index=index_name,
            body={
                "mappings": {
                    "properties": {
                        "filepath": {"type": "keyword"},
                        "filename": {"type": "keyword"},
                        "content": {"type": "text"}
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

    actions = [
        {
            "_index": index_name,
            "_source": {
                "filepath": filepath,
                "filename": filename,
                "content": chunk
            }
        }
        for chunk in chunks
    ]

    try:
        bulk(es, actions)
        click.echo(f"Indexed {len(chunks)} chunks for file: {filename}")
    except BulkIndexError as e:
        click.echo(f"Error indexing file {filename}: {e}", err=True)

@click.command()
@click.option('--host', default='http://localhost:9200', help='Elasticsearch host URL')
@click.argument('index_name', type=str, required=True)
@click.argument('base_path', type=click.Path(exists=True, file_okay=False, dir_okay=True), required=True)
def main(host, index_name, base_path):
    """Index text files from BASE_PATH into Elasticsearch under INDEX_NAME."""
    es = Elasticsearch([host])

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