# Text Indexer and Search Front End

This is a simple text search project for searching through 1000s of my text files. 
It uses Elastic Search for searching, a small python script to send in files for indexing.
A trivial search front end written in Svelte can be served up using caddy. This also allows clicking on a link to load the text file in the browser.

## Indexing

The python script takes two command line parameters:
- a base path
- name of the index

It creates the index with a config that is predefined in the script that allows both word and phrase searches.
All text files under the hierarchy of the base path are chunked into paragraphs and indexed. 
Chunking is performed to help Elastic Search to show the snippets. When text files are large this affects performance
The downside of chunking is finding and correlating things across paragraphs, but for my trivial use case it is not a concern
The file name and path are stored in the index

## Searching

The Svelte front end fetches all index names that do not begin with a dot and populates them in a dropdown.
A single text field is provided where the user can search multiple search separated words, or phrases (within quotes)
Search results highlight the matching text, and provide a link to the text file. Clicking on the link should open the text file directly in the browser

## Hosting the search locally

*Assumption*: 
- Elastic Search is running on the default port `9200`
- The text files are all hosted under a single directory in a hierarchy. Let's call this `text_home`

### Elastic Search

In the Elastic Search config/elasticsearch.yml file add the following lines:
```
http.cors.enabled: true
http.cors.allow-origin: "*"
http.cors.allow-methods: OPTIONS, HEAD, GET, POST, PUT, DELETE
http.cors.allow-headers: X-Requested-With,X-Auth-Token,Content-Type,Content-Length
```

This allows the front end to talk to Elastic Search. 
It is also a good idea to limit the heap size for Elastic Search to 4GB.

### Front End

The Caddy web server is used to host the Svelte front end. Build the Svelte app by first installing the dependencies with `yarn install` followed by `yarn run build`. 
From the `dist` directory move the `index.html` and the `asset` directory directly into `text_home` directory under which the text files are stored.

In my case, since I index only some subsets at a time, I symlink those specific directories from `text_home` to under `/tmp`. 
The provided `Caddyfile` configuration shows the mapping from `/tmp/classic` to the hierarchy under `text_home`.
Place the `Caddyfile` also in the `text_home` directory at the same level as the `index.html` and invoke it as `caddy run`. It automatically picks up the config

Now you can point the browser to `http://localhost:3144` to reach the search front end.

The End.
