import { assert, describe, it } from "vitest";
import eol from "eol";

import fs from "fs";
import path from "path";

import MdProcessor from "../src/processor.js";

const processor = new MdProcessor();

function processAndCompare(filename: string) {
  const inDoc = fs.readFileSync(path.join("test", "fixtures", filename), {
    encoding: "utf-8",
  });

  const doc = processor.parse(inDoc);
  const docStr = JSON.stringify(doc);

  const outDoc = processor.stringify(doc);
  const outDocStructure = processor.parse(outDoc);
  const outDocStructureStr = JSON.stringify(outDocStructure);

  assert.equal(outDocStructureStr, docStr);
  console.log(filename);
}

function processAndCompareWithExpected(filename: string) {
  const inDoc = eol.lf(
    fs.readFileSync(path.join("test", "fixtures", filename), {
      encoding: "utf-8",
    }),
  );
  const inDocExpected = eol.lf(
    fs.readFileSync(path.join("test", "expected", filename), {
      encoding: "utf-8",
    }),
  );

  const doc = processor.parse(inDoc);
  const outDoc = processor.stringify(doc);

  assert.equal(outDoc, inDocExpected);
  console.log(filename);
}

describe("MdProcessorTest", function () {
  const files = [
    "book-test.md",
    "md-html-complex.md",
    "html-links.md",
    "simple-test.md",
    "link.md",
    "headings.md",
    "comments.md",
    "code.md",
    "images.md",
    "images-html.md",
    "lists.md",
    "tables.md",
    "gfm-table.md",
    "misc.md",
    "frontmatter.md",
    "footnote.md",
    "task-list.md",
    "thematic-break.md",
    "break.md",
    "description-list.md",
  ];

  files.forEach((filename) => {
    it(`should process ${filename} correctly`, function () {
      processAndCompare(filename);
    });
  });
});
