import { toHtml } from "hast-util-to-html";
import type { Options } from "hast-util-to-html";
import { visitParents } from "unist-util-visit-parents";

export function toHtmlSafe(node: any, options: Options = {}): string {
  const clonedNode = JSON.parse(JSON.stringify(node));
  const tree = Array.isArray(clonedNode)
    ? { type: "root", children: clonedNode }
    : clonedNode;

  visitParents(tree, "text", (node: any) => {
    node.type = "raw";
  });

  return toHtml(tree, { ...options, allowDangerousHtml: true });
}
