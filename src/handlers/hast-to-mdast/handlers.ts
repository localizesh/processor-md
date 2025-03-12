import {Root as HastRoot, Element as HastElement} from "hast";
import {ListItem as MdastListItem} from "mdast";
import { toHtml } from "hast-util-to-html";
import { visitParents } from "unist-util-visit-parents";

export enum ListTypes {
  ol = "ol",
  ul = "ul",
}

export const listToMdast = (h: any, hastNode: HastElement, type: ListTypes) => {
  const isNodeSyntaxHtml: boolean = !hastNode.properties?.marker;

  if (isNodeSyntaxHtml) {
    const res: string = toHtml(hastNode);
    return { type: "html", value: res };
  }

  const spread: boolean = hastNode.properties?.spread === "true";
  const ordered: boolean = type === ListTypes.ol;

  const children = h.all(hastNode);

  children.forEach((listItem: MdastListItem, index: number) => {
    const hastListItem = hastNode.children[index] as unknown as HastElement;
    if(hastListItem) {
      listItem.spread = hastListItem?.properties?.spread === "true";
    }
  })

  const element: any = {
    start: hastNode.properties?.start,
    ordered,
    spread,
    properties: hastNode.properties,
    type: "list",
    children,
  };
  return element;
};

export const linkHastToMdast = (h: any, node: any, hast?: HastRoot) => {
  const isNodeSyntaxHtml: boolean = !node.properties?.marker;
  const isLinkReference: boolean = !!node.properties?.identifier;
  const url = node.properties?.href ? node.properties?.href : "";

  if (isLinkReference && hast) {
    const children = h.all(node);

    visitParents(
      hast,
      (child) =>
        child.type === "definition" &&
        "identifier" in child &&
        child.identifier === node.properties?.identifier,
      (definition: any, _) => {
        definition.url = url;
      }
    );

    return {
      type: "linkReference",
      identifier: node.properties?.identifier,
      install: node.properties?.identifier,
      url: node.properties?.url,
      children,
    };
  }

  if (isNodeSyntaxHtml) {
    const res: string = toHtml(node);
    return { type: "html", value: res };
  }

  const element: any = {
    properties: node.properties,
    url,
    type: "link",
    children: h.all(node),
  };
  return element;
};

export const tableHastToMdast = (h: any, node: any) => {
  const isNodeSyntaxHtml: boolean = !node.properties?.marker;

  if (isNodeSyntaxHtml) {
    const res: string = toHtml(node);
    return { type: "html", value: res };
  }

  const align: Array<string | null> | undefined = node.properties?.align
    ? JSON.parse(node.properties?.align)
    : undefined;

  const element: any = {
    properties: node.properties,
    align,
    type: "table",
    children: h.all(node),
  };
  return element;
};

export const divHastToMdast = (h: any, node: any) => {
  const element: any = {
    type: "html",
    value: toHtml(node),
  };
  return element;
};

export const headerHastToMdast = (h: any, node: any) => {
  const depth = Number(node.tagName.charAt(1)) || 1
  let heading: any = {
    properties: node.properties,
    type: "heading",
    children: h.all(node),
    depth
  };
  return heading;
}
