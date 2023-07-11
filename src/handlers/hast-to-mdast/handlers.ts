import {all as toMdastAll} from "rehype-remark";
import { Element } from "hast";
import {toHtml} from 'hast-util-to-html';

export enum ListTypes {
  ol = "ol",
  ul = "ul",
}

export const listToMdast = (h: any, node: Element, type: ListTypes) => {
  const isNodeSyntaxHtml: boolean = !node.properties?.marker;

  if(isNodeSyntaxHtml) {
    const res: string = toHtml(node);
    return {type: "html", value: res};
  }

  const spread: boolean = node.properties?.spread === "true";
  const ordered: boolean = type === ListTypes.ol ? true : false;
  const element: any = {
    start: node.properties?.start,
    ordered,
    spread,
    properties: node.properties,
    type: "list",
    children: toMdastAll(h, node),
  };
  return element;
}

export const linkHastToMdast = (h: any, node: Element) => {
  const isNodeSyntaxHtml: boolean = !node.properties?.marker;

  if(isNodeSyntaxHtml) {
    const res: string = toHtml(node);
    return {type: "html", value: res};
  }

  const url = node.properties?.href ? node.properties?.href : "";
  const element: any = {
    properties: node.properties,
    url,
    type: "link",
    children: toMdastAll(h, node),
  };
  return element;
}

export const tableHastToMdast = (h: any, node: Element) => {
  const isNodeSyntaxHtml: boolean = !node.properties?.marker;

  if(isNodeSyntaxHtml) {
    const res: string = toHtml(node);
    return {type: "html", value: res};
  }
  //@ts-ignore
  const align: String[] | undefined = node.properties?.align ? node.properties?.align?.split(" ") : undefined;

  const element: any = {
    properties: node.properties,
    align,
    type: "table",
    children: toMdastAll(h, node),
  };
  return element;
}
