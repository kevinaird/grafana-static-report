# Grafana Static Report

A command line utility for converting a live Grafana Dashboard to a static mhtml report file. Also exports a json of all datasource data.

Still a work in progress.

## Usage

### Node v20

Installation steps
````js
npm i --global
npx puppeteer browsers install chrome
````

Usage
````sh
grafana-report exec <url> ( -o <whereToOutput> )

# Example
grafana-report exec https://play.grafana.org/d/a42e82b0-1971-4dc9-8a74-7577142f19a3/8b9cb853-54c5-51bb-b17e-8bab90267e5f
````

### Docker

To build
````javascript
docker build --tag=kevinaird/grafana-report .
````

To run
````javascript
docker run --rm \
 --name grafana-report \
 -v path/to/output:/output \
 kevinaird/grafana-report exec https://play.grafana.org/d/a42e82b0-1971-4dc9-8a74-7577142f19a3/8b9cb853-54c5-51bb-b17e-8bab90267e5f \
 -o /output/dashboard
````