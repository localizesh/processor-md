import {assert} from "chai";

import fs from "fs";
import path from "path";

import LocalizeProcessor from "../src/LocalizeProcessor.js";

const localizeParser = new LocalizeProcessor();

function processAndCompare(filename: string, filenameCustomStructure: string) {
  const doc = fs.readFileSync(path.join('test', 'fixtures', filename), { encoding: 'utf-8' });
  const expectedSegmentStructureDoc = fs.readFileSync(path.join('test', 'fixtures', 'segmentStructures', filenameCustomStructure), { encoding: 'utf-8' });
  const expectedSegmentStructureJson = JSON.parse(expectedSegmentStructureDoc)
  const expectedSegmentStructure = JSON.stringify(expectedSegmentStructureJson)

  const segmentStructure = localizeParser.parse(doc)

  const actualSegmentStructure = localizeParser.stringify(segmentStructure)

  assert.equal(actualSegmentStructure, expectedSegmentStructure);

  console.log(filename);
}

describe('LocalizeParserTest', function() {
  it('documents should be equal', function() {

    processAndCompare('simpleTest.md', 'simpleTest.json');
    processAndCompare('headings.md', 'headings.json');
    processAndCompare('comments.md', 'comments.json');
    processAndCompare('code.md', 'code.json');
    processAndCompare('images.md', 'images.json');
    processAndCompare('lists.md', 'lists.json');
    processAndCompare('tables.md', 'tables.json');
    processAndCompare('misc.md', 'misc.json');
  });
});



