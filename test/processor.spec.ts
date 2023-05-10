import {assert} from "chai";

import fs from "fs";
import path from "path";

import MdProcessor from "../src/processor.js";

const processor = new MdProcessor();

function processAndCompare(filename: string, filenameDocument: string) {
  const inDoc = fs.readFileSync(path.join('test', 'fixtures', filename), { encoding: 'utf-8' });
  const expectedDoc = fs.readFileSync(path.join('test', 'fixtures', 'documents', filenameDocument), { encoding: 'utf-8' });
  const expectedDocumentJson = JSON.parse(expectedDoc);
  const expectedDocument = JSON.stringify(expectedDocumentJson);

  const doc = processor.parse(inDoc);

  const outDoc = JSON.stringify(doc);

  assert.equal(outDoc, expectedDocument);

  console.log(filename);
}

describe('MdProcessorTest', function() {
  it('documents should be equal', function() {
    processAndCompare('simple-test.md', 'simple-test.json');
    processAndCompare('headings.md', 'headings.json');
    processAndCompare('comments.md', 'comments.json');
    processAndCompare('code.md', 'code.json');
    processAndCompare('images.md', 'images.json');
    processAndCompare('lists.md', 'lists.json');
    processAndCompare('tables.md', 'tables.json');
    processAndCompare('misc.md', 'misc.json');
  });
});



