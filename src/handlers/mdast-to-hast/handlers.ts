import {Heading, Paragraph} from "mdast";
import { Element } from "hast";

export const segmentParentNodeToHast =
  (state: any, node: Heading | Paragraph, segment: any, tagName: string) => {

  node.children = segment ? [segment] : [];

  const resultHast: Element = {
    type: "element",
    tagName: tagName,
    properties: segment?.attributes || {},
    children: state.all(node),
  };
  return resultHast;
}
