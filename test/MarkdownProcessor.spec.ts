import {assert} from "chai";

import fs from "fs";
import path from "path";

import MarkdownProcessor from "../src/MarkdownProcessor";

const processor = new MarkdownProcessor();

function processAndCompare(filename: string) {
  const doc = fs.readFileSync(path.join('test', 'fixtures', filename), { encoding: 'utf-8' });

  const mdast1 = processor.parse(doc);
  const md1 = processor.stringify(mdast1);
  const hast = processor.mdastToHast(mdast1);
  const mdast2 = processor.hastToMdast(hast);
  const md2 = processor.stringify(mdast2);

  assert.equal(md2, md1);

  console.log(filename);
}

describe('MarkdownProcessorTest', function() {
  it('documents should be equal', function() {
    // processAndCompare('complex.md');

    processAndCompare('headings.md');
    processAndCompare('comments.md');
    processAndCompare('code.md');
    processAndCompare('images.md');
    processAndCompare('lists.md');
    processAndCompare('tables.md');
    processAndCompare('misc.md');
  });
});
