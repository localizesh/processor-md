import { all as toMdastAll } from "rehype-remark";
import { Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import { visitParents } from "unist-util-visit-parents";

export enum ListTypes {
  ol = "ol",
  ul = "ul",
}

export const listToMdast = (h: any, node: any, type: ListTypes) => {
  const isNodeSyntaxHtml: boolean = !node.properties?.marker;

  if (isNodeSyntaxHtml) {
    const res: string = toHtml(node);
    return { type: "html", value: res };
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
};

export const linkHastToMdast = (h: any, node: any, hast?: HastRoot) => {
  const isNodeSyntaxHtml: boolean = !node.properties?.marker;
  const isLinkReference: boolean = !!node.properties?.identifier;
  const url = node.properties?.href ? node.properties?.href : "";

  if (isLinkReference && hast) {
    const children = toMdastAll(h, node);

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
    children: toMdastAll(h, node),
  };
  return element;
};

export const tableHastToMdast = (h: any, node: any) => {
  const isNodeSyntaxHtml: boolean = !node.properties?.marker;

  if (isNodeSyntaxHtml) {
    const res: string = toHtml(node);
    return { type: "html", value: res };
  }
  //@ts-ignore
  const align: String[] | undefined = node.properties?.align
    ? node.properties?.align?.split(" ")
    : undefined;

  const element: any = {
    properties: node.properties,
    align,
    type: "table",
    children: toMdastAll(h, node),
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
    children: toMdastAll(h, node),
    depth
  };
  return heading;
}
