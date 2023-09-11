import { Heading, Paragraph } from "mdast";
import { Element } from "hast";

export const segmentParentNodeToHast = (
  state: any,
  node: Heading | Paragraph,
  segment: any,
  tagName: string
): any => {
  node.children = segment ? [segment] : [];

  const resultHast: Element = {
    type: "element",
    tagName: tagName,
    properties: segment?.tags || {},
    children: state.all(node),
  };
  if("marker" in node) {
    //@ts-ignore
    resultHast.properties.marker = node.marker
  }
  return resultHast;
};
