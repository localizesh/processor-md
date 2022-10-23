import {unified} from "unified";

import parse from "remark-parse";
import remark2rehype from "remark-rehype";
import rehype2remark from "rehype-remark";
import raw from "rehype-raw";
import sanitize from "rehype-sanitize";
import stringify from "remark-stringify";
import gfm from "remark-gfm";

import {Root as MdastRoot} from "mdast";
import {Root as HastRoot} from "hast";

import Processor from "./Processor.js";

class MarkdownProcessor implements Processor<MdastRoot> {

  public parse(doc: string) {
    return unified()
      .use(parse)
      .use(gfm)
      .parse(doc) as MdastRoot
  }

  public stringify(tree: MdastRoot) {
    return unified()
      .use(gfm)
      .use(stringify)
      .stringify(tree) as string;
  }

  public mdastToHast(tree: MdastRoot): HastRoot {
    return unified()
      .use(remark2rehype, { allowDangerousHtml: true })
      .use(raw)
      .use(sanitize)
      .runSync(tree) as HastRoot;
  }

  public hastToMdast(tree: HastRoot): MdastRoot {
    return unified()
      .use(rehype2remark, { newlines: true })
      .runSync(tree) as MdastRoot;
  }
}

export default MarkdownProcessor;
