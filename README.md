# Localize.sh Markdown Processor

Markdown processor for the localize.sh ecosystem. This package parses Markdown files into a localization-friendly AST (Abstract Syntax Tree) and stringifies them back, preserving structure while allowing content extraction.

## Installation

```bash
npm install @localizesh/processor-md
```

## Usage

### As a Library

```typescript
import MdProcessor from "@localizesh/processor-md";

const processor = new MdProcessor();

const mdContent = '# Hello world';
// Parse into a Document (AST + Segments)
const document = processor.parse(mdContent);

// ... modify document segments ...

// Stringify back to Markdown
const newMdContent = processor.stringify(document);
```

### As a CLI

This package provides a binary `localize-processor-md` that works with standard I/O. It reads a protobuf `ParseRequest` or `StringifyRequest` from stdin and writes a `ParseResponse` or `StringifyResponse` to stdout, making it compatible with the localize.sh plugin system.

## Features

- **Structure Preservation**: Maintains the original structure of the Markdown document.
- **Round-trip**: Ensures that parsing and then stringifying results in the original Markdown structure, preserving as much formatting as possible.

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## License

[Apache-2.0](LICENSE)
