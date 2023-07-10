import {all as toMdastAll} from "rehype-remark";
import { Element } from "hast";
import {toHtml} from 'hast-util-to-html';

export enum ListTypes {
  ol = "ol",
  ul = "ul",
}

export const listToMdast = (h: any, node: Element, type: ListTypes) => {
  const spread: boolean = node.properties?.spread === "true";
  const isNodeSyntaxHtml: boolean = !node.properties?.marker;

  if(isNodeSyntaxHtml) {
    const res: string = toHtml(node);
    return {type: "html", value: res};
  }

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
