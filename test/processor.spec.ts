import {assert} from "chai";
import eol from "eol";

import fs from "fs";
import path from "path";

import MdProcessor from "../src/processor.js";

const processor = new MdProcessor();

function processAndCompare(filename: string) {
  const inDoc = fs.readFileSync(path.join('test', 'fixtures', filename), { encoding: 'utf-8' });

  const doc = processor.parse(inDoc);
  const docStr = JSON.stringify(doc);

  const outDoc = processor.stringify(doc);
  const outDocStructure = processor.parse(outDoc);
  const outDocStructureStr = JSON.stringify(outDocStructure);

  assert.equal(outDocStructureStr, docStr);
  console.log(filename);
}

function processAndCompareWithExpected(filename: string) {
  const inDoc = eol.lf(fs.readFileSync(path.join('test', 'fixtures', filename), { encoding: 'utf-8' }));
  const inDocExpected = eol.lf(fs.readFileSync(path.join('test', 'expected', filename), { encoding: 'utf-8' }));


  const doc = processor.parse(inDoc);
  const outDoc = processor.stringify(doc);

  assert.equal(outDoc, inDocExpected);
  console.log(filename);
}

describe('MdProcessorTest', function() {
  it('documents should be equal', function() {
    processAndCompare('md-html-complex.md');
    processAndCompare('html-links.md');
    processAndCompare('simple-test.md');
    processAndCompare('link.md');
    processAndCompare('headings.md');
    processAndCompare('comments.md');
    processAndCompare('code.md');
    processAndCompare('images.md');
    processAndCompare('images-html.md');
    processAndCompare('lists.md');
    processAndCompare('tables.md');
    processAndCompare('gfm-table.md');
    processAndCompare('misc.md');
    processAndCompare('frontmatter.md');
    processAndCompare('footnote.md');
    processAndCompare('task-list.md');
    processAndCompare('thematic-break.md');
    processAndCompare('break.md');
    processAndCompare('description-list.md');
  });
});



