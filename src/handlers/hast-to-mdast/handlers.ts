import {all as toMdastAll} from "rehype-remark";
import { Element } from "hast";

export enum ListTypes {
  ol = "ol",
  ul = "ul",
}

export const listToMdast = (h: any, node: Element, type: ListTypes) => {
  const spread: boolean = node.properties?.spread === "true";

  let element: any = {
    start: node.properties?.start,
    ordered: type === ListTypes.ol ? true : false,
    spread,
    properties: node.properties,
    type: "list",
    children: toMdastAll(h, node),
  };
  return element;
}
